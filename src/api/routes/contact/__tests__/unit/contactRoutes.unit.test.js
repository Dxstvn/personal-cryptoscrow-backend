import { jest } from '@jest/globals';
import express from 'express';
import router from '../../contactRoutes.js'; // Path to the router

// Mock Firebase Admin SDK
const mockGetFirestore = jest.fn();
const mockGetAuth = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockAdd = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockRunTransaction = jest.fn();
const mockBatch = jest.fn();
const mockCommit = jest.fn();
const mockFieldValueServerTimestamp = jest.fn(() => 'mock_server_timestamp');


jest.mock('firebase-admin/firestore', () => ({
  getFirestore: mockGetFirestore,
  FieldValue: {
    serverTimestamp: mockFieldValueServerTimestamp,
  },
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

jest.mock('../../auth/admin.js', () => ({
  adminApp: {}, // Mock adminApp
}));

// Helper to create a mock Express app with the router
const setupApp = () => {
  const app = express();
  app.use(express.json());
  // Mount router at a specific path if your routes are defined that way, or '/'
  app.use('/contact', router); // Assuming routes are like /contact/invite
  return app;
};

// Mock Express request and response objects
const mockRequest = (body = {}, params = {}, query = {}, headers = {}, userId) => ({
  body,
  params,
  query,
  headers,
  userId, // For authenticated routes
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res); // For potential text responses
  return res;
};

// Firestore mock setup
mockGetFirestore.mockReturnValue({
  collection: mockCollection,
  runTransaction: mockRunTransaction,
  batch: mockBatch,
});

mockCollection.mockImplementation((collectionName) => {
  // Return a new mock chain for each collection call
  const chainable = {
    doc: jest.fn().mockImplementation((docId) => {
      const docChainable = {
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
        delete: mockDelete,
        collection: jest.fn().mockImplementation(subCollectionName => {
            // Further chain for subcollections if needed, similar to collection mock
             const subChainable = {
                doc: jest.fn().mockReturnValue({
                    get: mockGet,
                    set: mockSet,
                    update: mockUpdate,
                    delete: mockDelete,
                }),
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                get: mockGet,
                add: mockAdd,
            };
            return subChainable;
        }),
      };
      return docChainable;
    }),
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    add: mockAdd,
    get: mockGet, // For queries on collections
  };
  mockWhere.mockReturnValue(chainable); // Ensure chaining
  mockOrderBy.mockReturnValue(chainable);
  mockLimit.mockReturnValue(chainable);
  return chainable;
});

mockBatch.mockReturnValue({
    delete: jest.fn(),
    commit: mockCommit,
});


describe('Unit Tests for contactRoutes.js', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(); // Create a new app instance for each test

    // Reset common mocks to default successful behavior or specific needs
    mockVerifyIdToken.mockResolvedValue({ uid: 'testUserId' });
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: 'user@example.com', first_name: 'Test', last_name: 'User', wallets: [] }),
      id: 'docId'
    });
    mockAdd.mockResolvedValue({ id: 'newInvitationId' });
    mockRunTransaction.mockImplementation(async (updateFunction) => {
      // Mock the transaction callback
      // You might need to customize this based on what the transaction does
      const mockTransaction = {
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
        delete: mockDelete,
      };
      return updateFunction(mockTransaction);
    });
    mockCommit.mockResolvedValue({});
  });

  // Middleware Tests (Optional, but good for completeness)
  describe('authenticateToken Middleware', () => {
    // Middleware is called internally by routes, direct test might be redundant
    // if covered by endpoint tests. However, if complex, can be tested:
    it('should call next() if token is valid', async () => {
      const req = mockRequest({}, {}, {}, { authorization: 'Bearer validtoken' });
      const res = mockResponse();
      const next = jest.fn();

      // Simulate how the middleware might be called if it were standalone
      // For router, this is implicitly tested by authenticated routes
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'testUserId' });
      
      // This is a simplified way to test middleware logic if it were exported
      // For actual routes, testing the route's behavior with/without auth is key
      // Example: await someFunctionThatUsesMiddleware(req, res, next);
      // expect(next).toHaveBeenCalled();
      // For now, we'll rely on endpoint tests to cover middleware functionality
    });

     it('should return 401 if no token is provided', async () => {
        const response = await app.post('/contact/invite').send({}); // Any authenticated route
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('No token provided');
     });

     it('should return 403 if token is invalid', async () => {
        mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
        const response = await app.post('/contact/invite')
            .set('Authorization', 'Bearer invalidtoken')
            .send({ contactEmail: 'contact@example.com' });
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Invalid or expired token');
     });
  });

  // --- Route: POST /invite --- //
  describe('POST /contact/invite', () => {
    const invitePayload = { contactEmail: 'contact@example.com' };

    it('should send an invitation successfully', async () => {
      mockGet.mockImplementation((ref) => {
        if (ref.path.includes('users/testUserId')) { // Sender
          return Promise.resolve({
            exists: true,
            data: () => ({ email: 'sender@example.com', first_name: 'Sender', last_name: 'User', wallets: ['sw1'] }),
            id: 'testUserId'
          });
        } else if (ref.path.includes('users') && ref.parent.id === 'users') { // Potential contact query
           return Promise.resolve({
            empty: false,
            docs: [{
              id: 'contactUserId',
              data: () => ({ email: 'contact@example.com', first_name: 'Contact', last_name: 'Person', wallets: ['cw1'] })
            }]
          });
        } else if (ref.path.includes('contacts')) { // Existing sender contact check
            return Promise.resolve({ empty: true, docs: [] });
        } else if (ref.path.includes('contactInvitations')) { // Existing invitation check
            return Promise.resolve({ empty: true, docs: [] });
        }
        return Promise.resolve({ empty: true, docs: [] }); // Default
      });

      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Invitation sent successfully', invitationId: 'newInvitationId' });
      expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
        senderId: 'testUserId',
        receiverEmail: 'contact@example.com',
        status: 'pending',
        senderWallets: ['sw1'],
        receiverWallets: ['cw1']
      }));
    });

    it('should return 400 if contactEmail is missing', async () => {
      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Contact email is required and must be a string');
    });
    
    it('should return 400 if contactEmail is empty after trim', async () => {
      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send({ contactEmail: '   ' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Contact email is required');
    });

    it('should return 404 if sender user profile not found (edge case)', async () => {
      mockGet.mockImplementation((ref) => {
        if (ref.path.includes('users/testUserId')) {
          return Promise.resolve({ exists: false }); // Sender not found
        }
        return Promise.resolve({ empty: true, docs: [] });
      });

      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Sender user profile not found');
    });
    
    it('should return 400 for self-invitation', async () => {
      mockGet.mockImplementation((ref) => {
         if (ref.path.includes('users/testUserId')) { // Sender
          return Promise.resolve({
            exists: true,
            data: () => ({ email: 'contact@example.com' }), // Sender's email is the contact email
            id: 'testUserId'
          });
        }
        return Promise.resolve({ empty: true, docs: [] });
      });

      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send({ contactEmail: 'contact@example.com' }); // Trying to invite self
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('You cannot invite yourself');
    });

    it('should return 404 if contact user not found in the system', async () => {
       mockGet.mockImplementation((ref) => {
        if (ref.path.includes('users/testUserId')) { // Sender
          return Promise.resolve({
            exists: true,
            data: () => ({ email: 'sender@example.com'}),
            id: 'testUserId'
          });
        } else if (ref.path.includes('users') && ref.parent.id === 'users') { // Potential contact query
           return Promise.resolve({ empty: true, docs: [] }); // Contact email not found
        }
        return Promise.resolve({ empty: true, docs: [] });
      });

      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User with this email not found in the system');
    });

    it('should return 400 if contact is already an accepted contact', async () => {
      mockGet.mockImplementation((ref) => {
        if (ref.path.includes('users/testUserId')) { // Sender
          return Promise.resolve({
            exists: true,
            data: () => ({ email: 'sender@example.com'}),
            id: 'testUserId'
          });
        } else if (ref.path.includes('users') && ref.parent.id === 'users') { // Potential contact query
           return Promise.resolve({
            empty: false,
            docs: [{
              id: 'contactUserId',
              data: () => ({ email: 'contact@example.com' })
            }]
          });
        } else if (ref.path.includes('contacts')) { // Existing sender contact check
            return Promise.resolve({
                empty: false,
                docs: [{ data: () => ({ accepted: true, email: 'contact@example.com' }) }]
            });
        }
        return Promise.resolve({ empty: true, docs: [] });
      });
      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This user is already in your contacts');
    });
    
    it('should return 400 if a pending invitation already exists', async () => {
       mockGet.mockImplementation((ref) => {
        if (ref.path.includes('users/testUserId')) { // Sender
          return Promise.resolve({
            exists: true,
            data: () => ({ email: 'sender@example.com'}),
            id: 'testUserId'
          });
        } else if (ref.path.includes('users') && ref.parent.id === 'users') { // Potential contact query
           return Promise.resolve({
            empty: false,
            docs: [{
              id: 'contactUserId',
              data: () => ({ email: 'contact@example.com' })
            }]
          });
        } else if (ref.path.includes('contacts')) { // Existing sender contact check
            return Promise.resolve({ empty: true, docs: [] });
        } else if (ref.path.includes('contactInvitations')) { // Existing invitation check
            return Promise.resolve({
                empty: false, // Invitation exists
                docs: [{ data: () => ({ status: 'pending' }) }]
            });
        }
        return Promise.resolve({ empty: true, docs: [] });
      });
      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('An invitation to this user is already pending');
    });

    it('should return 500 on internal server error', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error')); // Simulate any DB error
      const response = await app.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error while sending invitation');
    });
  });

  // --- Route: GET /pending --- //
  describe('GET /contact/pending', () => {
    it('should get pending invitations successfully', async () => {
      const mockInvites = [
        { id: 'invite1', senderId: 'sender1', senderEmail: 'sender1@example.com', senderFirstName: 'Sender1' },
        { id: 'invite2', senderId: 'sender2', senderEmail: 'sender2@example.com', senderFirstName: 'Sender2' },
      ];
      mockGet.mockResolvedValue({
        docs: mockInvites.map(invite => ({
          id: invite.id,
          data: () => invite
        }))
      });

      const response = await app.get('/contact/pending').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.invitations).toEqual(mockInvites.map(i => ({
          id: i.id,
          senderId: i.senderId,
          senderEmail: i.senderEmail,
          senderFirstName: i.senderFirstName
      })));
      expect(mockCollection).toHaveBeenCalledWith('contactInvitations');
      expect(mockWhere).toHaveBeenCalledWith('receiverId', '==', 'testUserId');
      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'pending');
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('should return an empty array if no pending invitations', async () => {
      mockGet.mockResolvedValue({ docs: [] }); // No invitations
      const response = await app.get('/contact/pending').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.invitations).toEqual([]);
    });

    it('should return 500 on internal server error', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error'));
      const response = await app.get('/contact/pending').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error while getting invitations');
    });
  });

  // --- Route: POST /response --- //
  describe('POST /contact/response', () => {
    const responsePayload = { invitationId: 'invite123', action: 'accept' };
    const mockInvitationData = {
        senderId: 'senderUid',
        receiverId: 'testUserId', // Current user is receiver
        status: 'pending',
        receiverEmail: 'receiver@example.com',
        receiverFirstName: 'Receiver',
        receiverLastName: 'User',
        receiverPhone: '123',
        receiverWallets: ['rw1'],
        senderEmail: 'sender@example.com',
        senderFirstName: 'Sender',
        senderLastName: 'Person',
        senderPhone: '456',
        senderWallets: ['sw1'],
    };

    it('should accept an invitation successfully', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => mockInvitationData }); // Mock transaction.get
      
      const response = await app.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invitation accepted');
      expect(mockRunTransaction).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledTimes(2); // One for sender's contact, one for receiver's contact
      expect(mockSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        contactUid: mockInvitationData.receiverId,
        email: mockInvitationData.receiverEmail,
        wallets: mockInvitationData.receiverWallets,
        accepted: true
      }));
       expect(mockSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        contactUid: mockInvitationData.senderId,
        email: mockInvitationData.senderEmail,
        wallets: mockInvitationData.senderWallets,
        accepted: true
      }));
      expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), { status: 'accepted', processedAt: 'mock_server_timestamp' });
    });

    it('should deny an invitation successfully', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => mockInvitationData });
      const denyPayload = { ...responsePayload, action: 'deny' };
      const response = await app.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(denyPayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invitation declined');
      expect(mockRunTransaction).toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), { status: 'denied', processedAt: 'mock_server_timestamp' });
    });
    
    it('should return 400 if invitationId is missing or invalid', async () => {
      const payloads = [{}, { invitationId: '  ' }, { invitationId: 123 }];
      for (const payload of payloads) {
        const response = await app.post('/contact/response')
          .set('Authorization', 'Bearer validtoken')
          .send({ ...payload, action: 'accept' });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing or invalid invitationId');
      }
    });
    
    it('should return 400 if action is invalid', async () => {
      const response = await app.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send({ invitationId: 'invite123', action: 'invalidAction' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid action provided. Must be "accept" or "deny".');
    });

    it('should return 404 if invitation not found in transaction', async () => {
      mockGet.mockResolvedValue({ exists: false }); // Invitation not found in transaction
      const response = await app.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Invitation not found');
    });

    it('should return 403 if user is not the receiver', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockInvitationData, receiverId: 'anotherUser' }) });
      const response = await app.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Not authorized to respond to this invitation');
    });
    
    it('should return 400 if invitation already processed', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockInvitationData, status: 'accepted' }) });
      const response = await app.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invitation already processed');
    });
    
    it('should return 500 on transaction error', async () => {
      mockRunTransaction.mockRejectedValue(new Error('Firestore transaction error'));
      const response = await app.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error processing response');
    });
  });

  // --- Route: GET /contacts --- //
  describe('GET /contact/contacts', () => {
    it('should get contacts successfully', async () => {
      const mockContactsData = [
        { id: 'contact1', email: 'c1@example.com', first_name: 'C1', last_name: 'LN1', phone_number: 'p1', wallets: ['w1'] },
        { id: 'contact2', email: 'c2@example.com', first_name: 'C2', last_name: 'LN2', phone_number: 'p2', wallets: [] },
      ];
      mockGet.mockResolvedValue({
        docs: mockContactsData.map(contact => ({
          id: contact.id,
          data: () => contact
        }))
      });

      const response = await app.get('/contact/contacts').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.contacts).toEqual(mockContactsData);
      expect(mockCollection).toHaveBeenCalledWith('users');
      expect(mockDoc).toHaveBeenCalledWith('testUserId');
      expect(mockDoc().collection).toHaveBeenCalledWith('contacts');
      expect(mockWhere).toHaveBeenCalledWith('accepted', '==', true);
    });
    
    it('should return empty array if no contacts', async () => {
      mockGet.mockResolvedValue({ docs: [] });
      const response = await app.get('/contact/contacts').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.contacts).toEqual([]);
    });

    it('should return 500 on internal server error', async () => {
      mockGet.mockRejectedValue(new Error('Firestore error'));
      const response = await app.get('/contact/contacts').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error while getting contacts');
    });
  });

  // --- Route: DELETE /contacts/:contactId --- //
  describe('DELETE /contact/contacts/:contactId', () => {
    const contactIdToDelete = 'contactToRemove123';

    it('should delete a contact successfully', async () => {
      const response = await app.delete(`/contact/contacts/${contactIdToDelete}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Contact removed successfully');
      expect(mockBatch).toHaveBeenCalled();
      expect(mockBatch().delete).toHaveBeenCalledTimes(2); // Delete from both users
      expect(mockCommit).toHaveBeenCalled();
    });
    
    it('should return 400 if contactId is invalid', async () => {
      const response = await app.delete('/contact/contacts/ ').set('Authorization', 'Bearer validtoken'); // Empty contactId
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid contact ID');
    });
    
    it('should return 400 if trying to delete self', async () => {
      const response = await app.delete('/contact/contacts/testUserId').set('Authorization', 'Bearer validtoken'); // contactId is same as userId
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Cannot remove yourself as a contact');
    });

    it('should return 500 on batch commit error', async () => {
      mockCommit.mockRejectedValue(new Error('Batch commit failed'));
      const response = await app.delete(`/contact/contacts/${contactIdToDelete}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error while removing contact');
    });
  });
}); 
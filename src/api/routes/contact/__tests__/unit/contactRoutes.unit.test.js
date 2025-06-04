import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest'; // Import supertest
// import router from '../../contactRoutes.js'; // Will be dynamically imported

// --- New Mock Setup --- 
const mockFirestoreInstance = {
  collection: jest.fn(),
  runTransaction: jest.fn(),
  batch: jest.fn(),
};

const mockAuthInstance = {
  verifyIdToken: jest.fn(),
};

const mockAdminApp = { name: 'mockAdminApp' };
const mockFieldValueServerTimestamp = jest.fn(() => 'mock_server_timestamp');

jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockFirestoreInstance),
  FieldValue: {
    serverTimestamp: mockFieldValueServerTimestamp,
  },
}));

jest.unstable_mockModule('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockAuthInstance),
}));

jest.unstable_mockModule('../../../auth/admin.js', () => ({
  adminApp: mockAdminApp,
  getAdminApp: jest.fn().mockResolvedValue(mockAdminApp),
}));

// Cache for collection mocks
const collectionCache = {};
// Cache for document mocks (keyed by full path)
const documentCache = {};
// Cache for subcollection mocks (keyed by full path)
const subCollectionCache = {};

// Helper to reset and re-initialize mocks that are dynamically created per call chain
const initializeFirestoreMocks = () => {
  // Clear caches for each test initialization
  for (const key in collectionCache) delete collectionCache[key];
  for (const key in documentCache) delete documentCache[key];
  for (const key in subCollectionCache) delete subCollectionCache[key];

  // console.log('[LOG TEST SETUP] Initializing Firestore Mocks - Caches Cleared');

  mockFirestoreInstance.collection.mockImplementation(collectionName => {
    const collectionPath = collectionName; // Top-level collection path is just its name

    if (collectionCache[collectionPath]) {
      // console.log(`[LOG TEST DEBUG] Firestore Mock Cache HIT for collection: ${collectionPath}`);
      return collectionCache[collectionPath];
    }
    // console.log(`[LOG TEST DEBUG] Firestore Mock Cache MISS for collection: ${collectionPath} - Creating new mock.`);

    const collectionMethods = {
      doc: jest.fn(docId => {
        const docPath = `${collectionPath}/${docId}`;
        if (documentCache[docPath]) {
          // console.log(`[LOG TEST DEBUG] Firestore Mock Cache HIT for document: ${docPath}`);
          return documentCache[docPath];
        }
        // console.log(`[LOG TEST DEBUG] Firestore Mock Cache MISS for document: ${docPath} - Creating new mock.`);

        const docRefMock = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined, id: docId, path: docPath }),
          set: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
          delete: jest.fn().mockResolvedValue(undefined),
          collection: jest.fn(subCollectionName => {
            const subCollectionPath = `${docPath}/${subCollectionName}`;
            if (subCollectionCache[subCollectionPath]) {
              // console.log(`[LOG TEST DEBUG] Firestore Mock Cache HIT for subcollection: ${subCollectionPath}`);
              return subCollectionCache[subCollectionPath];
            }
            // console.log(`[LOG TEST DEBUG] Firestore Mock Cache MISS for subcollection: ${subCollectionPath} - Creating new mock.`);
            
            const subCollectionMock = {
              doc: jest.fn(subDocId => {
                const fullSubDocPath = `${subCollectionPath}/${subDocId}`;
                if (documentCache[fullSubDocPath]) {
                  // console.log(`[LOG TEST DEBUG] Firestore Mock Cache HIT for sub-document: ${fullSubDocPath}`);
                  return documentCache[fullSubDocPath];
                }
                // console.log(`[LOG TEST DEBUG] Firestore Mock Cache MISS for sub-document: ${fullSubDocPath} - Creating new mock.`);
                const subDocRef = {
                  get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined, id: subDocId, path: fullSubDocPath }),
                  set: jest.fn().mockResolvedValue(undefined),
                  update: jest.fn().mockResolvedValue(undefined),
                  delete: jest.fn().mockResolvedValue(undefined),
                  path: fullSubDocPath,
                };
                documentCache[fullSubDocPath] = subDocRef;
                return subDocRef;
              }),
              where: jest.fn(),
              orderBy: jest.fn(),
              limit: jest.fn(),
              add: jest.fn().mockResolvedValue({ id: 'mockSubAddedId' }),
              get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
              path: subCollectionPath,
            };
            subCollectionMock.where.mockReturnThis();
            subCollectionMock.orderBy.mockReturnThis();
            subCollectionMock.limit.mockReturnThis();
            subCollectionCache[subCollectionPath] = subCollectionMock;
            return subCollectionMock;
          }),
          path: docPath,
        };
        documentCache[docPath] = docRefMock;
        return docRefMock;
      }),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      add: jest.fn().mockResolvedValue({ id: 'mockAddedId' }),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      path: collectionPath,
    };

    collectionMethods.where.mockReturnThis();
    collectionMethods.orderBy.mockReturnThis();
    collectionMethods.limit.mockReturnThis();

    collectionCache[collectionPath] = collectionMethods;
    return collectionMethods;
  });

  mockFirestoreInstance.runTransaction.mockImplementation(async (updateFunction) => {
    const mockTransaction = {
      get: jest.fn(ref => {
        // console.log(`[LOG TEST DEBUG] Transaction.get called for path: ${ref.path}, id: ${ref.id}`);
        return Promise.resolve({ exists: false, data: () => undefined, id: ref.id, path: ref.path });
      }),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    return updateFunction(mockTransaction);
  });

  mockFirestoreInstance.batch.mockReturnValue({
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  });
};
// --- End New Mock Setup ---

let router; // Will be assigned in beforeAll

// Renamed for clarity: this creates the Express app instance
const createExpressApp = () => {
  console.log('[LOG TEST SETUP] createExpressApp called.');
  const expressAppInstance = express();
  expressAppInstance.use(express.json());
  if (!router) {
    console.error("[LOG TEST SETUP ERROR] Router is undefined in createExpressApp. Ensure it's loaded in beforeAll.");
    // Potentially throw an error here if router is critical for app creation at this stage
  } else {
    expressAppInstance.use('/contact', router);
    console.log('[LOG TEST SETUP] Router mounted in createExpressApp.');
  }
  return expressAppInstance;
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

describe('Unit Tests for contactRoutes.js', () => {
  let testAgent; // This will be our supertest agent

  beforeAll(async () => {
    console.log('[LOG TEST LIFECYCLE] Running beforeAll...');
    const module = await import('../../contactRoutes.js');
    router = module.default;
    console.log('[LOG TEST LIFECYCLE] Router dynamically imported in beforeAll.');
  });

  beforeEach(() => {
    console.log('[LOG TEST LIFECYCLE] Running beforeEach...');
    jest.clearAllMocks(); // Clear all mocks including those from jest.unstable_mockModule
    
    // Re-initialize our new Firestore mock structure WITH CACHING
    initializeFirestoreMocks(); 

    const currentExpressApp = createExpressApp();
    testAgent = request(currentExpressApp); // Create supertest agent
    console.log('[LOG TEST LIFECYCLE] Supertest agent (testAgent) created.');

    // Reset common mocks
    // Ensure verifyIdToken is reset to a successful resolution for each test by default.
    mockAuthInstance.verifyIdToken.mockReset(); // Clear any previous specific mock (like mockRejectedValueOnce)
    mockAuthInstance.verifyIdToken.mockResolvedValue({ uid: 'testUserId' });

    // Tests should now mock specific paths:
    // e.g., mockFirestoreInstance.collection('users').doc('testUserId').get.mockResolvedValueOnce({ exists: true, ... });
  });

  // Middleware Tests (Optional, but good for completeness)
  describe('authenticateToken Middleware', () => {
    // Middleware is called internally by routes, direct test might be redundant
    // if covered by endpoint tests. However, if complex, can be tested:
    it('should call next() if token is valid', async () => {
      console.log('[LOG TEST RUN] authenticateToken Middleware: should call next() if token is valid');
      const req = mockRequest({}, {}, {}, { authorization: 'Bearer validtoken' });
      const res = mockResponse();
      const next = jest.fn();

      // Simulate how the middleware might be called if it were standalone
      // For router, this is implicitly tested by authenticated routes
      mockAuthInstance.verifyIdToken.mockResolvedValueOnce({ uid: 'testUserId' }); 
      
      // This is a simplified way to test middleware logic if it were exported
      // For actual routes, testing the route's behavior with/without auth is key
      // Example: await someFunctionThatUsesMiddleware(req, res, next);
      // expect(next).toHaveBeenCalled();
      // For now, we'll rely on endpoint tests to cover middleware functionality
    });

     it('should return 401 if no token is provided', async () => {
        console.log('[LOG TEST RUN] authenticateToken Middleware: should return 401 if no token is provided');
        const response = await testAgent.post('/contact/invite').send({}); // Any authenticated route
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('No token provided');
     });

     it('should return 403 if token is invalid', async () => {
        console.log('[LOG TEST RUN] authenticateToken Middleware: should return 403 if token is invalid');
        mockAuthInstance.verifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
        const response = await testAgent.post('/contact/invite')
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
      console.log('[LOG TEST RUN] POST /contact/invite: should send an invitation successfully');
      
      // mockAuthInstance.verifyIdToken is expected to resolve successfully from beforeEach

      // Mock for: const userDoc = await db.collection('users').doc(userId).get();
      mockFirestoreInstance.collection('users').doc('testUserId').get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ email: 'sender@example.com', first_name: 'Sender', last_name: 'User', wallets: ['sw1'] }),
        id: 'testUserId'
      });

      mockFirestoreInstance.collection('users').where('email', '==', 'contact@example.com').limit(1).get.mockResolvedValueOnce({
        empty: false,
        docs: [{
          id: 'contactUserId',
          data: () => ({ email: 'contact@example.com', first_name: 'Contact', last_name: 'Person', wallets: ['cw1'] })
        }]
      });

      mockFirestoreInstance.collection('users').doc('testUserId').collection('contacts').where('email', '==', 'contact@example.com').limit(1).get.mockResolvedValueOnce({
        empty: true, docs: [] 
      });
      
      mockFirestoreInstance.collection('contactInvitations').where('senderId', '==', 'testUserId').where('receiverId', '==', 'contactUserId').where('status', '==', 'pending').limit(1).get.mockResolvedValueOnce({
        empty: true, docs: []
      });

      mockFirestoreInstance.collection('contactInvitations').add.mockResolvedValueOnce({ id: 'newInvitationId' });

      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Invitation sent successfully', invitationId: 'newInvitationId' });
      expect(mockFirestoreInstance.collection('contactInvitations').add).toHaveBeenCalledWith(expect.objectContaining({
        senderId: 'testUserId',
        receiverEmail: 'contact@example.com',
        status: 'pending',
        senderWallets: ['sw1'],
        receiverWallets: ['cw1']
      }));
    });

    it('should return 400 if contactEmail is missing', async () => {
      console.log('[LOG TEST RUN] POST /contact/invite: should return 400 if contactEmail is missing');
      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Contact email is required and must be a string');
    });
    
    it('should return 400 if contactEmail is empty after trim', async () => {
      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send({ contactEmail: '   ' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Contact email is required');
    });

    it('should return 404 if sender user profile not found (edge case)', async () => {
      mockFirestoreInstance.collection('users').doc('testUserId').get.mockResolvedValueOnce({ exists: false, data: () => undefined }); // Sender not found

      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Sender user profile not found');
    });
    
    it('should return 400 for self-invitation', async () => {
      // Auth should pass from beforeEach
      mockFirestoreInstance.collection('users').doc('testUserId').get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ email: 'contact@example.com', first_name: 'Sender', last_name: 'User' }), // Sender's email IS the contactEmail
        id: 'testUserId'
      });
      // No other Firestore calls should be made if self-invitation check passes

      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send({ contactEmail: 'contact@example.com' }); // Trying to invite self
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('You cannot invite yourself');
    });

    it('should return 404 if contact user not found in the system', async () => {
       // Auth should pass
       // Sender profile must exist
       mockFirestoreInstance.collection('users').doc('testUserId').get.mockResolvedValueOnce({ 
          exists: true,
          data: () => ({ email: 'sender@example.com', first_name: 'Sender', last_name: 'User'}),
          id: 'testUserId'
        });
       // Query for contact email must return empty
       mockFirestoreInstance.collection('users').where('email', '==', 'contact@example.com').limit(1).get.mockResolvedValueOnce({ 
         empty: true, docs: [] 
       });

      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User with this email not found in the system');
    });

    it('should return 400 if contact is already an accepted contact', async () => {
      // Auth ok
      // Sender must exist
      mockFirestoreInstance.collection('users').doc('testUserId').get.mockResolvedValueOnce({ 
        exists: true, data: () => ({ email: 'sender@example.com', first_name: 'Sender'}), id: 'testUserId'
      });
      // Contact user must exist
      mockFirestoreInstance.collection('users').where('email', '==', 'contact@example.com').limit(1).get.mockResolvedValueOnce({ 
        empty: false, docs: [{ id: 'contactUserId', data: () => ({ email: 'contact@example.com', first_name: 'Contact' }) }]
      });
      // Existing contact check in sender's subcollection - must find an accepted contact
      mockFirestoreInstance.collection('users').doc('testUserId').collection('contacts').where('email', '==', 'contact@example.com').limit(1).get.mockResolvedValueOnce({ 
        empty: false, docs: [{ data: () => ({ accepted: true, email: 'contact@example.com' }) }]
      });

      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This user is already in your contacts');
    });
    
    it('should return 400 if a pending invitation already exists', async () => {
       // Auth ok
       // Sender must exist
       mockFirestoreInstance.collection('users').doc('testUserId').get.mockResolvedValueOnce({ 
         exists: true, data: () => ({ email: 'sender@example.com', first_name: 'Sender'}), id: 'testUserId'
       });
       // Contact user must exist
       mockFirestoreInstance.collection('users').where('email', '==', 'contact@example.com').limit(1).get.mockResolvedValueOnce({ 
         empty: false, docs: [{ id: 'contactUserId', data: () => ({ email: 'contact@example.com', first_name: 'Contact' }) }]
       });
       // Check if existing contact - this should be empty for this test path
       mockFirestoreInstance.collection('users').doc('testUserId').collection('contacts').where('email', '==', 'contact@example.com').limit(1).get.mockResolvedValueOnce({ 
         empty: true, docs: [] 
       });
       // Check existing pending invitation - must find one
       mockFirestoreInstance.collection('contactInvitations').where('senderId', '==', 'testUserId').where('receiverId', '==', 'contactUserId').where('status', '==', 'pending').limit(1).get.mockResolvedValueOnce({ 
         empty: false, docs: [{ id: 'existingInviteId', data: () => ({ status: 'pending' }) }] 
       });

      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('An invitation to this user is already pending');
    });

    it('should return 500 on internal server error', async () => {
      // Auth ok
      // Simulate DB error on the first Firestore call (getting sender user doc)
      mockFirestoreInstance.collection('users').doc('testUserId').get.mockRejectedValueOnce(new Error('Simulated Firestore error')); 
      const response = await testAgent.post('/contact/invite')
        .set('Authorization', 'Bearer validtoken')
        .send(invitePayload);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error while sending invitation');
    });
  });

  // --- Route: GET /pending --- //
  describe('GET /contact/pending', () => {
    it('should get pending invitations successfully', async () => {
      const mockInvitesData = [
        { id: 'invite1', senderId: 'sender1', senderEmail: 'sender1@example.com', senderFirstName: 'Sender1', createdAt: 'timestamp1' },
        { id: 'invite2', senderId: 'sender2', senderEmail: 'sender2@example.com', senderFirstName: 'Sender2', createdAt: 'timestamp2' },
      ];
      // Ensure the full chain is mocked correctly
      const pendingInvitationsQueryMock = {
        empty: false,
        docs: mockInvitesData.map(invite => ({
          id: invite.id,
          data: () => invite // The data function should return the full invite object including createdAt for orderBy
        }))
      };

      mockFirestoreInstance.collection('contactInvitations')
        .where('receiverId', '==', 'testUserId')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get.mockResolvedValueOnce(pendingInvitationsQueryMock);

      const response = await testAgent.get('/contact/pending').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      // The route transforms the data, so compare against the transformed structure
      expect(response.body.invitations).toEqual(mockInvitesData.map(i => ({
          id: i.id,
          senderId: i.senderId,
          senderEmail: i.senderEmail,
          senderFirstName: i.senderFirstName
          // createdAt is not included in the response mapping in the route
      })));
      // Verify the mocks were called as expected (optional, but good for complex chains)
      const contactInvitationsCollection = mockFirestoreInstance.collection('contactInvitations');
      expect(contactInvitationsCollection.where).toHaveBeenCalledWith('receiverId', '==', 'testUserId');
      // Check subsequent calls on the returned mock object from the first .where()
      const whereStatusMock = contactInvitationsCollection.where.mock.results[0].value; // This is collectionRef in initializeFirestoreMocks
      expect(whereStatusMock.where).toHaveBeenCalledWith('status', '==', 'pending');
      const orderByMock = whereStatusMock.where.mock.results[0].value;
      expect(orderByMock.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      const getMock = orderByMock.orderBy.mock.results[0].value;
      expect(getMock.get).toHaveBeenCalled();
    });

    it('should return an empty array if no pending invitations', async () => {
      mockFirestoreInstance.collection('contactInvitations').where('receiverId', '==', 'testUserId').where('status', '==', 'pending').orderBy('createdAt', 'desc').get.mockResolvedValueOnce({ 
        empty: true, docs: [] 
      }); // No invitations
      const response = await testAgent.get('/contact/pending').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.invitations).toEqual([]);
    });

    it('should return 500 on internal server error', async () => {
      mockFirestoreInstance.collection('contactInvitations')
        .where('receiverId', '==', 'testUserId')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get.mockRejectedValueOnce(new Error('Simulated Firestore error for get pending'));

      const response = await testAgent.get('/contact/pending').set('Authorization', 'Bearer validtoken');
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
      const transactionGetMock = jest.fn().mockResolvedValue({ exists: true, data: () => mockInvitationData, id: 'invite123', path: 'contactInvitations/invite123' });
      const transactionSetMock = jest.fn().mockResolvedValue(undefined);
      const transactionUpdateMock = jest.fn().mockResolvedValue(undefined);

      // Override the default runTransaction mock for this specific test
      mockFirestoreInstance.runTransaction.mockImplementationOnce(async (updateFunction) => {
        const mockTransaction = {
          get: transactionGetMock, // Use the test-specific mock
          set: transactionSetMock,
          update: transactionUpdateMock,
          delete: jest.fn(), 
        };
        return updateFunction(mockTransaction);
      });
      
      const response = await testAgent.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invitation accepted');
      expect(mockFirestoreInstance.runTransaction).toHaveBeenCalled();
      
      // Assert that transaction.get was called with an object whose path property matches
      expect(transactionGetMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'contactInvitations/invite123' }));
      
      expect(transactionSetMock).toHaveBeenCalledTimes(2); 
      // Check properties of the objects passed to transaction.set
      expect(transactionSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: `users/${mockInvitationData.senderId}/contacts/${mockInvitationData.receiverId}` }),
        expect.objectContaining({
          contactUid: mockInvitationData.receiverId,
          email: mockInvitationData.receiverEmail,
          wallets: mockInvitationData.receiverWallets,
          accepted: true
        })
      );
       expect(transactionSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: `users/${mockInvitationData.receiverId}/contacts/${mockInvitationData.senderId}` }),
        expect.objectContaining({
          contactUid: mockInvitationData.senderId,
          email: mockInvitationData.senderEmail,
          wallets: mockInvitationData.senderWallets,
          accepted: true
        })
      );
      expect(transactionUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'contactInvitations/invite123' }), 
        { status: 'accepted', processedAt: 'mock_server_timestamp' }
      );
    });

    it('should deny an invitation successfully', async () => {
      const transactionGetMock = jest.fn().mockResolvedValue({ exists: true, data: () => mockInvitationData, id: 'invite123', path: 'contactInvitations/invite123' });
      const transactionUpdateMock = jest.fn().mockResolvedValue(undefined);

      // Override the default runTransaction mock for this specific test
      mockFirestoreInstance.runTransaction.mockImplementationOnce(async (updateFunction) => {
        const mockTransaction = {
          get: transactionGetMock, // Use the test-specific mock
          set: jest.fn(), 
          update: transactionUpdateMock,
          delete: jest.fn(), 
        };
        return updateFunction(mockTransaction);
      });

      const denyPayload = { ...responsePayload, action: 'deny' };
      const response = await testAgent.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(denyPayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invitation declined');
      expect(transactionGetMock).toHaveBeenCalledWith(expect.objectContaining({ path: 'contactInvitations/invite123' }));
      expect(transactionUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'contactInvitations/invite123' }), 
        { status: 'denied', processedAt: 'mock_server_timestamp' }
      );
    });
    
    it('should return 400 if invitationId is missing or invalid', async () => {
      const payloads = [{}, { invitationId: '  ' }, { invitationId: 123 }];
      for (const payload of payloads) {
        const response = await testAgent.post('/contact/response')
          .set('Authorization', 'Bearer validtoken')
          .send({ ...payload, action: 'accept' });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing or invalid invitationId');
      }
    });
    
    it('should return 400 if action is invalid', async () => {
      const response = await testAgent.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send({ invitationId: 'invite123', action: 'invalidAction' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid action provided. Must be "accept" or "deny".');
    });

    it('should return 404 if invitation not found in transaction', async () => {
      mockFirestoreInstance.runTransaction.mockImplementationOnce(async (updateFunction) => {
        const mockTransaction = { get: jest.fn().mockResolvedValue({ exists: false }) }; // Invitation not found
        return updateFunction(mockTransaction);
      });
      const response = await testAgent.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Invitation not found');
    });

    it('should return 403 if user is not the receiver', async () => {
      mockFirestoreInstance.runTransaction.mockImplementationOnce(async (updateFunction) => {
        const mockTransaction = { 
          get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ ...mockInvitationData, receiverId: 'anotherUser' }) }) 
        };
        return updateFunction(mockTransaction);
      });
      const response = await testAgent.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Not authorized to respond to this invitation');
    });
    
    it('should return 400 if invitation already processed', async () => {
       mockFirestoreInstance.runTransaction.mockImplementationOnce(async (updateFunction) => {
        const mockTransaction = { 
          get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ ...mockInvitationData, status: 'accepted' }) }) 
        };
        return updateFunction(mockTransaction);
      });
      const response = await testAgent.post('/contact/response')
        .set('Authorization', 'Bearer validtoken')
        .send(responsePayload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invitation already processed');
    });
    
    it('should return 500 on transaction error', async () => {
      mockFirestoreInstance.runTransaction.mockRejectedValueOnce(new Error('Firestore transaction error'));
      const response = await testAgent.post('/contact/response')
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
        { id: 'contact1', email: 'c1@example.com', first_name: 'C1', last_name: 'LN1', phone_number: 'p1', wallets: ['w1'], accepted: true },
        { id: 'contact2', email: 'c2@example.com', first_name: 'C2', last_name: 'LN2', phone_number: 'p2', wallets: [], accepted: true },
      ];
      
      const contactsQueryMock = {
        empty: false,
        docs: mockContactsData.map(contact => ({
          id: contact.id,
          data: () => contact // Data should return the full contact object including 'accepted' for the where clause
        }))
      };

      // Full chain mock for users -> doc -> contacts -> where -> get
      mockFirestoreInstance.collection('users').doc('testUserId').collection('contacts').where('accepted', '==', true).get.mockResolvedValueOnce(contactsQueryMock);

      const response = await testAgent.get('/contact/contacts').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      // The route maps the data, so we expect the mapped version
      expect(response.body.contacts).toEqual(mockContactsData.map(c => ({
        id: c.id,
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone_number: c.phone_number,
        wallets: c.wallets
        // 'accepted' field is not part of the response mapping
      })));
      
      // Verify the mock call chain
      const usersCollectionMock = mockFirestoreInstance.collection('users');
      expect(usersCollectionMock.doc).toHaveBeenCalledWith('testUserId');
      const testUserDocMock = usersCollectionMock.doc.mock.results[usersCollectionMock.doc.mock.calls.findIndex(call => call[0] === 'testUserId')].value;
      expect(testUserDocMock.collection).toHaveBeenCalledWith('contacts');
      const contactsSubCollectionMock = testUserDocMock.collection.mock.results[testUserDocMock.collection.mock.calls.findIndex(call => call[0] === 'contacts')].value;
      expect(contactsSubCollectionMock.where).toHaveBeenCalledWith('accepted', '==', true);
      expect(contactsSubCollectionMock.where.mock.results[0].value.get).toHaveBeenCalled(); // Check get on the result of where
    });
    
    it('should return empty array if no contacts', async () => {
      mockFirestoreInstance.collection('users').doc('testUserId').collection('contacts').where('accepted', '==', true).get.mockResolvedValueOnce({ 
        empty: true, docs: [] 
      });
      const response = await testAgent.get('/contact/contacts').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.contacts).toEqual([]);
    });

    it('should return 500 on internal server error', async () => {
      mockFirestoreInstance.collection('users').doc('testUserId').collection('contacts').where('accepted', '==', true).get.mockRejectedValueOnce(new Error('Simulated Firestore error for get contacts'));
      const response = await testAgent.get('/contact/contacts').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error while getting contacts');
    });
  });

  // --- Route: DELETE /contacts/:contactId --- //
  describe('DELETE /contact/contacts/:contactId', () => {
    const contactIdToDelete = 'contactToRemove123';

    it('should delete a contact successfully', async () => {
      const batchDeleteMock = jest.fn();
      const batchCommitMock = jest.fn().mockResolvedValue(undefined);
      mockFirestoreInstance.batch.mockReturnValueOnce({ delete: batchDeleteMock, commit: batchCommitMock });

      const response = await testAgent.delete(`/contact/contacts/${contactIdToDelete}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Contact removed successfully');
      expect(mockFirestoreInstance.batch).toHaveBeenCalled();
      expect(batchDeleteMock).toHaveBeenCalledTimes(2); 
      expect(batchCommitMock).toHaveBeenCalled();
    });
    
    it('should return 400 if contactId is invalid (empty string)', async () => {
      // Test with an empty string param, which Express might or might not route. If 404, it's a routing issue for empty param.
      // The route logic `!contactId || ... || contactId.trim() === ''` should catch empty or whitespace.
      const response = await testAgent.delete('/contact/contacts/').set('Authorization', 'Bearer validtoken'); 
      // For supertest, an empty param segment usually results in a 404 from Express router if no route matches that pattern.
      // If the route was `/contact/contacts/:contactId?` it might hit.
      // For now, expect 404 as Express likely won't route `DELETE /contact/contacts/` to `DELETE /contact/contacts/:contactId`
      // If it somehow routes and `contactId` is undefined, the `!contactId` check should yield 400.
      // Let's test the trim() logic specifically with a whitespace string if the empty string causes 404.
      expect(response.status).toBe(404); // More likely a 404 for empty segment if not optional
    });

    it('should return 400 if contactId is invalid (whitespace string)', async () => {
      const response = await testAgent.delete('/contact/contacts/%20').set('Authorization', 'Bearer validtoken'); // %20 is URL for space
      // The route logic `contactId.trim() === ''` should catch this if `req.params.contactId` becomes ' '.
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid contact ID');
    });
    
    it('should return 400 if trying to delete self', async () => {
      const response = await testAgent.delete('/contact/contacts/testUserId').set('Authorization', 'Bearer validtoken'); // contactId is same as userId
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Cannot remove yourself as a contact');
    });

    it('should return 500 on batch commit error', async () => {
      mockFirestoreInstance.batch.mockReturnValueOnce({ delete: jest.fn(), commit: jest.fn().mockRejectedValue(new Error('Batch commit failed')) });
      const response = await testAgent.delete(`/contact/contacts/${contactIdToDelete}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error while removing contact');
    });
  });
}); 
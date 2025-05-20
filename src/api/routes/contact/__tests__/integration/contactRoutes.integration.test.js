import request from 'supertest';
import express from 'express';
import contactRouter from '../../contactRoutes.js'; // Adjust path relative to test file
import { adminFirestore }  from '../../../../../../jest.emulator.setup.js'; // Use test setup
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { deleteAdminApp } from '../../../auth/admin.js'; // Import the delete function
import {createTestUser, cleanUp } from '../../../../../helperFunctions.js';

// --- Test Setup ---
const app = express();
app.use(express.json());
app.use('/api/contacts', contactRouter); // Assuming routes are mounted under /api/contacts



// --- Tests ---
describe('Contact Routes API (/api/contacts)', () => {

    let user1, user2, user3; // To store test user data

    beforeAll(async () => {
        // Optional: Ping emulators
    });

    afterAll(async () => {
        await cleanUp();
        await deleteAdminApp(); // Cleanup admin app used by routes
    });

    beforeEach(async () => {
        await cleanUp(); // Assuming this clears the Firestore database or resets state
        // Create fresh users
        user1 = await createTestUser('sender@example.com', { first_name: 'Sender', last_name: 'User', wallets: ['swallet1'] });
        user2 = await createTestUser('receiver@example.com', { first_name: 'Receiver', last_name: 'User', wallets: ['rwallet1', 'rwallet2'] });
        user3 = await createTestUser('other@example.com', { first_name: 'Other' });
        // Explicitly clear user2's contacts subcollection
        const contactsRef = adminFirestore.collection('users').doc(user2.uid).collection('contacts');
        const contacts = await contactsRef.get();
        await Promise.all(contacts.docs.map(doc => doc.ref.delete()));
    });

    afterEach(async () => {
        // Clean up contacts for user2
        const contactsRef = adminFirestore.collection('users').doc(user2.uid).collection('contacts');
        const contacts = await contactsRef.get();
        await Promise.all(contacts.docs.map(doc => doc.ref.delete()));
    });
    // --- POST /invite ---
    describe('POST /invite', () => {
        it('should send an invitation successfully', async () => {
            const response = await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', `Bearer ${user1.token}`)
                .send({ contactEmail: user2.email });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message', 'Invitation sent successfully');
            expect(response.body).toHaveProperty('invitationId');

            // Verify invitation document in Firestore
            const inviteSnapshot = await adminFirestore.collection('contactInvitations').doc(response.body.invitationId).get();
            expect(inviteSnapshot.exists).toBe(true);
            const inviteData = inviteSnapshot.data();
            expect(inviteData.senderId).toBe(user1.uid);
            expect(inviteData.receiverId).toBe(user2.uid);
            expect(inviteData.status).toBe('pending');
            expect(inviteData.senderWallets).toEqual(['swallet1']); // Check wallets included
            expect(inviteData.receiverWallets).toEqual(['rwallet1', 'rwallet2']);
        });

        it('should return 400 if contactEmail is missing', async () => {
            const response = await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', `Bearer ${user1.token}`)
                .send({}); // Missing email

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Contact email is required and must be a string');
        });

        it('should return 404 if contact email does not exist in users', async () => {
            const response = await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', `Bearer ${user1.token}`)
                .send({ contactEmail: 'nonexistent@example.com' });

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'User with this email not found in the system');
        });

         it('should return 400 if user tries to invite self', async () => {
            const response = await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', `Bearer ${user1.token}`)
                .send({ contactEmail: user1.email }); // Self invitation

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'You cannot invite yourself');
        });

        it('should return 400 if contact is already accepted', async () => {
            // Manually add user2 as a contact for user1 first
             await adminFirestore.collection('users').doc(user1.uid).collection('contacts').doc(user2.uid).set({
                contactUid: user2.uid,
                email: user2.email,
                accepted: true, // Mark as accepted
                // ... other fields
            });

            const response = await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', `Bearer ${user1.token}`)
                .send({ contactEmail: user2.email });

            expect(response.status).toBe(400);
             expect(response.body).toHaveProperty('error', 'This user is already in your contacts');
        });

        it('should return 400 if an invitation is already pending', async () => {
             // Send one invite first
             await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', `Bearer ${user1.token}`)
                .send({ contactEmail: user2.email });

             // Try sending again
             const response = await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', `Bearer ${user1.token}`)
                .send({ contactEmail: user2.email });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'An invitation to this user is already pending');
        });

         it('should return 401 if no token is provided', async () => {
             const response = await request(app)
                .post('/api/contacts/invite')
                .send({ contactEmail: user2.email });
             expect(response.status).toBe(401);
         });

         it('should return 403 if token is invalid', async () => {
             const response = await request(app)
                .post('/api/contacts/invite')
                .set('Authorization', 'Bearer invalidtoken')
                .send({ contactEmail: user2.email });
             expect(response.status).toBe(403);
         });

    });

    // --- GET /pending ---
    describe('GET /pending', () => {
         let invitationId;
         beforeEach(async () => {
             // Create a pending invitation for user2 from user1
             const inviteRef = await adminFirestore.collection('contactInvitations').add({
                  senderId: user1.uid, receiverId: user2.uid, status: 'pending', createdAt: FieldValue.serverTimestamp(), senderFirstName: 'Sender'
             });
             invitationId = inviteRef.id;
             // Create another unrelated pending invitation
             await adminFirestore.collection('contactInvitations').add({
                  senderId: user3.uid, receiverId: user1.uid, status: 'pending', createdAt: FieldValue.serverTimestamp()
             });
             // Create an accepted invitation (should not be returned)
              await adminFirestore.collection('contactInvitations').add({
                  senderId: user3.uid, receiverId: user2.uid, status: 'accepted', createdAt: FieldValue.serverTimestamp()
             });
         });

        it('should retrieve pending invitations for the user', async () => {
            const response = await request(app)
                .get('/api/contacts/pending')
                .set('Authorization', `Bearer ${user2.token}`); // user2 is receiver

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('invitations');
            expect(response.body.invitations).toHaveLength(1);
            expect(response.body.invitations[0].id).toBe(invitationId);
            expect(response.body.invitations[0].senderId).toBe(user1.uid);
            expect(response.body.invitations[0].senderFirstName).toBe('Sender'); // Check mapped fields
        });

         it('should return an empty array if no pending invitations exist', async () => {
            const response = await request(app)
                .get('/api/contacts/pending')
                .set('Authorization', `Bearer ${user3.token}`); // user3 has no pending invites as receiver

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('invitations');
            expect(response.body.invitations).toHaveLength(0);
         });

         it('should return 401 if no token is provided', async () => {
             const response = await request(app).get('/api/contacts/pending');
             expect(response.status).toBe(401);
         });

         it('should return 403 if token is invalid', async () => {
             const response = await request(app).get('/api/contacts/pending').set('Authorization', 'Bearer invalidtoken');
             expect(response.status).toBe(403);
         });
    });

    // --- POST /response ---
     describe('POST /response', () => {
         let pendingInvitationId;
         let processedInvitationId;

         beforeEach(async () => {
             // Create a pending invitation for user2 from user1
             const inviteRef = await adminFirestore.collection('contactInvitations').add({
                  senderId: user1.uid, senderEmail: user1.email, senderFirstName: 'SenderFN', senderLastName: 'SenderLN', senderPhone: '111', senderWallets: ['sw1'],
                  receiverId: user2.uid, receiverEmail: user2.email, receiverFirstName: 'ReceiverFN', receiverLastName: 'ReceiverLN', receiverPhone: '222', receiverWallets: ['rw1'],
                  status: 'pending', createdAt: FieldValue.serverTimestamp()
             });
             pendingInvitationId = inviteRef.id;

             // Create an already processed invitation
             const processedRef = await adminFirestore.collection('contactInvitations').add({
                 senderId: user1.uid, receiverId: user3.uid, status: 'denied', processedAt: FieldValue.serverTimestamp(),
                 createdAt: FieldValue.serverTimestamp()
             });
            processedInvitationId = processedRef.id;
         });

        it('should accept an invitation successfully', async () => {
            const response = await request(app)
                .post('/api/contacts/response')
                .set('Authorization', `Bearer ${user2.token}`) // user2 (receiver) responds
                .send({ invitationId: pendingInvitationId, action: 'accept' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Invitation accepted');

            // Verify invitation status updated
            const inviteDoc = await adminFirestore.collection('contactInvitations').doc(pendingInvitationId).get();
            expect(inviteDoc.data().status).toBe('accepted');
            expect(inviteDoc.data().processedAt).toBeInstanceOf(Timestamp); // Check timestamp added

            // Verify sender added to receiver's contacts (using sender UID as doc ID)
            const receiverContactDoc = await adminFirestore.collection('users').doc(user2.uid).collection('contacts').doc(user1.uid).get();
            expect(receiverContactDoc.exists).toBe(true);
            expect(receiverContactDoc.data().contactUid).toBe(user1.uid);
            expect(receiverContactDoc.data().email).toBe(user1.email);
            expect(receiverContactDoc.data().first_name).toBe('SenderFN');
            expect(receiverContactDoc.data().wallets).toEqual(['sw1']); // Check wallets
            expect(receiverContactDoc.data().accepted).toBe(true);

             // Verify receiver added to sender's contacts (using receiver UID as doc ID)
            const senderContactDoc = await adminFirestore.collection('users').doc(user1.uid).collection('contacts').doc(user2.uid).get();
            expect(senderContactDoc.exists).toBe(true);
            expect(senderContactDoc.data().contactUid).toBe(user2.uid);
            expect(senderContactDoc.data().email).toBe(user2.email);
            expect(senderContactDoc.data().first_name).toBe('ReceiverFN');
            expect(senderContactDoc.data().wallets).toEqual(['rw1']); // Check wallets
            expect(senderContactDoc.data().accepted).toBe(true);

        });

        it('should deny an invitation successfully', async () => {
             const response = await request(app)
                .post('/api/contacts/response')
                .set('Authorization', `Bearer ${user2.token}`) // user2 (receiver) responds
                .send({ invitationId: pendingInvitationId, action: 'deny' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Invitation declined');

             // Verify invitation status updated
            const inviteDoc = await adminFirestore.collection('contactInvitations').doc(pendingInvitationId).get();
            expect(inviteDoc.data().status).toBe('denied');
            expect(inviteDoc.data().processedAt).toBeInstanceOf(Timestamp);

             // Verify contacts NOT added
            const receiverContactDoc = await adminFirestore.collection('users').doc(user2.uid).collection('contacts').doc(user1.uid).get();
            expect(receiverContactDoc.exists).toBe(false);
            const senderContactDoc = await adminFirestore.collection('users').doc(user1.uid).collection('contacts').doc(user2.uid).get();
            expect(senderContactDoc.exists).toBe(false);
        });

        it('should return 400 for missing invitationId or action', async () => {
            const res1 = await request(app).post('/api/contacts/response').set('Authorization', `Bearer ${user2.token}`).send({ action: 'accept' });
            expect(res1.status).toBe(400);
            expect(res1.body).toHaveProperty('error', 'Missing or invalid invitationId');

            const res2 = await request(app).post('/api/contacts/response').set('Authorization', `Bearer ${user2.token}`).send({ invitationId: pendingInvitationId });
            expect(res2.status).toBe(400);
            expect(res2.body).toHaveProperty('error', 'Invalid action provided. Must be "accept" or "deny".');
        });

         it('should return 404 if invitationId does not exist', async () => {
             const response = await request(app)
                .post('/api/contacts/response')
                .set('Authorization', `Bearer ${user2.token}`)
                .send({ invitationId: 'nonexistent-id', action: 'accept' });
            expect(response.status).toBe(404);
             expect(response.body).toHaveProperty('error', 'Invitation not found');
         });

         it('should return 403 if user is not the receiver', async () => {
            const response = await request(app)
                .post('/api/contacts/response')
                .set('Authorization', `Bearer ${user1.token}`) // user1 (sender) tries to respond
                .send({ invitationId: pendingInvitationId, action: 'accept' });
            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Not authorized to respond to this invitation');
         });

          it('should return 400 if invitation is already processed', async () => {
             const response = await request(app)
                .post('/api/contacts/response')
                .set('Authorization', `Bearer ${user3.token}`) // Correct receiver for processed invite
                .send({ invitationId: processedInvitationId, action: 'accept' });
             expect(response.status).toBe(400);
             expect(response.body).toHaveProperty('error', 'Invitation already processed');
          });

         it('should return 400 if action is invalid', async () => {
            const response = await request(app)
                .post('/api/contacts/response')
                .set('Authorization', `Bearer ${user2.token}`)
                .send({ invitationId: pendingInvitationId, action: 'maybe' });
             expect(response.status).toBe(400);
             expect(response.body).toHaveProperty('error', 'Invalid action provided. Must be "accept" or "deny".');
         });

          it('should return 401 if no token is provided', async () => {
             const response = await request(app).post('/api/contacts/response').send({ invitationId: pendingInvitationId, action: 'accept' });
             expect(response.status).toBe(401);
         });

         it('should return 403 if token is invalid', async () => {
             const response = await request(app).post('/api/contacts/response').set('Authorization', 'Bearer invalidtoken').send({ invitationId: pendingInvitationId, action: 'accept' });
             expect(response.status).toBe(403);
         });
     });


    // --- GET /contacts ---
    describe('GET /contacts', () => {
        beforeEach(async () => {
            // user1 accepts invite from user2
            // user3 sends invite to user1, user1 accepts
            const invite1Ref = await adminFirestore.collection('contactInvitations').add({ senderId: user2.uid, receiverId: user1.uid, status: 'pending', createdAt: FieldValue.serverTimestamp(), senderEmail: user2.email, senderFirstName: 'R', senderLastName: 'U', senderPhone: '2', senderWallets: ['rw1'], receiverEmail: user1.email, receiverFirstName: 'S', receiverLastName: 'U', receiverPhone: '1', receiverWallets: ['sw1'] });
            await request(app).post('/api/contacts/response').set('Authorization', `Bearer ${user1.token}`).send({ invitationId: invite1Ref.id, action: 'accept' });

            const invite2Ref = await adminFirestore.collection('contactInvitations').add({ senderId: user3.uid, receiverId: user1.uid, status: 'pending', createdAt: FieldValue.serverTimestamp(), senderEmail: user3.email, senderFirstName: 'O', senderLastName: 'U', senderPhone: '3', senderWallets: [], receiverEmail: user1.email, receiverFirstName: 'S', receiverLastName: 'U', receiverPhone: '1', receiverWallets: ['sw1'] });
            await request(app).post('/api/contacts/response').set('Authorization', `Bearer ${user1.token}`).send({ invitationId: invite2Ref.id, action: 'accept' });

             // user1 sends invite to user3, user3 denies
             const invite3Ref = await adminFirestore.collection('contactInvitations').add({ senderId: user1.uid, receiverId: user3.uid, status: 'pending', createdAt: FieldValue.serverTimestamp(), /* ... */ });
             await request(app).post('/api/contacts/response').set('Authorization', `Bearer ${user3.token}`).send({ invitationId: invite3Ref.id, action: 'deny' });
        });

        it('should retrieve accepted contacts for the user', async () => {
            const response = await request(app)
                .get('/api/contacts/contacts')
                .set('Authorization', `Bearer ${user1.token}`); // Get contacts for user1

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('contacts');
            expect(response.body.contacts).toHaveLength(2);

            // Check using arrayContaining again for order independence
             expect(response.body.contacts).toEqual(expect.arrayContaining([
                expect.objectContaining({ id: user2.uid, email: user2.email, first_name: 'R', wallets: ['rw1'] }), // Check details added during acceptance
                expect.objectContaining({ id: user3.uid, email: user3.email, first_name: 'O', wallets: [] })
            ]));
        });

        it('should return an empty array if user has no accepted contacts', async () => {
            // Create a new user with no contacts
            const user4 = await createTestUser('no_contacts@example.com', {
                first_name: 'No',
                last_name: 'Contacts'
            });
        
            // Make the GET request with the new user's token
            const response = await request(app)
                .get('/api/contacts/contacts')
                .set('Authorization', `Bearer ${user4.token}`);
        
            // Assertions
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('contacts');
            expect(response.body.contacts).toHaveLength(0);
        });

         it('should return 401 if no token is provided', async () => {
             const response = await request(app).get('/api/contacts/contacts');
             expect(response.status).toBe(401);
         });

         it('should return 403 if token is invalid', async () => {
             const response = await request(app).get('/api/contacts/contacts').set('Authorization', 'Bearer invalidtoken');
             expect(response.status).toBe(403);
         });
         
    });

    describe('DELETE /contacts/:contactId', () => {
        it('should remove a contact successfully', async () => {
          // User2 invites User1, User1 accepts
          const inviteResponse = await request(app)
            .post('/api/contacts/invite')
            .set('Authorization', `Bearer ${user2.token}`)
            .send({ contactEmail: user1.email });
          const invitationId = inviteResponse.body.invitationId;
          await request(app)
            .post('/api/contacts/response')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ invitationId, action: 'accept' });
    
          // Verify initial contact relationship
          let contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user1.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(1);
          expect(contactsResponse.body.contacts[0].id).toBe(user2.uid);
    
          // User1 deletes User2
          const deleteResponse = await request(app)
            .delete(`/api/contacts/contacts/${user2.uid}`)
            .set('Authorization', `Bearer ${user1.token}`);
          expect(deleteResponse.status).toBe(200);
          expect(deleteResponse.body.message).toBe('Contact removed successfully');
    
          // Verify User1 has no contacts
          contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user1.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(0);
    
          // Verify User2 has no contacts
          contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user2.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(0);
        });
    
        it('should handle removing a non-existent contact', async () => {
          const deleteResponse = await request(app)
            .delete('/api/contacts/contacts/nonexistentuid')
            .set('Authorization', `Bearer ${user1.token}`);
          expect(deleteResponse.status).toBe(200);
          expect(deleteResponse.body.message).toBe('Contact removed successfully');
    
          const contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user1.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(0);
        });
    
        it('should return 400 when trying to remove self', async () => {
          const response = await request(app)
            .delete(`/api/contacts/contacts/${user1.uid}`)
            .set('Authorization', `Bearer ${user1.token}`);
          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Cannot remove yourself as a contact');
        });
    
        it('should return 401 if no token is provided', async () => {
          const response = await request(app)
            .delete('/api/contacts/contacts/someuid');
          expect(response.status).toBe(401);
        });
    
        it('should return 403 if token is invalid', async () => {
          const response = await request(app)
            .delete('/api/contacts/contacts/someuid')
            .set('Authorization', 'Bearer invalidtoken');
          expect(response.status).toBe(403);
        });
    
        it('should remove only the specified contact', async () => {
          // User2 and User3 invite User1, User1 accepts both
          const invite1 = await request(app)
            .post('/api/contacts/invite')
            .set('Authorization', `Bearer ${user2.token}`)
            .send({ contactEmail: user1.email });
          const invite2 = await request(app)
            .post('/api/contacts/invite')
            .set('Authorization', `Bearer ${user3.token}`)
            .send({ contactEmail: user1.email });
          await request(app)
            .post('/api/contacts/response')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ invitationId: invite1.body.invitationId, action: 'accept' });
          await request(app)
            .post('/api/contacts/response')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ invitationId: invite2.body.invitationId, action: 'accept' });
    
          // Verify User1 has two contacts
          let contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user1.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(2);
    
          // User1 deletes User2
          await request(app)
            .delete(`/api/contacts/contacts/${user2.uid}`)
            .set('Authorization', `Bearer ${user1.token}`);
    
          // Verify User1 has only User3
          contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user1.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(1);
          expect(contactsResponse.body.contacts[0].id).toBe(user3.uid);
    
          // Verify User2 has no contacts
          contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user2.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(0);
    
          // Verify User3 still has User1
          contactsResponse = await request(app)
            .get('/api/contacts/contacts')
            .set('Authorization', `Bearer ${user3.token}`);
          expect(contactsResponse.body.contacts).toHaveLength(1);
          expect(contactsResponse.body.contacts[0].id).toBe(user1.uid);
        });
      });
    });
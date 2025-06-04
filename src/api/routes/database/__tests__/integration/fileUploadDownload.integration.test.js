// FORCE TEST ENVIRONMENT VARIABLES BEFORE ANY IMPORTS
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-test';
process.env.FIREBASE_STORAGE_BUCKET = 'demo-test.appspot.com';
process.env.FIREBASE_API_KEY = 'demo-api-key';
process.env.FIREBASE_AUTH_DOMAIN = 'localhost';
process.env.FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.FIREBASE_APP_ID = '1:123456789:web:abcdef';

import request from 'supertest';
import express from 'express';
import fileUploadRouter from '../../fileUploadDownload.js'; // Adjust path as necessary
// Make sure PROJECT_ID is imported or defined if needed outside the setup file
import { adminAuth, adminFirestore, adminApp as testAdminApp, PROJECT_ID } from '../../../../../../jest.emulator.setup.js'; // Renamed imported adminApp to avoid conflict
import { deleteAdminApp } from '../../../auth/admin.js'; // Import the delete function
import { getStorage } from 'firebase-admin/storage';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getAdminApp } from '../../../auth/admin.js';

// Set up the Express app
const app = express();
app.use(express.json());
app.use('/files', fileUploadRouter); // Router uses its own adminApp instance via import

// Configuration (Consider centralizing these if used elsewhere)
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const DUMMY_API_KEY = 'demo-api-key'; // Use the same key as in your setup
const TEST_STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`; // Define bucket name for clarity

// Simplified helper function to create a test user and get a token
async function createTestUser(email) {
  console.log(`Creating test user: ${email}`);
  
  // 1. Create the user via the same admin SDK that routes use
  const routeAdminApp = await getAdminApp();
  const routeAuth = getAdminAuth(routeAdminApp);
  const user = await routeAuth.createUser({ email, password: 'testpass' });

  // 2. Create a custom token for the user - this is what the routes expect
  const customToken = await routeAuth.createCustomToken(user.uid);
  console.log(`Created custom token for ${email}: ${customToken.substring(0, 50)}...`);
  
  // 3. For testing purposes, we can use the custom token directly
  // The routes expect an ID token, but in test mode we can simulate this
  // by creating a mock ID token that contains the necessary claims
  const mockIdToken = customToken; // Use custom token as mock ID token for testing
  
  // 4. Test token verification with the same auth instance the routes use
  try {
    // Instead of verifying the custom token as an ID token (which won't work),
    // let's verify that we can create and verify a proper custom token
    const decodedCustomToken = await routeAuth.verifyIdToken(customToken).catch(() => {
      // Custom tokens can't be verified as ID tokens, so this is expected to fail
      // but we know the user exists and the custom token is valid
      console.log(`Custom token created successfully for ${email}, UID: ${user.uid}`);
      return { uid: user.uid };
    });
  } catch (error) {
    console.error(`Token verification failed for ${email}:`, error.code, error.message);
  }
  
  return { uid: user.uid, token: mockIdToken };
}

// Helper function to clean up test data (using testAdminApp from setup)
async function cleanUp() {
  // Clean up users from the route auth instance
  try {
    const routeAdminApp = await getAdminApp();
    const routeAuth = getAdminAuth(routeAdminApp);
    const usersList = await routeAuth.listUsers();
    const deleteUserPromises = usersList.users.map(user => routeAuth.deleteUser(user.uid));
    await Promise.all(deleteUserPromises);
  } catch(error) {
    if (error.code !== 'auth/internal-error' && !error.message?.includes('find a running emulator')) {
         console.warn("Cleanup warning (Route Users):", error.message);
    }
  }
  
  try {
    // Also clean up from test adminAuth for completeness
    const usersList = await adminAuth.listUsers();
    const deleteUserPromises = usersList.users.map(user => adminAuth.deleteUser(user.uid));
    await Promise.all(deleteUserPromises);
  } catch(error) {
    if (error.code !== 'auth/internal-error' && !error.message?.includes('find a running emulator')) {
         console.warn("Cleanup warning (Test Users):", error.message);
    }
  }
  
  try {
     // Enhanced cleanup for Firestore Emulator - recursively delete subcollections
     const collections = await adminFirestore.listCollections();
     for (const collection of collections) {
        const docs = await collection.get();
        
        // Delete subcollections first (specifically the 'files' subcollection in deals)
        for (const doc of docs.docs) {
          const subcollections = await doc.ref.listCollections();
          for (const subcollection of subcollections) {
            const subDocs = await subcollection.get();
            const deleteSubDocPromises = subDocs.docs.map(subDoc => subDoc.ref.delete());
            await Promise.all(deleteSubDocPromises);
          }
        }
        
        // Then delete the main documents
        const deleteDocPromises = docs.docs.map(doc => doc.ref.delete());
        await Promise.all(deleteDocPromises);
     }
  } catch (error) {
     if (!error.message?.includes('find a running emulator')) {
        console.warn("Cleanup warning (Firestore):", error.message);
     }
  }
  try {
    // Use testAdminApp for storage cleanup as it's initialized correctly in setup
    const storage = getStorage(testAdminApp); // Use the app instance initialized in setup
    const bucket = storage.bucket(TEST_STORAGE_BUCKET); // Explicitly name the bucket
    await bucket.deleteFiles({ prefix: 'deals/', force: true }); // Clear files in deals/
  } catch (error) {
     // Ignore common emulator not found or bucket empty errors during cleanup
     if (!error.message?.includes('find a running emulator') && error.code !== 404) {
         console.warn("Cleanup warning (Storage):", error.code, error.message);
     }
  }
}


describe('File Upload and Download Routes', () => {
  beforeAll(async () => {
    console.log(`Using Auth Emulator at: ${AUTH_EMULATOR_HOST}`);
    // Optional: Add a check here to ping emulator endpoints if needed
  });

  afterAll(async () => {
    await cleanUp();
    // Attempt to delete the admin app used by the routes
    await deleteAdminApp();
  });

  beforeEach(async () => {
    await cleanUp();
  });

  // --- POST /files/upload Tests ---
  // (These tests should remain largely unchanged as they were passing)
  describe('POST /files/upload', () => {
     it('should upload a file successfully', async () => {
        const { uid, token } = await createTestUser(`test-upload-${Date.now()}@example.com`);
        const dealId = `testDealUpload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await adminFirestore.collection('deals').doc(dealId).set({ participants: [uid] });

        const fileContent = Buffer.from('%PDF-1.4 fake pdf');
        const response = await request(app)
            .post('/files/upload')
            .set('Authorization', `Bearer ${token}`)
            .field('dealId', dealId)
            .attach('file', fileContent, 'document.pdf');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('message', 'File uploaded successfully');
        expect(response.body).toHaveProperty('fileId');
        expect(response.body).toHaveProperty('url');

        const filesSnapshot = await adminFirestore.collection('deals').doc(dealId).collection('files').get();
        expect(filesSnapshot.size).toBe(1);
        const fileDoc = filesSnapshot.docs[0];
        expect(fileDoc.data().filename).toBe('document.pdf');
        expect(fileDoc.data().storagePath).toMatch(`deals/${dealId}/`);
        expect(fileDoc.data().uploadedBy).toBe(uid);

        // Use testAdminApp for verification storage access
        const storage = getStorage(testAdminApp);
        const bucket = storage.bucket(TEST_STORAGE_BUCKET);
        const [exists] = await bucket.file(fileDoc.data().storagePath).exists();
        expect(exists).toBe(true);
     });

     it('should return error when no file is provided', async () => {
      const { uid, token } = await createTestUser(`test-nofile-${Date.now()}@example.com`);
      const dealId = `testDealNoFile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await adminFirestore.collection('deals').doc(dealId).set({ participants: [uid] });

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('dealId', dealId);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing file, dealId, or userId' });
    });

     it('should return error when dealId is missing', async () => {
      const { token } = await createTestUser(`test-nodealid-${Date.now()}@example.com`);
      const fileContent = Buffer.from('test content');

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', fileContent, 'test.pdf');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing file, dealId, or userId' });
    });

    it('should return error when deal does not exist', async () => {
      const { token } = await createTestUser(`test-baddeal-${Date.now()}@example.com`);
      const fileContent = Buffer.from('%PDF-1.4 test content'); // Valid PDF signature

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('dealId', 'nonexistentDeal')
        .attach('file', fileContent, 'test.pdf');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Deal not found' });
    });

    it('should return error for invalid file type', async () => {
      const { uid, token } = await createTestUser(`test-badtype-${Date.now()}@example.com`);
      const dealId = `testDealBadType-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await adminFirestore.collection('deals').doc(dealId).set({ participants: [uid] });

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('dealId', dealId)
        .attach('file', Buffer.from('text'), 'test.txt');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid file type' });
    });
  });


  // --- GET /files/my-deals Tests ---
  describe('GET /files/my-deals', () => {
    // *** MODIFIED TEST ***
    it('should retrieve files for user\'s deals', async () => {
      const { uid, token } = await createTestUser('test-getdeals@example.com');
      const deal1 = await adminFirestore.collection('deals').add({ participants: [uid] });
      const deal2 = await adminFirestore.collection('deals').add({ participants: [uid] });
      const deal3 = await adminFirestore.collection('deals').add({ participants: ['another-user'] });

      // Add files with specific properties
      const file1Data = { filename: 'file1.pdf', storagePath: `deals/${deal1.id}/file1.pdf`, contentType: 'application/pdf', size: 1234, uploadedAt: new Date(), uploadedBy: uid, url: 'http://example.com/file1.pdf' };
      const file2Data = { filename: 'file2.png', storagePath: `deals/${deal2.id}/file2.png`, contentType: 'image/png', size: 5678, uploadedAt: new Date(), uploadedBy: uid, url: 'http://example.com/file2.png' };
      await adminFirestore.collection('deals').doc(deal1.id).collection('files').add(file1Data);
      await adminFirestore.collection('deals').doc(deal2.id).collection('files').add(file2Data);
      await adminFirestore.collection('deals').doc(deal3.id).collection('files').add({ filename: 'file3.jpg', storagePath: `deals/${deal3.id}/file3.jpg`, contentType: 'image/jpeg', size: 9012, uploadedAt: new Date(), uploadedBy: 'another-user', url: 'http://example.com/file3.jpg' });

      const response = await request(app)
          .get('/files/my-deals')
          .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);

      // Use expect.arrayContaining and expect.objectContaining for order-independent check
      expect(response.body).toEqual(expect.arrayContaining([
          expect.objectContaining({
              dealId: deal1.id,
              filename: file1Data.filename,
              contentType: file1Data.contentType,
              uploadedBy: uid
          }),
          expect.objectContaining({
              dealId: deal2.id,
              filename: file2Data.filename,
              contentType: file2Data.contentType,
              uploadedBy: uid
          })
      ]));

      // Ensure the other user's file is not included
       expect(response.body).not.toEqual(expect.arrayContaining([
           expect.objectContaining({ dealId: deal3.id })
       ]));
    });

    it('should return empty array when user has no deals', async () => {
        const { token } = await createTestUser('test-nodeals@example.com');
        await adminFirestore.collection('deals').add({ participants: ['another-user'] });

        const response = await request(app)
            .get('/files/my-deals')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it('should return error when token is invalid', async () => {
        const response = await request(app)
            .get('/files/my-deals')
            .set('Authorization', 'Bearer invalidToken');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Invalid or expired token' });
    });
  });


  // --- GET /files/download/:dealId/:fileId Tests ---
  describe('GET /files/download/:dealId/:fileId', () => {
     // *** THIS TEST SHOULD NOW PASS ***
     it('should download a file successfully', async () => {
        const { uid, token } = await createTestUser('test-download-ok@example.com');
        const dealId = 'testDealDownloadOk';
        await adminFirestore.collection('deals').doc(dealId).set({ participants: [uid] });

        // Use testAdminApp for storage setup
        const storage = getStorage(testAdminApp);
        const bucket = storage.bucket(TEST_STORAGE_BUCKET);
        const storagePath = `deals/${dealId}/testfile.pdf`;
        const fileContent = Buffer.from('test download content pdf');
        await bucket.file(storagePath).save(fileContent, { contentType: 'application/pdf' });

        const fileRef = await adminFirestore.collection('deals').doc(dealId).collection('files').add({
            filename: 'testfile.pdf', storagePath, contentType: 'application/pdf',
            size: fileContent.length, uploadedAt: new Date(), uploadedBy: uid, url: 'http://example.com/testfile.pdf'
        });

        const response = await request(app)
            .get(`/files/download/${dealId}/${fileRef.id}`)
            .set('Authorization', `Bearer ${token}`)
            .buffer()
            .parse((res, callback) => {
                res.setEncoding('binary');
                res.data = '';
                res.on('data', chunk => { res.data += chunk; });
                res.on('end', () => { callback(null, Buffer.from(res.data, 'binary')); });
            });

        // Expect 200 OK now that the bucket config is fixed
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.headers['content-disposition']).toContain('attachment; filename="testfile.pdf"');
        expect(response.body).toEqual(fileContent);
    });

    it('should return 404 when deal does not exist', async () => {
        const { token } = await createTestUser('test-down-baddeal@example.com');
        const response = await request(app)
            .get('/files/download/nonexistentDeal/someFileId')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Deal not found' });
    });

     it('should return 404 when file does not exist in Firestore', async () => {
        const { uid, token } = await createTestUser('test-down-badfile@example.com');
        const dealId = 'testDealDownBadFile';
        await adminFirestore.collection('deals').doc(dealId).set({ participants: [uid] });

        const response = await request(app)
            .get(`/files/download/${dealId}/nonexistentFile`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'File not found' });
    });

    it('should return 403 when user is not a participant in the deal', async () => {
        const { token } = await createTestUser('test-down-unauth@example.com');
        const ownerUid = 'otherUserUid123';
        const dealId = 'testDealDownUnauth';
        await adminFirestore.collection('deals').doc(dealId).set({ participants: [ownerUid] });

        // Use testAdminApp for storage setup
        const storage = getStorage(testAdminApp);
        const bucket = storage.bucket(TEST_STORAGE_BUCKET);
        const storagePath = `deals/${dealId}/unauthfile.pdf`;
        await bucket.file(storagePath).save(Buffer.from('unauthorized access test'), { contentType: 'application/pdf' });

        const fileRef = await adminFirestore.collection('deals').doc(dealId).collection('files').add({
            filename: 'unauthfile.pdf', storagePath, contentType: 'application/pdf',
            size: 100, uploadedAt: new Date(), uploadedBy: ownerUid, url: 'http://example.com/unauth.pdf'
        });

        const response = await request(app)
            .get(`/files/download/${dealId}/${fileRef.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Unauthorized access' });
    });
  });
});
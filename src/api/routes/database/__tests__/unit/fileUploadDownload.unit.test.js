// src/api/routes/database/__tests__/unit/fileUploadDownload.unit.test.js
import { jest } from '@jest/globals'; // Import the jest object

console.log('[LOG] Test file execution start: fileUploadDownload.unit.test.js');

const mocks = {};
console.log('[LOG] Initialized global mocks object');

const mockClientFirebaseStorageInstance = {
  type: 'mock-firebase-client-storage-instance',
  app: { name: '[MOCK_FIREBASE_APP_CLIENT]' },
};
const mockClientStorageReferenceInstance = {
  toString: () => 'gs://mock-bucket/mock-client-path.jpg',
  bucket: 'mock-client-bucket',
  fullPath: 'mock-client-path.jpg',
  name: 'mock-client-path.jpg',
};
console.log('[LOG] Defined static mock data (e.g., mockClientFirebaseStorageInstance)');

// This outer async IIFE is to allow top-level await for mocks and dynamic imports
(async () => {
  console.log('[LOG] Starting async mock setup using unstable_mockModule');

  jest.unstable_mockModule('url', () => {
    console.log('[LOG] unstable_mockModule factory for "url" executing');
    mocks.fileURLToPath = jest.fn((url) => {
      console.log(`[LOG] mock url.fileURLToPath called with: ${url}`);
      return url && url.includes && url.includes('fileUploadDownload.js') ? '/mocked/path/to/fileUploadDownload.js' : '/mocked/path/default_file.js';
    });
    return { fileURLToPath: mocks.fileURLToPath };
  });

  jest.unstable_mockModule('path', () => {
    console.log('[LOG] unstable_mockModule factory for "path" executing');
    mocks.dirname = jest.fn((filePath) => {
      console.log(`[LOG] mock path.dirname called with: ${filePath}`);
      return filePath === '/mocked/path/to/fileUploadDownload.js' ? '/mocked/path/to' : '/mocked/path';
    });
    return { dirname: mocks.dirname };
  });

  jest.unstable_mockModule('firebase-admin/auth', () => {
    console.log('[LOG] unstable_mockModule factory for "firebase-admin/auth" executing');
    mocks.verifyIdToken = jest.fn();
    mocks.getAdminAuth = jest.fn(() => ({ verifyIdToken: mocks.verifyIdToken }));
    return { getAuth: mocks.getAdminAuth };
  });

  jest.unstable_mockModule('firebase-admin/firestore', () => {
    console.log('[LOG] unstable_mockModule factory for "firebase-admin/firestore" executing');
    mocks.adminFirestoreCollection = jest.fn();
    mocks.adminFirestoreDoc = jest.fn();
    mocks.adminFirestoreGet = jest.fn();
    mocks.adminFirestoreAdd = jest.fn();
    mocks.adminFirestoreWhere = jest.fn();
    mocks.adminFirestoreDoc.mockImplementation(() => ({
      get: mocks.adminFirestoreGet,
      collection: mocks.adminFirestoreCollection,
      add: mocks.adminFirestoreAdd,
    }));
    mocks.adminFirestoreCollection.mockImplementation(() => ({
      doc: mocks.adminFirestoreDoc,
      where: mocks.adminFirestoreWhere,
      get: mocks.adminFirestoreGet,
      add: mocks.adminFirestoreAdd,
    }));
    mocks.adminFirestoreWhere.mockImplementation(() => ({ get: mocks.adminFirestoreGet }));
    mocks.getFirestore = jest.fn(() => ({ collection: mocks.adminFirestoreCollection, doc: mocks.adminFirestoreDoc }));
    return { getFirestore: mocks.getFirestore };
  });

  jest.unstable_mockModule('firebase-admin/storage', () => {
    console.log('[LOG] unstable_mockModule factory for "firebase-admin/storage" executing');
    mocks.adminStorageFileInstanceCreateReadStream = jest.fn();
    mocks.adminStorageFileInstance = { createReadStream: mocks.adminStorageFileInstanceCreateReadStream };
    mocks.adminBucketInstanceFile = jest.fn(() => mocks.adminStorageFileInstance);
    mocks.adminBucketInstance = { file: mocks.adminBucketInstanceFile };
    mocks.getAdminStorage = jest.fn(() => ({ bucket: () => mocks.adminBucketInstance }));
    return { getStorage: mocks.getAdminStorage };
  });

  jest.unstable_mockModule('firebase/storage', () => {
    console.log('[LOG] unstable_mockModule factory for "firebase/storage" executing');
    mocks.getClientStorage = jest.fn(() => mockClientFirebaseStorageInstance);
    mocks.ref = jest.fn(() => mockClientStorageReferenceInstance);
    mocks.uploadBytes = jest.fn();
    mocks.getDownloadURL = jest.fn();
    return { getStorage: mocks.getClientStorage, ref: mocks.ref, uploadBytes: mocks.uploadBytes, getDownloadURL: mocks.getDownloadURL };
  });

  jest.unstable_mockModule('uuid', () => {
    console.log('[LOG] unstable_mockModule factory for "uuid" executing');
    mocks.v4 = jest.fn();
    return { v4: mocks.v4 };
  });

  jest.unstable_mockModule('multer', () => {
    console.log('[LOG] unstable_mockModule factory for "multer" executing');
    mocks.multerMiddleware = jest.fn((req, res, next) => {
      console.log('[LOG] mock multerMiddleware executing');
      if (req.simulateMulterError) return next(new Error(req.simulateMulterError));
      if (req.attachMockFile) req.file = { ...req.attachMockFile };
      next();
    });
    mocks.multerSingle = jest.fn((fieldName) => {
      console.log(`[LOG] mock multer().single('${fieldName}') called`);
      return mocks.multerMiddleware;
    });
    const multerFactory = jest.fn((options) => {
      console.log('[LOG] mock multer factory called with options:', options);
      return { single: mocks.multerSingle };
    });
    mocks.multerFactory = multerFactory; 
    return { default: multerFactory }; 
  });

  jest.unstable_mockModule('../../../auth/authIndex.js', () => {
    console.log('[LOG] unstable_mockModule factory for "../../../auth/authIndex.js" executing');
    return { ethEscrowApp: { name: '[MOCK_FIREBASE_APP_CLIENT_FROM_AUTHINDEX]' } };
  });

  jest.unstable_mockModule('../../../auth/admin.js', () => {
    console.log('[LOG] unstable_mockModule factory for "../../../auth/admin.js" executing');
    return { adminApp: { name: '[MOCK_FIREBASE_ADMIN_APP_FROM_ADMINJS]' } };
  });

  console.log('[LOG] All unstable_mockModule calls processed.');

  // Dynamically import necessary modules for test setup and the module under test
  // This MUST happen after mocks are established and before describe() is called.
  const express = (await import('express')).default;
  const request = (await import('supertest')).default;
  const { Readable } = await import('stream');
  const fileUploadDownloadRouter = (await import('../../fileUploadDownload')).default;
  console.log('[LOG] Dynamically imported express, supertest, Readable, and fileUploadDownloadRouter.');

  // Now that all async setup (mocks and imports) is done, define the tests.
  describe('File Upload and Download Router Unit Tests', () => {
    let app;

    // Helper function to create a mock Express app
    // Defined inside describe or accessible in its scope, after express is imported.
    const setupApp = () => {
      console.log('[LOG] setupApp: Creating new Express app instance.');
      const appInstance = express();
      appInstance.use(express.json());
      appInstance.use('/files', fileUploadDownloadRouter);
      console.log('[LOG] setupApp: Express app configured with json middleware and router at /files.');
      return appInstance;
    };

    beforeEach(() => {
      console.log('[LOG] beforeEach: Test starting. Clearing and resetting all mocks.');
      Object.values(mocks).forEach(mockFn => {
        if (jest.isMockFunction(mockFn)) mockFn.mockClear();
      });
      if (mocks.adminStorageFileInstanceCreateReadStream) mocks.adminStorageFileInstanceCreateReadStream.mockClear();
      if (mocks.adminBucketInstanceFile) mocks.adminBucketInstanceFile.mockClear();

      console.log('[LOG] beforeEach: Setting default mock implementations.');
      mocks.verifyIdToken.mockResolvedValue({ uid: 'testUserId' });
      mocks.adminFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ participants: ['testUserId'], name: 'Test Deal' }),
        id: 'mockDealId',
        docs: [{ id: 'file1', data: () => ({ filename: 'file1.pdf', storagePath: 'path/to/file1.pdf', contentType: 'application/pdf', size:100, uploadedAt: { toDate: () => new Date() }, uploadedBy: 'user1' }) }]
      });
      mocks.adminFirestoreAdd.mockResolvedValue({ id: 'newFirestoreFileId' });

      const mockAdminReadStream = new Readable();
      mockAdminReadStream._read = () => {}; 
      mockAdminReadStream.pipe = jest.fn(destination => {
        console.log('[LOG] mockAdminReadStream.pipe called');
        mockAdminReadStream.emit('end'); 
        return destination;
      });
      mockAdminReadStream.on = jest.fn((event, handler) => mockAdminReadStream);
      mocks.adminStorageFileInstanceCreateReadStream.mockReturnValue(mockAdminReadStream);

      mocks.uploadBytes.mockResolvedValue({ metadata: { fullPath: 'deals/mockDealId/mock-uuid-v4-testfile.pdf' } });
      mocks.getDownloadURL.mockResolvedValue('http://mockdownloadurl.com/testfile.pdf');
      mocks.v4.mockReturnValue('mock-uuid-v4');
      mocks.multerMiddleware.mockImplementation((req, res, next) => {
          console.log('[LOG beforeEach] Default mock multerMiddleware executing');
          if (req.simulateMulterError) return next(new Error(req.simulateMulterError));
          if (req.attachMockFile) req.file = { ...req.attachMockFile };
          else if (!req.file && req.method === 'POST' && req.originalUrl === '/files/upload') { // Be more specific with path for default file
              req.file = { originalname: 'default.txt', mimetype: 'text/plain', buffer: Buffer.from('default'), size: 7 };
          }
          next();
      });
      mocks.fileURLToPath.mockImplementation((url) => {
          if (url && url.includes && url.includes('fileUploadDownload.js')) return '/mocked/path/to/fileUploadDownload.js';
          return '/mocked/path/default_file.js';
      });
      mocks.dirname.mockImplementation((filePath) => {
          if (filePath === '/mocked/path/to/fileUploadDownload.js') return '/mocked/path/to';
          return '/mocked/path';
      });

      app = setupApp(); // setupApp uses dynamically imported 'express' and 'fileUploadDownloadRouter'
      console.log('[LOG] beforeEach: Mocks reset and app re-initialized.');
    });

    // --- Test Suite for POST /upload ---
    describe('POST /files/upload', () => {
      const validToken = 'Bearer validtoken';
      const testDealId = 'testDealId123';
      const mockFilePayload = {
        originalname: 'test-upload.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('This is a test PDF.'),
        size: 12345,
      };

      it('should upload a file successfully with valid inputs', async () => {
        console.log('[LOG TEST] POST /upload: success case');
        mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) }); 
        mocks.adminFirestoreAdd.mockResolvedValueOnce({ id: 'newFileIdForUpload' }); 

        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', validToken)
          .field('dealId', testDealId)
          .attach('file', mockFilePayload.buffer, { filename: mockFilePayload.originalname, contentType: mockFilePayload.mimetype });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          message: 'File uploaded successfully',
          fileId: 'newFileIdForUpload',
          url: 'http://mockdownloadurl.com/testfile.pdf',
        });
        expect(mocks.verifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(mocks.adminFirestoreCollection).toHaveBeenCalledWith('deals');
        expect(mocks.adminFirestoreDoc).toHaveBeenCalledWith(testDealId);
        expect(mocks.v4).toHaveBeenCalled();
        expect(mocks.ref).toHaveBeenCalledWith(
          mockClientFirebaseStorageInstance,
          `deals/${testDealId}/mock-uuid-v4-${mockFilePayload.originalname}`
        );
        expect(mocks.uploadBytes).toHaveBeenCalledWith(
          mockClientStorageReferenceInstance,
          mockFilePayload.buffer, 
          { contentType: mockFilePayload.mimetype }
        );
        expect(mocks.getDownloadURL).toHaveBeenCalledWith(mockClientStorageReferenceInstance);
        expect(mocks.adminFirestoreAdd).toHaveBeenCalledWith(expect.objectContaining({
          filename: mockFilePayload.originalname,
          storagePath: `deals/${testDealId}/mock-uuid-v4-${mockFilePayload.originalname}`,
          url: 'http://mockdownloadurl.com/testfile.pdf',
          contentType: mockFilePayload.mimetype,
          uploadedBy: 'testUserId'
        }));
        expect(mocks.multerFactory).toHaveBeenCalled(); 
        expect(mocks.multerSingle).toHaveBeenCalledWith('file');
        expect(mocks.multerMiddleware).toHaveBeenCalled();
      });

      it('should return 401 if no token is provided', async () => {
        console.log('[LOG TEST] POST /upload: no token');
        const response = await request(app)
          .post('/files/upload')
          .field('dealId', testDealId)
          .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('No token provided');
      });
  
      it('should return 403 if token is invalid', async () => {
        console.log('[LOG TEST] POST /upload: invalid token');
        mocks.verifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', 'Bearer invalidtoken')
          .field('dealId', testDealId)
          .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Invalid or expired token');
      });
  
      it('should return 400 if dealId is missing', async () => {
          console.log('[LOG TEST] POST /upload: missing dealId');
          const response = await request(app)
            .post('/files/upload')
            .set('Authorization', validToken)
            .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Missing file, dealId, or userId');
      });
      
      it('should return 400 if file is missing', async () => {
          console.log('[LOG TEST] POST /upload: missing file');
          mocks.multerMiddleware.mockImplementationOnce((req, res, next) => {
              console.log('[LOG TEST] POST /upload: mock multerMiddleware for missing file test - req.file is undefined');
              next();
          });
          const response = await request(app)
            .post('/files/upload')
            .set('Authorization', validToken)
            .field('dealId', testDealId); 
          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Missing file, dealId, or userId');
      });
  
      it('should return 404 if deal is not found', async () => {
        console.log('[LOG TEST] POST /upload: deal not found');
        mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: false });
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', validToken)
          .field('dealId', 'nonExistentDealId')
          .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Deal not found');
      });
  
      it('should return 400 for invalid file type', async () => {
        console.log('[LOG TEST] POST /upload: invalid file type');
        const invalidFile = {
          originalname: 'test.txt',
          mimetype: 'text/plain', 
          buffer: Buffer.from('some text'),
        };
         mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) }); 
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', validToken)
          .field('dealId', testDealId)
          .attach('file', invalidFile.buffer, { filename: invalidFile.originalname, contentType: invalidFile.mimetype });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid file type');
      });
      
      it('should return 500 if multer processing fails', async () => {
          console.log('[LOG TEST] POST /upload: multer error');
          const multerErrorMessage = 'Simulated Multer Processing Error';
          mocks.multerMiddleware.mockImplementationOnce((req, res, next) => {
            console.log('[LOG TEST] Simulating multer error in middleware for POST /upload');
            next(new Error(multerErrorMessage));
          });
      
          const response = await request(app)
            .post('/files/upload')
            .set('Authorization', validToken)
            .field('dealId', testDealId)
            .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
      
          expect(response.status).toBe(500); 
          expect(response.body.error).toBe('Internal server error'); 
        });
  
      it('should return 500 if uploadBytes fails', async () => {
        console.log('[LOG TEST] POST /upload: uploadBytes failure');
        mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) });
        mocks.uploadBytes.mockRejectedValueOnce(new Error('Firebase Storage upload failed'));
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', validToken)
          .field('dealId', testDealId)
          .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Internal server error');
      });
  
      it('should return 500 if getDownloadURL fails', async () => {
          console.log('[LOG TEST] POST /upload: getDownloadURL failure');
          mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) });
          mocks.getDownloadURL.mockRejectedValueOnce(new Error('Firebase getDownloadURL failed'));
          const response = await request(app)
            .post('/files/upload')
            .set('Authorization', validToken)
            .field('dealId', testDealId)
            .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
          expect(response.status).toBe(500);
          expect(response.body.error).toBe('Internal server error');
        });
  
      it('should return 500 if Firestore add fails', async () => {
        console.log('[LOG TEST] POST /upload: Firestore add failure');
        mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) });
        mocks.adminFirestoreAdd.mockRejectedValueOnce(new Error('Firestore add failed'));
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', validToken)
          .field('dealId', testDealId)
          .attach('file', mockFilePayload.buffer, mockFilePayload.originalname);
        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Internal server error');
      });
    });

    describe('GET /files/my-deals', () => {
      const validToken = 'Bearer validtoken';
  
      it('should retrieve files for deals the user is part of', async () => {
        console.log('[LOG TEST] GET /my-deals: success with files');
        const mockDealsQuerySnapshot = {
          empty: false,
          docs: [{ id: 'deal1' }, { id: 'deal2' }],
        };
        const mockFilesSnapshotDeal1 = {
          docs: [
            { id: 'file1deal1', data: () => ({ filename: 'fileA.pdf', storagePath: 'path/A', contentType: 'application/pdf', size: 1, uploadedAt: { toDate: () => new Date('2023-01-01T10:00:00Z') }, uploadedBy: 'userA' }) },
          ],
        };
        const mockFilesSnapshotDeal2 = {
          docs: [
            { id: 'file1deal2', data: () => ({ filename: 'fileB.jpg', storagePath: 'path/B', contentType: 'img/jpg', size: 2, uploadedAt: { toDate: () => new Date('2023-01-02T11:00:00Z') }, uploadedBy: 'userB' }) },
          ],
        };
        mocks.adminFirestoreGet 
          .mockResolvedValueOnce(mockDealsQuerySnapshot) 
          .mockResolvedValueOnce(mockFilesSnapshotDeal1)   
          .mockResolvedValueOnce(mockFilesSnapshotDeal2);  
  
        const response = await request(app)
          .get('/files/my-deals')
          .set('Authorization', validToken);
  
        expect(response.status).toBe(200);
        expect(response.body).toEqual(expect.arrayContaining([
          expect.objectContaining({ dealId: 'deal1', fileId: 'file1deal1', filename: 'fileA.pdf', downloadPath: '/files/download/deal1/file1deal1' }),
          expect.objectContaining({ dealId: 'deal2', fileId: 'file1deal2', filename: 'fileB.jpg', downloadPath: '/files/download/deal2/file1deal2' }),
        ]));
        expect(mocks.verifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(mocks.adminFirestoreCollection).toHaveBeenCalledWith('deals');
        expect(mocks.adminFirestoreWhere).toHaveBeenCalledWith('participants', 'array-contains', 'testUserId');
      });
  
      it('should return 200 with an empty array if user has no deals', async () => {
        console.log('[LOG TEST] GET /my-deals: user has no deals');
        mocks.adminFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] }); 
        const response = await request(app)
          .get('/files/my-deals')
          .set('Authorization', validToken);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
      });
  
      it('should return 200 with an empty array if deals have no files', async () => {
          console.log('[LOG TEST] GET /my-deals: deals have no files');
          const mockDealsQuerySnapshot = { empty: false, docs: [{ id: 'deal1' }] };
          const mockFilesSnapshotNoFiles = { docs: [] };
          mocks.adminFirestoreGet
            .mockResolvedValueOnce(mockDealsQuerySnapshot) 
            .mockResolvedValueOnce(mockFilesSnapshotNoFiles); 
    
          const response = await request(app)
            .get('/files/my-deals')
            .set('Authorization', validToken);
          expect(response.status).toBe(200);
          expect(response.body).toEqual([]);
        });
  
      it('should return 401 if no token is provided', async () => {
        console.log('[LOG TEST] GET /my-deals: no token');
        const response = await request(app).get('/files/my-deals');
        expect(response.status).toBe(401);
      });
      
      it('should return 500 if Firestore query for deals fails', async () => {
          console.log('[LOG TEST] GET /my-deals: Firestore deals query failure');
          mocks.adminFirestoreGet.mockRejectedValueOnce(new Error('Firestore query for deals failed'));
          const response = await request(app)
            .get('/files/my-deals')
            .set('Authorization', validToken);
          expect(response.status).toBe(500);
          expect(response.body.error).toBe('Internal server error');
      });
  
      it('should return 500 if Firestore query for files fails', async () => {
          console.log('[LOG TEST] GET /my-deals: Firestore files query failure');
          const mockDealsQuerySnapshot = { empty: false, docs: [{ id: 'deal1' }] };
          mocks.adminFirestoreGet
              .mockResolvedValueOnce(mockDealsQuerySnapshot) 
              .mockRejectedValueOnce(new Error('Firestore query for files failed')); 
    
          const response = await request(app)
            .get('/files/my-deals')
            .set('Authorization', validToken);
          expect(response.status).toBe(500);
          expect(response.body.error).toBe('Internal server error');
      });
    });
  
    describe('GET /files/download/:dealId/:fileId', () => {
      const validToken = 'Bearer validtoken';
      const testDealId = 'dealDownload1';
      const testFileId = 'fileDownload1';
      const mockFileData = {
        filename: 'contract.pdf',
        storagePath: `deals/${testDealId}/contract.pdf`,
        contentType: 'application/pdf',
      };
  
      it('should download a file successfully', async () => {
        console.log('[LOG TEST] GET /download: success case');
        mocks.adminFirestoreGet 
          .mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) })
          .mockResolvedValueOnce({ exists: true, data: () => mockFileData });
  
        const response = await request(app)
          .get(`/files/download/${testDealId}/${testFileId}`)
          .set('Authorization', validToken);
  
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe(mockFileData.contentType);
        expect(response.headers['content-disposition']).toBe(`attachment; filename="${mockFileData.filename}"`);
        expect(mocks.verifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(mocks.adminFirestoreDoc).toHaveBeenCalledWith(testDealId); 
        expect(mocks.adminFirestoreDoc).toHaveBeenCalledWith(testFileId); 
        expect(mocks.adminBucketInstanceFile).toHaveBeenCalledWith(mockFileData.storagePath);
        expect(mocks.adminStorageFileInstanceCreateReadStream).toHaveBeenCalled();
        const mockReadStreamInstance = mocks.adminStorageFileInstanceCreateReadStream(); 
        expect(mockReadStreamInstance.pipe).toHaveBeenCalled();
      });
  
      it('should return 404 if deal not found', async () => {
        console.log('[LOG TEST] GET /download: deal not found');
        mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: false }); 
        const response = await request(app)
          .get(`/files/download/nonExistentDeal/${testFileId}`)
          .set('Authorization', validToken);
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Deal not found');
      });
  
      it('should return 403 if user is not a participant in the deal', async () => {
        console.log('[LOG TEST] GET /download: user not participant');
        mocks.adminFirestoreGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['otherUser'] }) }); 
        const response = await request(app)
          .get(`/files/download/${testDealId}/${testFileId}`)
          .set('Authorization', validToken); 
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Unauthorized access');
      });
  
      it('should return 404 if file not found in Firestore', async () => {
        console.log('[LOG TEST] GET /download: file not found in Firestore');
        mocks.adminFirestoreGet
          .mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) }) 
          .mockResolvedValueOnce({ exists: false }); 
        const response = await request(app)
          .get(`/files/download/${testDealId}/nonExistentFile`)
          .set('Authorization', validToken);
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('File not found');
      });
      
      it('should return 500 if createReadStream fails or stream errors', async () => {
          console.log('[LOG TEST] GET /download: createReadStream failure');
          mocks.adminFirestoreGet
            .mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) })
            .mockResolvedValueOnce({ exists: true, data: () => mockFileData });
          
          const streamError = new Error('Stream failed badly');
          const faultyMockReadStream = new Readable();
          faultyMockReadStream._read = () => {}; 
          faultyMockReadStream.pipe = jest.fn((resPipeDest) => { 
              console.log('[LOG TEST] Faulty stream pipe called');
              faultyMockReadStream.emit('error', streamError); 
              return resPipeDest; 
          });
           faultyMockReadStream.on = jest.fn((event, handler) => {
              return faultyMockReadStream;
          });
          mocks.adminStorageFileInstanceCreateReadStream.mockReturnValue(faultyMockReadStream);
    
          const response = await request(app)
            .get(`/files/download/${testDealId}/${testFileId}`)
            .set('Authorization', validToken);
          
          expect(response.status).toBe(500);
          expect(response.text).toBe('Error downloading file'); 
        });
  
      it('should return 401 if no token provided for download', async () => {
          console.log('[LOG TEST] GET /download: no token');
          const response = await request(app).get(`/files/download/${testDealId}/${testFileId}`);
          expect(response.status).toBe(401);
      });
    });
  }); // End of describe block
})(); // End of async IIFE for mock setup

console.log('[LOG] Test file execution end: fileUploadDownload.unit.test.js');

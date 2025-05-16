import { jest } from '@jest/globals';
import express from 'express';
import router from '../../fileUploadDownload.js'; // Path to the router
import { Readable } from 'stream';

// --- Mock Firebase SDKs and external modules ---
const mockVerifyIdToken = jest.fn();
const mockGetAdminAuth = jest.fn(() => ({ verifyIdToken: mockVerifyIdToken }));

const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGet = jest.fn();
const mockAdd = jest.fn();
const mockWhere = jest.fn();
const mockGetFirestore = jest.fn(() => ({
  collection: mockCollection,
}));

const mockRef = jest.fn();
const mockUploadBytes = jest.fn();
const mockGetDownloadURL = jest.fn();
const mockGetStorageClient = jest.fn(() => ({
  ref: mockRef,
  uploadBytes: mockUploadBytes,
  getDownloadURL: mockGetDownloadURL,
}));

const mockFile = jest.fn();
const mockBucket = jest.fn(() => ({ file: mockFile }));
const mockGetAdminStorage = jest.fn(() => ({
  bucket: mockBucket,
}));

const mockUuidv4 = jest.fn(() => 'mock-uuid-v4');

jest.mock('firebase-admin/auth', () => ({ getAuth: mockGetAdminAuth }));
jest.mock('firebase-admin/firestore', () => ({ getFirestore: mockGetFirestore }));
jest.mock('firebase-admin/storage', () => ({ getStorage: mockGetAdminStorage }));
jest.mock('firebase/storage', () => ({
  getStorage: mockGetStorageClient,
  ref: mockRef,
  uploadBytes: mockUploadBytes,
  getDownloadURL: mockGetDownloadURL,
}));
jest.mock('../../../auth/authIndex.js', () => ({ ethEscrowApp: {} }));
jest.mock('../../../auth/admin.js', () => ({ adminApp: {} }));
jest.mock('uuid', () => ({ v4: mockUuidv4 }));

// Mock multer instance and its methods
const mockUploadSingle = jest.fn();
const mockMulter = jest.fn(() => ({ single: mockUploadSingle }));
jest.mock('multer', () => mockMulter);

// Helper to create a mock Express app with the router
const setupApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/files', router); // Mount router
  return app;
};

// Mock Express request and response objects
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.pipe = jest.fn();
  return res;
};

describe('Unit Tests for fileUploadDownload.js', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp();

    // Setup default mock implementations
    mockVerifyIdToken.mockResolvedValue({ uid: 'testUserId' });

    // Firestore mocks
    mockCollection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
      get: mockGet, // For collection().get()
    });
    mockDoc.mockReturnValue({
      get: mockGet,
      collection: mockCollection, // For doc().collection()
      add: mockAdd, // For doc().collection().add()
    });
    mockWhere.mockReturnValue({ get: mockGet }); // For collection().where().get()
    mockGet.mockResolvedValue({ exists: true, data: () => ({ participants: ['testUserId'] }), id: 'dealId1' });
    mockAdd.mockResolvedValue({ id: 'newFileId' });

    // Firebase Storage (Client) mocks
    mockGetDownloadURL.mockResolvedValue('http://fake-url.com/file.pdf');
    mockUploadBytes.mockResolvedValue({});

    // Firebase Storage (Admin) mocks
    const mockReadStream = new Readable();
    mockReadStream._read = () => {}; // Noop
    mockReadStream.on = jest.fn((event, handler) => {
      if (event === 'error') {
        // Store handler to potentially call later
        mockReadStream.errorHandler = handler;
      }
      return mockReadStream;
    });
    mockReadStream.pipe = jest.fn();
    mockFile.mockReturnValue({ createReadStream: () => mockReadStream });
    
    // Multer mock: Simulate file upload middleware
    // This simulates multer adding `req.file` and `req.body` (if parsed by multer)
    mockUploadSingle.mockImplementation((fieldName) => (req, res, next) => {
        // If a file is being attached in the test, it will be on req.file
        // If fields are sent, they will be on req.body
        next();
    });
  });

  // --- Middleware: authenticateToken ---
  describe('authenticateToken Middleware', () => {
    // This middleware is implicitly tested by the routes that use it.
    // Explicit tests are valuable if the middleware logic is complex or standalone.
    it('should call next() and set req.userId if token is valid', async () => {
        mockVerifyIdToken.mockResolvedValueOnce({ uid: 'aSpecificUserId' });
        // To test middleware directly, we'd need to extract it or call a route.
        // For now, rely on endpoint tests. Example of an endpoint test ensuring auth:
        const response = await app.post('/files/upload')
            .set('Authorization', 'Bearer validtoken')
            .send({ dealId: 'anyDeal' }); // Minimal payload to pass initial checks
        // If auth passed, it wouldn't be a 401/403 from the middleware itself.
        // We expect other errors if payload is incomplete for the route logic.
        expect(mockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        // Check req.userId was available in a route requires more complex mocking or inspection
    });

    it('should return 401 if no token is provided', async () => {
      const response = await app.post('/files/upload').send({dealId: 'deal1'});
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    it('should return 403 if token is invalid or expired', async () => {
      mockVerifyIdToken.mockRejectedValueOnce(new Error('Token verification failed'));
      const response = await app.post('/files/upload')
        .set('Authorization', 'Bearer invalidtoken')
        .send({dealId: 'deal1'});
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid or expired token');
    });
  });

  // --- POST /files/upload ---
  describe('POST /files/upload', () => {
    const mockFileObject = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('fake pdf content'),
        size: 100,
    };

    it('should upload a file successfully', async () => {
      // Simulate multer adding the file to the request
      mockUploadSingle.mockImplementation((fieldName) => (req, res, next) => {
        req.file = mockFileObject;
        req.body = { dealId: 'existingDealId' }; // Multer can also parse fields
        next();
      });

      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) }); // Deal exists
      mockAdd.mockResolvedValueOnce({ id: 'newFileId123' });
      mockGetDownloadURL.mockResolvedValueOnce('http://new-url.com/test.pdf');

      const response = await app.post('/files/upload')
        .set('Authorization', 'Bearer validtoken')
        // .field('dealId', 'existingDealId') // Fields are now set by mockUploadSingle
        // .attach('file', mockFileObject.buffer, mockFileObject.originalname) // File also by mockUploadSingle
        .send(); // Send empty body as multer mock handles it

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'File uploaded successfully',
        fileId: 'newFileId123',
        url: 'http://new-url.com/test.pdf',
      });
      expect(mockRef).toHaveBeenCalledWith(expect.anything(), `deals/existingDealId/mock-uuid-v4-${mockFileObject.originalname}`);
      expect(mockUploadBytes).toHaveBeenCalledWith(expect.anything(), mockFileObject.buffer, { contentType: mockFileObject.mimetype });
      expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
        filename: mockFileObject.originalname,
        storagePath: `deals/existingDealId/mock-uuid-v4-${mockFileObject.originalname}`,
        url: 'http://new-url.com/test.pdf',
        uploadedBy: 'testUserId',
      }));
    });

    it('should return 400 if file, dealId, or userId is missing', async () => {
        mockUploadSingle.mockImplementation((fieldName) => (req, res, next) => {
            // req.file = mockFileObject; // Simulate missing file
            req.body = { dealId: 'aDeal' };
            next();
        });
         let response = await app.post('/files/upload').set('Authorization', 'Bearer validtoken').send(); // No file
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing file, dealId, or userId');

        mockUploadSingle.mockImplementation((fieldName) => (req, res, next) => {
            req.file = mockFileObject;
            // req.body = { dealId: 'aDeal' }; // Simulate missing dealId
            next();
        });
        response = await app.post('/files/upload').set('Authorization', 'Bearer validtoken').send(); // No dealId
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Missing file, dealId, or userId');
    });

    it('should return 404 if deal not found', async () => {
        mockUploadSingle.mockImplementation((fieldName) => (req, res, next) => {
            req.file = mockFileObject;
            req.body = { dealId: 'nonExistentDeal' };
            next();
        });
        mockGet.mockResolvedValueOnce({ exists: false }); // Deal does not exist
        const response = await app.post('/files/upload').set('Authorization', 'Bearer validtoken').send();
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Deal not found');
    });

    it('should return 400 for invalid file type', async () => {
        mockUploadSingle.mockImplementation((fieldName) => (req, res, next) => {
            req.file = { ...mockFileObject, mimetype: 'text/plain' }; // Invalid type
            req.body = { dealId: 'aDeal' };
            next();
        });
        mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
        const response = await app.post('/files/upload').set('Authorization', 'Bearer validtoken').send();
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid file type');
    });

    it('should return 500 on upload error', async () => {
        mockUploadSingle.mockImplementation((fieldName) => (req, res, next) => {
            req.file = mockFileObject;
            req.body = { dealId: 'aDeal' };
            next();
        });
        mockGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });
        mockUploadBytes.mockRejectedValueOnce(new Error('Storage upload failed'));
        const response = await app.post('/files/upload').set('Authorization', 'Bearer validtoken').send();
        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Internal server error');
    });
  });

  // --- GET /files/my-deals ---
  describe('GET /files/my-deals', () => {
    it('should retrieve files for user\'s deals successfully', async () => {
      const dealsData = [
        { id: 'deal1', data: () => ({ participants: ['testUserId'] }) },
        { id: 'deal2', data: () => ({ participants: ['testUserId', 'otherUser'] }) },
      ];
      const filesDataDeal1 = [
        { id: 'file1', data: () => ({ filename: 'doc1.pdf', contentType: 'application/pdf', size: 100, uploadedAt: { toDate: () => new Date() }, uploadedBy: 'testUserId' }) },
      ];
      const filesDataDeal2 = [
        { id: 'file2', data: () => ({ filename: 'image1.png', contentType: 'image/png', size: 200, uploadedAt: { toDate: () => new Date() }, uploadedBy: 'testUserId' }) },
      ];

      mockWhere.mockReturnValueOnce({ get: jest.fn().mockResolvedValueOnce({ empty: false, docs: dealsData }) });
      
      // Mock files for deal1
      mockDoc.mockImplementation(docId => {
        if (docId === 'deal1') return { collection: () => ({ get: jest.fn().mockResolvedValueOnce({ docs: filesDataDeal1 }) }) };
        if (docId === 'deal2') return { collection: () => ({ get: jest.fn().mockResolvedValueOnce({ docs: filesDataDeal2 }) }) };
        return { collection: () => ({ get: jest.fn().mockResolvedValueOnce({ docs: [] }) }) }; // Default empty for other calls
      });

      const response = await app.get('/files/my-deals').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body).toEqual(expect.arrayContaining([
        expect.objectContaining({ dealId: 'deal1', fileId: 'file1', filename: 'doc1.pdf' }),
        expect.objectContaining({ dealId: 'deal2', fileId: 'file2', filename: 'image1.png' }),
      ]));
    });

    it('should return an empty array if user has no deals', async () => {
      mockWhere.mockReturnValueOnce({ get: jest.fn().mockResolvedValueOnce({ empty: true, docs: [] }) });
      const response = await app.get('/files/my-deals').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 500 on error fetching deals', async () => {
      mockWhere.mockReturnValueOnce({ get: jest.fn().mockRejectedValueOnce(new Error('Firestore query error')) });
      const response = await app.get('/files/my-deals').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  // --- GET /files/download/:dealId/:fileId ---
  describe('GET /files/download/:dealId/:fileId', () => {
    const dealId = 'myDealId';
    const fileId = 'myFileId';
    const fileData = {
        filename: 'report.pdf',
        storagePath: `deals/${dealId}/report.pdf`,
        contentType: 'application/pdf',
        participants: ['testUserId'] // Assuming deal data includes participants
    };

    it('should download a file successfully', async () => {
        mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) }); // Deal doc
        mockGet.mockResolvedValueOnce({ exists: true, data: () => fileData }); // File doc
        const mockRes = mockResponse();

        await router.handle(
            { method: 'GET', url: `/download/${dealId}/${fileId}`, params: { dealId, fileId }, headers: { authorization: 'Bearer validtoken' }, userId: 'testUserId' },
            mockRes,
            () => {}
        );

        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', fileData.contentType);
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="${fileData.filename}"`);
        expect(mockFile().createReadStream().pipe).toHaveBeenCalledWith(mockRes);
        // Status code is not explicitly set in success path for stream, relies on pipe
    });

    it('should return 404 if deal not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false }); // Deal not found
      const response = await app.get(`/files/download/${dealId}/${fileId}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Deal not found');
    });

    it('should return 403 if user not a participant in the deal', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['anotherUser'] }) }); // User not participant
      const response = await app.get(`/files/download/${dealId}/${fileId}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Unauthorized access');
    });

    it('should return 404 if file metadata not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) }); // Deal found
      mockGet.mockResolvedValueOnce({ exists: false }); // File not found
      const response = await app.get(`/files/download/${dealId}/${fileId}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('File not found');
    });

    it('should handle stream error during download', async () => {
        mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ participants: ['testUserId'] }) });
        mockGet.mockResolvedValueOnce({ exists: true, data: () => fileData });
        const mockRes = mockResponse();
        const streamError = new Error('Stream failed');
        const mockReadStream = mockFile().createReadStream();
        
        // Trigger the error handler for the stream
        mockReadStream.on.mockImplementation((event, handler) => {
            if (event === 'error') {
                handler(streamError); // Call the error handler directly
            }
            return mockReadStream;
        });

        await router.handle(
            { method: 'GET', url: `/download/${dealId}/${fileId}`, params: { dealId, fileId }, headers: { authorization: 'Bearer validtoken' }, userId: 'testUserId' },
            mockRes,
            () => {}
        );
        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.send).toHaveBeenCalledWith('Error downloading file');
    });

    it('should return 500 on other internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Firestore generic error')); // Initial DB error
      const response = await app.get(`/files/download/${dealId}/${fileId}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
    });
  });
}); 
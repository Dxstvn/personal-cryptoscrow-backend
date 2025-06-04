// src/api/routes/database/__tests__/unit/fileUploadDownload.unit.test.js
import { jest } from '@jest/globals'; // Import the jest object
import { Readable } from 'stream'; // Import Readable statically as it doesn't need to be dynamic after mocks

console.log('[LOG] Test file execution start: fileUploadDownload.unit.test.js');

const mocks = {
  // Initialize all mock functions you'll use here
  // For example:
  fileURLToPath: jest.fn(),
  adminInitializeApp: jest.fn(),
  adminApp: jest.fn(),
  adminGetApps: jest.fn(),

  // Stable mock for the .file() method
  adminStorageFileMock: jest.fn(filePath => {
    console.log(`[LOG MOCK] adminStorageFileMock (formerly adminStorageInstance.bucket().file) called with: ${filePath}`);
    return mocks.adminStorageFileInstance; // Return the individual file operations mock
  }),

  adminStorageInstance: {
    bucket: jest.fn(() => ({
      name: 'mock-admin-bucket',
      // file: jest.fn(filePath => { // OLD inline mock
      //   console.log(`[LOG MOCK] adminStorageInstance.bucket().file called with: ${filePath}`);
      //   return mocks.adminStorageFileInstance;
      // }), 
      file: mocks.adminStorageFileMock, // Use the stable mock reference
    })),
  },
  adminStorageFileInstance: {
    createReadStream: jest.fn(() => {
      console.log('[LOG MOCK] adminStorageFileInstance.createReadStream called');
      // Return a new basic Readable stream for each call by default
      const stream = new Readable();
      stream._read = () => {};
      return stream;
    }),
    exists: jest.fn(() => {
      console.log('[LOG MOCK] adminStorageFileInstance.exists called');
      return Promise.resolve([true]); // Default to exists
    }),
    delete: jest.fn(() => {
      console.log('[LOG MOCK] adminStorageFileInstance.delete called');
      return Promise.resolve();
    }),
    getSignedUrl: jest.fn(() => {
      console.log('[LOG MOCK] adminStorageFileInstance.getSignedUrl called');
      return Promise.resolve(['http://fake-signed.url/default.jpg']);
    }),
  },
  databaseServiceGetDealById: jest.fn(),
  databaseServiceAddFileMetadata: jest.fn(),
  databaseServiceGetFileMetadata: jest.fn(),
  databaseServiceDeleteFileMetadata: jest.fn(),
  adminAuthVerifyIdToken: jest.fn(), // This will be configured in beforeEach
  getFirebaseAdminApp: jest.fn(),
  getFirebaseClientApp: jest.fn(),
  getFirebaseClientStorage: jest.fn(),
  clientStorageRef: jest.fn(),
  clientUploadBytesResumable: jest.fn(),
  clientUploadBytes: jest.fn(),
  clientGetDownloadURL: jest.fn(),
  clientDeleteObject: jest.fn(),
  multerInstance: {
    single: jest.fn(fieldName => {
      console.log(`[LOG MOCK GLOBAL] mocks.multerInstance.single setup for field: ${fieldName}. It will return mocks.multerMiddlewareHandler.`);
      // This 'single' method, when called (e.g., upload.single('file')),
      // should return the actual middleware function we want to control per test.
      return mocks.multerMiddlewareHandler; // Key change: return the handler directly
    }),
    array: jest.fn(fieldName => (req, res, next) => {
      console.log(`[LOG MOCK GLOBAL] Executing default pass-through multer middleware for field array: ${fieldName}`);
      next();
    }),
  },
  busboyConstructor: jest.fn(), // For Busboy mock
  connectStorageEmulator: jest.fn(),
  connectAuthEmulator: jest.fn(),
  getFirestore: jest.fn(), // This will be configured in the module mock
  firestoreInstance: {
    collection: jest.fn(collectionName => {
      console.log(`[LOG MOCK] firestoreInstance.collection called with: "${collectionName}"`);
      // Return a specific mock for 'deals' collection or a general one
      if (collectionName === 'deals') {
        // Potentially return a more specific collection mock if needed for complex queries
      }
      return mocks.firestoreCollectionInstance;
    }),
    doc: jest.fn(docPath => { // This is if db.doc() is called directly
      console.log(`[LOG MOCK] firestoreInstance.doc called with: "${docPath}"`);
      return mocks.firestoreDocInstance;
    }),
  },
  firestoreCollectionInstance: {
    doc: jest.fn(docId => {
      console.log(`[LOG MOCK] firestoreCollectionInstance.doc called with: "${docId}" (type: ${typeof docId})`);
      // Potentially return different doc instances based on docId if complex logic is needed
      // For now, always returns the same generic doc instance.
      return mocks.firestoreDocInstance;
    }),
    add: jest.fn(data => {
      console.log('[LOG MOCK] firestoreCollectionInstance.add called with data:', data);
      return Promise.resolve(mocks.firestoreDocRefInstance);
    }),
    where: jest.fn((...args) => {
      console.log(`[LOG MOCK] firestoreCollectionInstance.where called with: field='${args[0]}', opStr='${args[1]}', value='${args[2]}'`);
      return mocks.firestoreQueryInstance;
    }),
    get: jest.fn(() => {
      console.log('[LOG MOCK] firestoreCollectionInstance.get CALLED.');
      return Promise.resolve(mocks.firestoreQuerySnapshotInstance);
    }),
  },
  firestoreDocInstance: {
    get: jest.fn(() => {
      // This is the critical mock for document existence.
      // It will use the state of mocks.firestoreDocSnapshotInstance by default.
      // Tests needing specific exists state (e.g., false) should adjust mocks.firestoreDocSnapshotInstance.exists
      // or mock this 'get' function directly (e.g., mockResolvedValueOnce).
      console.log(`[LOG MOCK] firestoreDocInstance.get CALLED. Returning snapshot with exists: ${mocks.firestoreDocSnapshotInstance.exists}`);
      return Promise.resolve(mocks.firestoreDocSnapshotInstance);
    }),
    set: jest.fn(data => {
      console.log('[LOG MOCK] firestoreDocInstance.set called with data:', data);
      return Promise.resolve();
    }),
    update: jest.fn(data => {
      console.log('[LOG MOCK] firestoreDocInstance.update called with data:', data);
      return Promise.resolve();
    }),
    delete: jest.fn(() => {
      console.log('[LOG MOCK] firestoreDocInstance.delete called');
      return Promise.resolve();
    }),
    collection: jest.fn(subCollectionName => {
      console.log(`[LOG MOCK] firestoreDocInstance.collection called for sub-collection: "${subCollectionName}"`);
      return mocks.firestoreCollectionInstance; // Assuming subcollections behave like top-level ones for now
    }),
  },
  firestoreDocRefInstance: {
    id: 'mockGeneratedIdByAdd',
    // other DocumentReference properties if needed
  },
  firestoreDocSnapshotInstance: { // Default state for a document snapshot
    exists: true, // Default to true, tests can override this for "not found" cases
    data: jest.fn(() => {
      console.log('[LOG MOCK] firestoreDocSnapshotInstance.data CALLED.');
      return { defaultMockData: true, participants: [/* default participants if any */] };
    }),
    id: 'mockGlobalDocId',
  },
  firestoreQueryInstance: {
    where: jest.fn((...args) => {
      console.log(`[LOG MOCK] firestoreQueryInstance.where called with: field='${args[0]}', opStr='${args[1]}', value='${args[2]}'`);
      return mocks.firestoreQueryInstance;
    }),
    orderBy: jest.fn(() => mocks.firestoreQueryInstance),
    limit: jest.fn(() => mocks.firestoreQueryInstance),
    get: jest.fn(() => {
      console.log('[LOG MOCK] firestoreQueryInstance.get CALLED.');
      return Promise.resolve(mocks.firestoreQuerySnapshotInstance);
    }),
  },
  firestoreQuerySnapshotInstance: { // Default state for a query snapshot
    empty: false, // Default to not empty
    docs: [],     // Default to empty array of docs, tests should populate for results
    forEach: jest.fn(callback => mocks.firestoreQuerySnapshotInstance.docs.forEach(callback)),
  },
  v4: jest.fn(() => 'mock-uuid-v4'),
  mockEthEscrowApp: { name: 'mockEthEscrowApp' },
  mockAdminApp: { name: 'mockAdminAppFirebase' }, // Ensure this is distinct if needed
  mockMemoryStorageResult: { type: 'mock-memory-storage' },
  // New mock for the actual multer middleware handler
  multerMiddlewareHandler: jest.fn((req, res, next) => {
    console.log('[LOG MOCK GLOBAL] Executing default pass-through multer middleware HANDLER. This handler should be overridden by test-specific implementations.');
    // By default, this does not populate req.file. Tests need to mock its implementation.
    next();
  }),
};
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


// Configure all unstable_mockModule calls at the top-level
console.log('[LOG] Starting unstable_mockModule setup');

jest.unstable_mockModule('url', () => {
  console.log('[LOG] unstable_mockModule factory for "url" executing');
  // Ensure the mock function is assigned to the mocks object if it's used elsewhere by that name
  mocks.fileURLToPath = jest.fn((url) => {
    console.log(`[LOG] mock url.fileURLToPath called with: ${url}`);
    return url && url.includes && url.includes('fileUploadDownload.js') ? '/mocked/path/to/fileUploadDownload.js' : '/mocked/path/default_file.js';
  });
  return {
    fileURLToPath: mocks.fileURLToPath,
    // Add other 'url' module exports if your code uses them
  };
});

jest.unstable_mockModule('firebase-admin/app', () => {
  console.log('[LOG] unstable_mockModule factory for "firebase-admin/app" executing');
  // Ensure mock functions are pre-defined in the `mocks` object or assigned here
  // and then returned in the module structure.
  return {
    initializeApp: mocks.adminInitializeApp,
    getApps: mocks.adminGetApps,
    app: mocks.adminApp, // Assuming 'app' is a named export or similar
    // Add other 'firebase-admin/app' exports if used
  };
});

jest.unstable_mockModule('firebase-admin/storage', () => {
  console.log('[LOG] unstable_mockModule factory for "firebase-admin/storage" executing');
  return {
    getStorage: jest.fn(() => mocks.adminStorageInstance), // mocks.adminStorageInstance should be predefined
    // Add other 'firebase-admin/storage' exports if used
  };
});

jest.unstable_mockModule('firebase-admin/auth', () => {
  console.log('[LOG] unstable_mockModule factory for "firebase-admin/auth" executing');
  return {
    getAuth: jest.fn(() => ({
      verifyIdToken: mocks.adminAuthVerifyIdToken, // Ensure this is assigned
    })),
  };
});

jest.unstable_mockModule('firebase/app', () => {
  console.log('[LOG] unstable_mockModule factory for "firebase/app" executing');
  return {
    initializeApp: mocks.getFirebaseClientApp, // Or however client app is initialized/retrieved
    getApps: jest.fn(() => []), // Mock implementation for getApps
    // Add other 'firebase/app' exports if used
  };
});

jest.unstable_mockModule('firebase/storage', () => {
  console.log('[LOG] unstable_mockModule factory for "firebase/storage" executing');
  return {
    getStorage: mocks.getFirebaseClientStorage,
    ref: mocks.clientStorageRef,
    uploadBytesResumable: mocks.clientUploadBytesResumable,
    uploadBytes: mocks.clientUploadBytes,
    getDownloadURL: mocks.clientGetDownloadURL,
    deleteObject: mocks.clientDeleteObject,
    connectStorageEmulator: mocks.connectStorageEmulator,
    // Add other 'firebase/storage' exports if used
  };
});

jest.unstable_mockModule('firebase/auth', () => {
  console.log('[LOG] unstable_mockModule factory for "firebase/auth" executing');
  return {
    getAuth: jest.fn(() => ({
      // Add any client auth mock methods if needed
    })),
    connectAuthEmulator: mocks.connectAuthEmulator,
    // Add other 'firebase/auth' exports if used
  };
});


// Mocking multer
jest.unstable_mockModule('multer', () => {
  console.log('[LOG] unstable_mockModule factory for "multer" executing');
  const mockMulterFunction = jest.fn(options => {
    console.log('[LOG MOCK GLOBAL] multer() factory function called with options:', options);
    // multer() returns an object with a `single` method (and others like `array`, `fields`).
    // That `single` method, when called (e.g., `upload.single('file')`), returns the actual middleware.
    return mocks.multerInstance; // mocks.multerInstance has .single(), .array()
  });
  mockMulterFunction.memoryStorage = jest.fn(() => {
    console.log('[LOG MOCK GLOBAL] multer.memoryStorage() called');
    return mocks.mockMemoryStorageResult;
  });
  return {
    // When `import multer from 'multer'` is used, `multer` is `mockMulterFunction`.
    default: mockMulterFunction,
  };
});


// Mocking busboy if used directly or by a dependency like connect-busboy
jest.unstable_mockModule('busboy', () => {
    console.log('[LOG] unstable_mockModule factory for "busboy" executing');
    // mocks.busboyInstance should mock the Busboy class/interface
    // For example, it should be a constructor that can be instantiated with `new Busboy()`
    // and should handle events like 'file', 'field', 'finish', 'error'.
    // This is a simplified placeholder. A full Busboy mock can be complex.
    const MockBusboy = jest.fn(function(options) {
        this.on = jest.fn((event, callback) => {
            // Simulate events based on test needs
            if (event === 'field' && options.testFields) {
                options.testFields.forEach(field => callback(field.name, field.value));
            }
            if (event === 'file' && options.testFile) {
                 const mockFileStream = new Readable();
                 mockFileStream._read = () => {};
                 // Push data to stream and end it to simulate file upload
                 process.nextTick(() => {
                    mockFileStream.push(options.testFile.buffer);
                    mockFileStream.push(null); // End of stream
                 });
                callback(options.testFile.fieldname, mockFileStream, { filename: options.testFile.originalname, encoding: 'utf8', mimeType: options.testFile.mimetype });
            }
            if (event === 'finish' && !options.testError) {
                 process.nextTick(() => callback());
            }
            if (event === 'error' && options.testError) {
                process.nextTick(() => callback(options.testError));
            }
            return this; // Allow chaining .on() calls
        });
        this.end = jest.fn((data) => { // Mock the .end() method if it's called
            if (data && this.on.mock.calls.some(call => call[0] === 'data')) { // If there's a 'data' handler
                this.on.mock.calls.find(call => call[0] === 'data')[1](data); // Call it
            }
            if (this.on.mock.calls.some(call => call[0] === 'finish') && !options.testError) {
                 // Find the 'finish' handler and call it
                 const finishHandler = this.on.mock.calls.find(call => call[0] === 'finish')[1];
                 if (finishHandler) finishHandler();
            }
        });

        // If busboy is piped to, e.g., req.pipe(busboy), we need to simulate that.
        // This typically involves the 'end' method being called on the source stream (req).
        // For testing, you might directly call busboy.end(req.body) or simulate stream events.
        return this;
    });
    return MockBusboy; // Export the constructor
});


// Mocking helperFunctions.js if it's used by fileUploadDownload.js
jest.unstable_mockModule('../../../../../helperFunctions.js', () => {
    console.log('[LOG] unstable_mockModule factory for "../../../../../helperFunctions.js" executing');
    return {
        // Add any functions from helperFunctions.js that are used by the router
        // For example:
        // generateUniqueId: jest.fn(() => 'mock-unique-id'),
        // formatError: jest.fn(err => ({ message: err.message || 'Mock error' })),
    };
});


// Mocking databaseService.js
jest.unstable_mockModule('../../../../../services/databaseService.js', () => {
  console.log('[LOG] unstable_mockModule factory for "../../../../../services/databaseService.js" executing');
  return {
    getDealById: mocks.databaseServiceGetDealById,
    addFileMetadata: mocks.databaseServiceAddFileMetadata,
    getFileMetadata: mocks.databaseServiceGetFileMetadata,
    deleteFileMetadata: mocks.databaseServiceDeleteFileMetadata,
    // Add other functions from databaseService.js if used
  };
});

// Mocking firebase-admin/firestore
jest.unstable_mockModule('firebase-admin/firestore', () => {
  console.log('[LOG] unstable_mockModule factory for "firebase-admin/firestore" executing');
  mocks.getFirestore.mockReturnValue(mocks.firestoreInstance); // Ensure getFirestore returns the mock instance
  return {
    getFirestore: mocks.getFirestore,
    // Add other exports like Timestamp, FieldValue if used directly by the router
  };
});

// Mocking uuid
jest.unstable_mockModule('uuid', () => {
  console.log('[LOG] unstable_mockModule factory for "uuid" executing');
  return {
    v4: mocks.v4,
  };
});

// Mocking authIndex.js
// Relative path from fileUploadDownload.unit.test.js to authIndex.js
// __tests__/unit/ -> ../../ -> database/ -> ../ -> routes/ -> ../ -> api/
// So, ../../../../auth/authIndex.js
jest.unstable_mockModule('../../../auth/authIndex.js', () => {
  console.log('[LOG] unstable_mockModule factory for "../../../auth/authIndex.js" executing');
  return {
    ethEscrowApp: mocks.mockEthEscrowApp, // Provide the mock app instance
  };
});

// Mocking admin.js
// Relative path from fileUploadDownload.unit.test.js to admin.js
jest.unstable_mockModule('../../../auth/admin.js', () => {
  console.log('[LOG] unstable_mockModule factory for "../../../auth/admin.js" executing');
  return {
    adminApp: mocks.mockAdminApp, // Provide the mock admin app instance
    getAdminApp: jest.fn().mockResolvedValue(mocks.mockAdminApp),
    // Mock deleteAdminApp if it were ever called by the router (it isn't)
    // deleteAdminApp: jest.fn(),
  };
});

// Mocking securityMiddleware.js for rate limiting
jest.unstable_mockModule('../../../../middleware/securityMiddleware.js', () => {
  console.log('[LOG] unstable_mockModule factory for "../../../../middleware/securityMiddleware.js" executing');
  return {
    fileUploadRateLimit: jest.fn((req, res, next) => {
      console.log('[LOG MOCK] fileUploadRateLimit middleware called - passing through');
      next(); // Just pass through for tests
    }),
    // Add other middleware exports if needed
  };
});

console.log('[LOG] All unstable_mockModule calls processed.');

// Declare variables for modules to be imported dynamically
let express;
let request; // supertest
let fileUploadDownloadRouter;
let app;
let server; // Hold a reference to the server instance

beforeAll(async () => {
  console.log('[LOG] beforeAll: Starting dynamic imports');

  // Dynamically import modules AFTER mocks are established.
  express = (await import('express')).default;
  request = (await import('supertest')).default;
  // Readable is imported statically at the top now.
  // const { Readable } = await import('stream'); // No longer needed here if imported statically
  fileUploadDownloadRouter = (await import('../../fileUploadDownload')).default; // The router being tested

  console.log('[LOG] beforeAll: Dynamically imported express, supertest, and fileUploadDownloadRouter.');

  // Initialize Express app
  app = express();
  app.use(express.json()); // Middleware to parse JSON bodies

  // You might need to mock authentication middleware if your router uses it.
  // For example, if you have a middleware that uses admin.auth().verifyIdToken():
  app.use(async (req, res, next) => {
    const token = req.headers.authorization;
    if (token && token.startsWith('valid')) { // Simplified mock auth
      try {
        req.user = await mocks.adminAuthVerifyIdToken(token); // Uses the mocked function
        // adminAuthVerifyIdToken should be mocked to return a user object or throw an error
      } catch (error) {
        // If token is invalid as per mock logic, don't set req.user or handle as unauthenticated
        console.log('[LOG MOCK AUTH] Mock verifyIdToken error:', error.message);
        // Depending on how strict your tests are, you might want to clear req.user or send 401 here
        // For unit tests of routes, often we ensure req.user is set for protected routes.
      }
    }
    next();
  });


  // Mount the router
  app.use('/files', fileUploadDownloadRouter);
  console.log('[LOG] beforeAll: Express app configured with router.');
  server = app.listen(); // Start the server and keep a reference
});

afterAll((done) => {
  console.log('[LOG] afterAll: Closing server.');
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

// describe block is now outside any IIFE and will run after beforeAll completes
describe('File Upload/Download Routes (Unit)', () => {
  // Define common test variables
  const testDealId = 'testDealId123';
  const testFileId = 'testFileIdABC';
  const testUserId = 'testUserIdXYZ';
  const validToken = `validTokenFor_${testUserId}`; // Example valid token
  const bearerToken = `Bearer ${validToken}`;

  // Reset mocks before each test to ensure test isolation
  beforeEach(() => {
    jest.clearAllMocks(); // Clears all mock call history, etc.

    // Reset parts of the global mocks object to a default state for each test.
    // This is crucial if tests modify these objects (e.g. snapshot.exists).
    mocks.firestoreDocSnapshotInstance.exists = true; // Default to true for most tests
    mocks.firestoreDocSnapshotInstance.data = jest.fn(() => ({
        dealId: testDealId, // Sensible default
        participants: [testUserId, 'otherUser'], // Default participants
        filename: 'default-test.jpg',
        uploadedBy: testUserId,
        gcsPath: `uploads/${testDealId}/default-test.jpg`,
        storagePath: `uploads/${testDealId}/default-test.jpg`,
        downloadUrl: 'http://fake.url/default-test.jpg',
        contentType: 'image/jpeg',
    }));
    mocks.firestoreQuerySnapshotInstance.empty = false;
    mocks.firestoreQuerySnapshotInstance.docs = [];

    // Reset the multerMiddlewareHandler's implementation for each test
    // This ensures that if a test forgets to mock it, it uses a known default,
    // or we can make the default throw an error to force explicit mocking.
    mocks.multerMiddlewareHandler.mockImplementation((req, res, next) => {
        console.log('[LOG MOCK beforeEach] Executing reset default multerMiddlewareHandler (pass-through)');
        next();
    });

    // Setup default mock implementations that might be common across tests
    mocks.adminAuthVerifyIdToken.mockImplementation(async (token) => {
      console.log(`[LOG MOCK AUTH] adminAuthVerifyIdToken called with token: ${token}`);
      // The actual 'authenticateToken' middleware splits "Bearer <token>"
      // So this mock will receive the <token> part.
      if (token === validToken || (typeof token === 'string' && token.startsWith('validTokenFor_'))) {
        const userIdFromToken = token.substring('validTokenFor_'.length);
        console.log(`[LOG MOCK AUTH] Mock token SUCCESS for user: ${userIdFromToken}`);
        return { uid: userIdFromToken, email: `${userIdFromToken}@example.com` };
      }
      console.log(`[LOG MOCK AUTH] Mock token FAILURE for token: ${token}`);
      throw new Error('Invalid mock token by adminAuthVerifyIdToken');
    });

    mocks.databaseServiceGetDealById.mockResolvedValue({
      exists: true,
      data: () => ({ participants: [testUserId, 'otherUser'] }),
    });
    mocks.databaseServiceGetFileMetadata.mockResolvedValue({
        exists: true,
        data: () => ({
            dealId: testDealId,
            filename: 'test.jpg',
            uploadedBy: testUserId,
            gcsPath: `uploads/${testDealId}/test.jpg`,
            downloadUrl: 'http://fake.url/test.jpg',
        }),
    });
    mocks.adminStorageFileInstance.exists.mockResolvedValue([true]);
    mocks.adminStorageFileInstance.getSignedUrl.mockResolvedValue(['http://fake-signed.url/test.jpg']);
    mocks.adminStorageFileInstance.createReadStream.mockImplementation(() => {
        console.log('[LOG MOCK beforeEach] adminStorageFileInstance.createReadStream called');
        const stream = new Readable();
        stream._read = () => {};
        return stream;
    });

    // Configure the general firestoreDocInstance.get to return the default snapshot
    // This will be used by db.collection().doc().get()
    mocks.firestoreDocInstance.get.mockImplementation(() => {
        console.log(`[LOG MOCK beforeEach] firestoreDocInstance.get returning default snapshot. exists: ${mocks.firestoreDocSnapshotInstance.exists}`);
        return Promise.resolve(mocks.firestoreDocSnapshotInstance);
    });

  });

  describe('POST /upload/:dealId', () => {
    console.log('[LOG TEST GROUP] Starting tests for POST /upload/:dealId');
    it('should upload a file successfully and return 201', async () => {
      console.log('[LOG TEST] POST /upload: successful upload');
      // Create a buffer with proper JPEG signature
      const mockFileBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Buffer.from('fake jpeg data')]);
      const mockFileName = 'test-upload.jpg';
      const mockFileMimeType = 'image/jpeg';

      // Configure multer mock for this test
      mocks.multerMiddlewareHandler.mockImplementationOnce((req, res, next) => {
        req.file = {
          originalname: mockFileName,
          mimetype: mockFileMimeType,
          buffer: mockFileBuffer,
          size: mockFileBuffer.length,
        };
        // Explicitly set dealId in req.body for robustness with mock middleware
        req.body = { ...req.body, dealId: testDealId }; 
        console.log('[LOG MOCK multerMiddlewareHandler specific test] Populated req.file and req.body.dealId for successful upload test.');
        next();
      });

      // Ensure the deal document exists for this test
      mocks.firestoreDocSnapshotInstance.exists = true;
      mocks.firestoreDocSnapshotInstance.data = jest.fn(() => ({
        participants: [testUserId, 'anotherUser'], // User is a participant
      }));
      // mocks.firestoreDocInstance.get is already configured in beforeEach to return this snapshot

      mocks.databaseServiceAddFileMetadata.mockResolvedValue({ id: testFileId }); // Not directly used by route

      // Mock client-side Firebase Storage operations (used by the route)
      mocks.clientStorageRef.mockReturnValue(mockClientStorageReferenceInstance);
      mocks.clientUploadBytes.mockResolvedValue({ ref: mockClientStorageReferenceInstance });
      mocks.clientGetDownloadURL.mockResolvedValue(`https://firebasestorage.googleapis.com/v0/b/mock-bucket/o/${mockFileName}?alt=media`);

      const response = await request(app)
        .post(`/files/upload`) // No dealId in path
        .set('Authorization', bearerToken) // Use bearerToken
        .field('dealId', testDealId) // Send dealId in the body
        .attach('file', mockFileBuffer, { filename: mockFileName, contentType: mockFileMimeType });

      expect(response.status).toBe(200); // Route returns 200 on success
      expect(response.body).toHaveProperty('message', 'File uploaded successfully');
      expect(response.body).toHaveProperty('fileId'); // fileId is generated by Firestore `add`
      expect(response.body).toHaveProperty('url'); // Check for presence of download URL

      // Check if the correct Firestore document was fetched for deal validation
      expect(mocks.firestoreInstance.collection).toHaveBeenCalledWith('deals');
      expect(mocks.firestoreCollectionInstance.doc).toHaveBeenCalledWith(testDealId);
      expect(mocks.firestoreDocInstance.get).toHaveBeenCalledTimes(1); // Once for deal check


      // Check client storage mocks
      expect(mocks.clientStorageRef).toHaveBeenCalled();
      expect(mocks.clientUploadBytes).toHaveBeenCalled(); // Route uses uploadBytes
      expect(mocks.clientGetDownloadURL).toHaveBeenCalled();
      
      // Check Firestore set for metadata (route uses dealRef.collection('files').doc(fileId).set())
      expect(mocks.firestoreDocInstance.collection).toHaveBeenCalledWith('files');
      expect(mocks.firestoreDocInstance.set).toHaveBeenCalledWith(expect.objectContaining({
        filename: mockFileName,
        uploadedBy: testUserId, // From authenticated user
        contentType: mockFileMimeType,
      }));
    });

    it('should return 401 if no token is provided', async () => {
        console.log('[LOG TEST] POST /upload: no token');
        const response = await request(app)
            .post(`/files/upload`)
            .field('dealId', testDealId)
            .attach('file', Buffer.from('test'), 'test.txt');
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'No token provided' });
    });
    
    it('should return 403 if token is invalid', async () => {
        console.log('[LOG TEST] POST /upload: invalid token');
        const response = await request(app)
            .post(`/files/upload`)
            .set('Authorization', 'Bearer invalidTestToken')
            .field('dealId', testDealId)
            .attach('file', Buffer.from('test'), 'test.txt');
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Invalid or expired token' });
    });

    it('should return 404 if deal not found', async () => {
        console.log('[LOG TEST] POST /upload: deal not found');
        // Create a buffer with proper PDF signature so it passes file validation
        const mockFileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, ...Buffer.from('fake pdf data')]);
        const mockFileName = 'test-dealnotfound.pdf';

        // Configure multer mock for this test
        mocks.multerMiddlewareHandler.mockImplementationOnce((req, res, next) => {
            req.file = {
                originalname: mockFileName,
                mimetype: 'application/pdf',
                buffer: mockFileBuffer,
                size: mockFileBuffer.length,
            };
            // Explicitly set dealId in req.body for robustness with mock middleware
            req.body = { ...req.body, dealId: 'nonExistentDealId' };
            console.log('[LOG MOCK multerMiddlewareHandler specific test] Populated req.file and req.body.dealId for deal not found test');
            next();
        });
        // Simulate deal not found
        mocks.firestoreDocSnapshotInstance.exists = false;
        // mocks.firestoreDocInstance.get is already configured in beforeEach to return this snapshot state

        const response = await request(app)
            .post(`/files/upload`)
            .set('Authorization', bearerToken)
            .field('dealId', 'nonExistentDealId')
            .attach('file', mockFileBuffer, { filename: mockFileName, contentType: 'application/pdf' });
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Deal not found' });
        expect(mocks.firestoreCollectionInstance.doc).toHaveBeenCalledWith('nonExistentDealId');
    });

    it('should return 400 if file type is invalid', async () => {
        console.log('[LOG TEST] POST /upload: invalid file type');
        const mockFileBuffer = Buffer.from('test content for invalid type');
        const mockInvalidFileType = 'application/x-msdownload';

        // Configure multer mock for this test
        mocks.multerMiddlewareHandler.mockImplementationOnce((req, res, next) => {
            req.file = {
                originalname: 'test.exe',
                mimetype: mockInvalidFileType, // This mimetype will be checked by the route
                buffer: mockFileBuffer,
                size: mockFileBuffer.length,
            };
            // Explicitly set dealId in req.body for robustness with mock middleware
            req.body = { ...req.body, dealId: testDealId };
            console.log('[LOG MOCK multerMiddlewareHandler specific test] Populated req.file and req.body.dealId for invalid file type test');
            next();
        });

        mocks.firestoreDocSnapshotInstance.exists = true; // Deal exists
        mocks.firestoreDocSnapshotInstance.data = jest.fn()
            .mockReturnValueOnce({ participants: [testUserId, 'otherUser'] }) // For deal check
            .mockReturnValueOnce({ // For file metadata check
                dealId: testDealId,
                filename: 'test.jpg', // Corrected: was fileName
                uploadedBy: testUserId,
                gcsPath: `uploads/${testDealId}/test.jpg`, // Used by admin storage
                storagePath: `uploads/${testDealId}/test.jpg`, // Used by admin storage
                contentType: 'image/jpeg',
            });

        const response = await request(app)
            .post(`/files/upload`)
            .set('Authorization', bearerToken)
            .field('dealId', testDealId)
            .attach('file', Buffer.from('test'), { filename: 'test.exe', contentType: 'application/octet-stream' });
        
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'File signature does not match declared type' });
    });

    it('should return 500 if Firestore add operation fails', async () => {
      console.log('[LOG TEST] POST /upload: Firestore add operation failure');
      // Create a buffer with proper JPEG signature
      const mockFileBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Buffer.from('fake jpeg data')]);
      const mockFileName = 'test-upload-failure.jpg';
      const mockFileMimeType = 'image/jpeg';
      const genericError = new Error('Simulated Firestore add error');

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mocks.multerMiddlewareHandler.mockImplementationOnce((req, res, next) => {
        req.file = {
          originalname: mockFileName,
          mimetype: mockFileMimeType,
          buffer: mockFileBuffer,
          size: mockFileBuffer.length,
        };
        req.body = { ...req.body, dealId: testDealId };
        next();
      });

      mocks.firestoreDocSnapshotInstance.exists = true;
      mocks.firestoreDocSnapshotInstance.data = jest.fn(() => ({
        participants: [testUserId, 'anotherUser'],
      }));

      mocks.clientStorageRef.mockReturnValue(mockClientStorageReferenceInstance);
      mocks.clientUploadBytes.mockResolvedValue({ ref: mockClientStorageReferenceInstance }); // Assume client upload is fine
      mocks.clientGetDownloadURL.mockResolvedValue(`https://firebasestorage.googleapis.com/v0/b/mock-bucket/o/${mockFileName}?alt=media`);

      // Force Firestore set operation to fail (route uses dealRef.collection('files').doc(fileId).set())
      mocks.firestoreDocInstance.set.mockRejectedValueOnce(genericError);

      const response = await request(app)
        .post(`/files/upload`)
        .set('Authorization', bearerToken)
        .field('dealId', testDealId)
        .attach('file', mockFileBuffer, { filename: mockFileName, contentType: mockFileMimeType });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error during file upload' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('File upload error:', genericError.message);

      // Restore console.error spy
      consoleErrorSpy.mockRestore();
    });

    it('should return 400 if dealId is missing', async () => {
      console.log('[LOG TEST] POST /upload: dealId missing');
      // Create a buffer with proper PDF signature
      const mockFileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, ...Buffer.from('fake pdf data')]);
      const mockFileName = 'test-no-dealid.pdf';
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mocks.multerMiddlewareHandler.mockImplementationOnce((req, res, next) => {
        req.file = {
          originalname: mockFileName,
          mimetype: 'application/pdf',
          buffer: mockFileBuffer,
          size: mockFileBuffer.length,
        };
        // req.body.dealId is intentionally NOT set
        req.body = { ...req.body }; // Ensure req.body exists
        console.log('[LOG MOCK multerMiddlewareHandler specific test] Populated req.file, dealId MISSING.');
        next();
      });

      const response = await request(app)
        .post(`/files/upload`)
        .set('Authorization', bearerToken)
        // Not sending 'dealId' field
        .attach('file', mockFileBuffer, { filename: mockFileName, contentType: 'application/pdf' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing file, dealId, or userId' });
      // console.error should NOT be called for this type of client error
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return 400 if userId is missing (e.g., auth middleware problem)', async () => {
      console.log('[LOG TEST] POST /upload: userId missing');
      // Create a buffer with proper PDF signature
      const mockFileBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, ...Buffer.from('fake pdf data')]);
      const mockFileName = 'test-no-userid.pdf';
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Override authenticateToken for this test to simulate req.userId not being set
      // This requires a bit more advanced mocking if the middleware is applied globally vs. route-specific.
      // For this test, we'll assume our mock adminAuthVerifyIdToken can simulate it by returning a value that causes req.userId to be undefined.
      // However, the current authenticateToken middleware *always* sets req.userId or returns an error response.
      // A more direct way is to mock the behavior of the middleware itself for this route for this one test.
      // Given the current setup, let's assume a scenario where adminAuthVerifyIdToken resolves, but somehow req.userId isn't populated.
      // This is hard to achieve without modifying the middleware mock itself.
      // A simpler way to test the route's check is to manually unset req.userId after our standard mock auth runs.
      // This is slightly artificial but tests the route's guard.

      mocks.multerMiddlewareHandler.mockImplementationOnce((req, res, next) => {
        req.file = {
          originalname: mockFileName,
          mimetype: 'application/pdf',
          buffer: mockFileBuffer,
          size: mockFileBuffer.length,
        };
        req.body = { ...req.body, dealId: testDealId };
        
        // Simulate req.userId being missing AFTER auth middleware would have run
        // This is a bit of a hack for testing this specific condition in the route handler
        // if the authenticateToken middleware itself is robust.
        // A better approach might be to have a separate middleware mock for this test.
        // For now, we modify req directly before the route handler logic.
        delete req.userId; // Simulate missing userId
        console.log('[LOG MOCK multerMiddlewareHandler specific test] Populated req.file, req.body.dealId. Manually deleted req.userId.');
        next();
      });
      
      // Ensure auth itself passes to reach the route handler
      mocks.adminAuthVerifyIdToken.mockResolvedValueOnce({ uid: testUserId });


      const response = await request(app)
        .post(`/files/upload`)
        .set('Authorization', bearerToken)
        .field('dealId', testDealId)
        .attach('file', mockFileBuffer, { filename: mockFileName, contentType: 'application/pdf' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing file, dealId, or userId' });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

  });

  describe('GET /download/:dealId/:fileId', () => {
    console.log('[LOG TEST GROUP] Starting tests for GET /download/:dealId/:fileId');
    it('should download a file successfully and return 200', async () => {
        console.log('[LOG TEST] GET /download: successful download');
        const mockFileContent = 'This is the content of the mock file.';
        const mockReadStream = new Readable();
        mockReadStream._read = () => {}; // Noop _read is fine for testing
        
        // Configure mocks for this specific test case
        // 1. Deal document for auth check
        mocks.firestoreDocSnapshotInstance.exists = true; // Both deal and file doc will use this sequentially
        mocks.firestoreDocSnapshotInstance.data = jest.fn()
            .mockReturnValueOnce({ participants: [testUserId, 'otherUser'] }) // For deal check
            .mockReturnValueOnce({ // For file metadata check
                dealId: testDealId,
                filename: 'test.jpg',
                uploadedBy: testUserId,
                gcsPath: `uploads/${testDealId}/test.jpg`, // Used by admin storage
                storagePath: `uploads/${testDealId}/test.jpg`, // Used by admin storage
                contentType: 'image/jpeg',
            });

        // Setup get to return the snapshot which is now configured for two calls
        mocks.firestoreDocInstance.get.mockImplementation(() => {
             console.log(`[LOG MOCK GET /download success] firestoreDocInstance.get returning configured snapshot. exists: ${mocks.firestoreDocSnapshotInstance.exists}`);
             return Promise.resolve(mocks.firestoreDocSnapshotInstance);
        });
        
        mocks.adminStorageFileInstance.createReadStream.mockImplementationOnce(() => {
            console.log('[LOG MOCK TEST SPECIFIC] adminStorageFileInstance.createReadStream called, returning mockReadStream for success test');
            // Push data and end the stream immediately
            mockReadStream.push(mockFileContent);
            mockReadStream.push(null); // Signal EOF
            return mockReadStream;
        });
        // mocks.adminStorageFileInstance.exists.mockResolvedValue([true]); // Not directly used in download success path if metadata present

        // process.nextTick(() => { // OLD: Removed this deferred push
        //     mockReadStream.push(mockFileContent);
        //     mockReadStream.push(null); // End the stream
        // });
        
        const response = await request(app)
            .get(`/files/download/${testDealId}/${testFileId}`)
            .set('Authorization', bearerToken); // Use bearerToken

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toEqual(expect.stringContaining('image/jpeg'));
        expect(response.headers['content-disposition']).toEqual(expect.stringContaining('attachment; filename="test.jpg"'));
        expect(response.body.toString()).toBe(mockFileContent);

        // db.collection('deals').doc(dealId).get()
        // db.collection('deals').doc(dealId).collection('files').doc(fileId).get()
        expect(mocks.firestoreDocInstance.get).toHaveBeenCalledTimes(2);
        expect(mocks.adminStorageFileMock).toHaveBeenCalledWith(`uploads/${testDealId}/test.jpg`);
        expect(mocks.adminStorageFileInstance.createReadStream).toHaveBeenCalled();
    });

    it('should return 404 if file metadata not found', async () => {
        console.log('[LOG TEST] GET /download: file metadata not found');
        // Deal exists and user is participant
        mocks.firestoreDocInstance.get
            .mockResolvedValueOnce(Promise.resolve({ // For Deal Check
                exists: true,
                data: () => ({ participants: [testUserId, 'otherUser'] })
            }))
            .mockResolvedValueOnce(Promise.resolve({ // For File Metadata Check
                exists: false // File not found
            }));

        const response = await request(app)
            .get(`/files/download/${testDealId}/nonexistentfile`)
            .set('Authorization', bearerToken); // Use bearerToken

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'File not found' });
    });
    
    it('should return 403 if user not participant in deal for download', async () => {
        console.log('[LOG TEST] GET /download: user not participant');
        // Deal exists but user is NOT a participant
         mocks.firestoreDocInstance.get.mockResolvedValueOnce(Promise.resolve({
            exists: true,
            data: () => ({ participants: ['anotherUserId1', 'anotherUserId2'] })
        }));
        // The second call for file metadata won't happen if auth fails first.

        const response = await request(app)
            .get(`/files/download/${testDealId}/${testFileId}`)
            .set('Authorization', bearerToken); // User is testUserId

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Unauthorized access' });
    });
    
    // Note: GCS file existence is checked by file.createReadStream() implicitly.
    // If createReadStream itself errors (e.g., file not found on GCS), it emits an 'error' event.

    it('should return 500 if read stream errors', async () => {
        console.log('[LOG TEST] GET /download: read stream error');
        const streamError = new Error('Stream failed badly for _read');
        let hasErroredAlready = false; // Use a closure variable to track error state
        const faultyMockReadStream = new Readable({
            read() {
                // Ensure error is emitted only once and after current execution context
                if (!hasErroredAlready) {
                    hasErroredAlready = true;
                    console.log('[LOG MOCK faultyStream] _read called, scheduling error emission.');
                    process.nextTick(() => {
                        console.log('[LOG MOCK faultyStream] Emitting error now.');
                        this.emit('error', streamError);
                    });
                } else {
                    // If read is called again after error, do nothing or push null
                    this.push(null);
                }
            }
        });

        // Setup mocks: Deal and File metadata exist, user is authorized
        mocks.firestoreDocInstance.get
            .mockResolvedValueOnce(Promise.resolve({ // Deal check
                exists: true,
                data: () => ({ participants: [testUserId] })
            }))
            .mockResolvedValueOnce(Promise.resolve({ // File metadata check
                exists: true,
                data: () => ({
                    filename: 'errorfile.txt',
                    storagePath: 'uploads/errorfile.txt',
                    contentType: 'text/plain',
                })
            }));
        
        // Ensure this specific test uses the faulty stream
        mocks.adminStorageFileInstance.createReadStream.mockImplementationOnce(() => {
            console.log('[LOG MOCK TEST SPECIFIC] adminStorageFileInstance.createReadStream called, returning faultyMockReadStream for error test');
            return faultyMockReadStream;
        });

        // Use a promise to await the request and handle error emission carefully
        const responsePromise = request(app)
            .get(`/files/download/${testDealId}/${testFileId}`)
            .set('Authorization', bearerToken);

        try {
            const response = await responsePromise;
            console.log('[LOG TEST TRY] Received response status:', response.status);
            console.log('[LOG TEST TRY] Received response headers:', JSON.stringify(response.headers));
            console.log('[LOG TEST TRY] Received response body (raw text):', response.text);
            console.log('[LOG TEST TRY] Received response body (parsed by supertest):', JSON.stringify(response.body));
            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Error downloading file' });
        } catch (err) {
            console.error('[LOG TEST CATCH] Supertest request promise rejected or assertion failed. Error:', err.message);
            if (err.response) { // If supertest error object with a response
                console.error("[LOG TEST CATCH] Error's response status:", err.response.status);
                console.error("[LOG TEST CATCH] Error's response headers:", JSON.stringify(err.response.headers));
                console.error("[LOG TEST CATCH] Error's response body (raw text):", err.response.text);
            }
            // console.error("[LOG TEST CATCH] Full error stack:", err.stack); // Keep this commented unless very deep debugging is needed
            throw err;
        }
    }, 10000); // Increased timeout for this specific test


    it('should return 401 if no token provided for download', async () => {
        console.log('[LOG TEST] GET /download: no token');
        const response = await request(app).get(`/files/download/${testDealId}/${testFileId}`);
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'No token provided' });
    });

    it('should return 403 if invalid token provided for download', async () => {
        console.log('[LOG TEST] GET /download: invalid token');
        const response = await request(app)
            .get(`/files/download/${testDealId}/${testFileId}`)
            .set('Authorization', 'Bearer invalidtoken123');
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Invalid or expired token' });
    });

    it('should return 500 if fetching file metadata fails unexpectedly', async () => {
      console.log('[LOG TEST] GET /download: unexpected error fetching file metadata');
      const genericError = new Error('Simulated Firestore get error for file metadata');

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Deal check is fine
      mocks.firestoreDocInstance.get
        .mockResolvedValueOnce(Promise.resolve({
          exists: true,
          data: () => ({ participants: [testUserId] })
        }))
        // File metadata check fails
        .mockRejectedValueOnce(genericError);

      const response = await request(app)
        .get(`/files/download/${testDealId}/${testFileId}`)
        .set('Authorization', bearerToken);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in download endpoint:', genericError);

      // Restore console.error spy
      consoleErrorSpy.mockRestore();
    });

    it('should handle stream error after headers sent and destroy response', async () => {
      console.log('[LOG TEST] GET /download: stream error after headers sent');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockResDestroy = jest.fn(); // Spy on res.destroy()

      // Setup mocks: Deal and File metadata exist, user is authorized
      mocks.firestoreDocInstance.get
        .mockResolvedValueOnce(Promise.resolve({ // Deal check
            exists: true,
            data: () => ({ participants: [testUserId] })
        }))
        .mockResolvedValueOnce(Promise.resolve({ // File metadata check
            exists: true,
            data: () => ({
                filename: 'stream-error-after-headers.txt',
                storagePath: 'uploads/stream-error-after-headers.txt',
                contentType: 'text/plain',
            })
        }));

      const streamError = new Error('Stream failed AFTER headers potentially sent');
      let headersWereLikelySent = false;
      const faultyMockReadStream = new Readable({
          read() {
              if (!headersWereLikelySent) {
                  // Push some data to encourage headers to be sent
                  this.push('some initial data');
                  headersWereLikelySent = true;
                  console.log('[LOG MOCK faultyStream] Pushed initial data, scheduling error.');
                  process.nextTick(() => {
                      console.log('[LOG MOCK faultyStream] Emitting error now (after initial data).');
                      this.emit('error', streamError);
                  });
              } else {
                  // After error, or if read is called again, do nothing or push null
                  // this.push(null); // Not strictly necessary after error
              }
          }
      });
      
      mocks.adminStorageFileInstance.createReadStream.mockReturnValue(faultyMockReadStream);

      try {
        await request(app)
          .get(`/files/download/${testDealId}/${testFileId}`)
          .set('Authorization', bearerToken)
          .on('response', (res) => {
            // Intercept the response to spy on its destroy method
            // Supertest's response object might not be the exact Express response object
            // This is a bit tricky. A better way might be to inject a spy earlier.
            // For now, we rely on the server-side logs and behavior.
            // res.destroy = mockResDestroy; // This might not work as expected with supertest
            // Instead, we will check the console logs from the route handler
          });
      } catch (err) {
          // Expecting a client-side error because the connection will be abruptly closed
          console.log('[LOG TEST CATCH] Request to /download failed as expected due to stream error after headers:', err.message);
          expect(err.message).toMatch(/ECONNRESET|socket hang up|destroy/i); // Or similar client-side error
      }

      // Check server-side logs for the specific error handling path
      // This relies on the console.log statements in the target error handler block
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ROUTE STREAM ERROR HANDLER] Error streaming file:', streamError);
      // We expect the "Headers already sent" path to be taken
      // Check for one of the specific logs in that path
      expect(consoleErrorSpy.mock.calls.some(call => call[0].includes('Headers already sent. Cannot send 500 JSON response'))).toBe(true);
      
      // We can't easily mock/spy `res.destroy()` directly from supertest's response
      // but the logs from the route confirm the intended path.
      // If res.destroy() itself logs, or if we can inject a spy earlier, that would be better.

      consoleErrorSpy.mockRestore();
    }, 10000); // Increased timeout

    it('should handle generic error after headers sent in download try block and destroy response', async () => {
      console.log('[LOG TEST] GET /download: generic error after headers sent');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const errorAfterHeaders = new Error('Simulated generic error after headers sent');

      // Mock successful deal and file metadata retrieval
      mocks.firestoreDocInstance.get
        .mockResolvedValueOnce(Promise.resolve({
          exists: true,
          data: () => ({ participants: [testUserId] })
        }))
        .mockResolvedValueOnce(Promise.resolve({
          exists: true,
          data: () => ({
            filename: 'generic-error-test.txt',
            storagePath: 'uploads/generic-error-test.txt',
            contentType: 'text/plain'
          })
        }));

      // This is tricky: We need an error to occur in the `try` block of the download route
      // AFTER `res.setHeader` but BEFORE `readStream.pipe(res)` or during a problematic pipe.
      // Let's simulate `bucket.file(fileData.storagePath)` still being okay,
      // but `file.createReadStream` itself throwing a *synchronous* error AFTER headers are set.

      // To ensure headers are sent, we'd ideally need to hook into Express middleware
      // or modify the route to allow us to set headers then throw.
      // For a unit test, we can make createReadStream throw, and assume headers were set.
      // The route structure sets headers *before* createReadStream.

      mocks.adminStorageFileInstance.createReadStream.mockImplementation(() => {
        console.log('[LOG MOCK adminStorageFileInstance.createReadStream] Throwing synchronous error for generic error test.');
        throw errorAfterHeaders; // Synchronous error
      });

      try {
        await request(app)
          .get(`/files/download/${testDealId}/${testFileId}`)
          .set('Authorization', bearerToken);
      } catch (err) {
        // Depending on when/how supertest handles this, we might get an error here or not.
        // The key is that the server should have logged the error and not crashed.
        console.log('[LOG TEST CATCH] Request to /download with generic error after headers:', err.message);
      }
      
      // The route's catch block should be hit.
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in download endpoint:', errorAfterHeaders);
      // Since headers would have been sent before createReadStream, the if (!res.headersSent) should be false.
      // Thus, no res.status(500).json() should be called from that block.
      // The server should ideally close/destroy the connection.
      // We can check that the specific log for "Internal server error" json response was NOT called.

      // A more robust check for this scenario often involves seeing if the client request hangs or errors out,
      // and checking server logs for the correct error path.
      // The current test ensures the error is caught and logged.
      // If res.destroy() or similar was reliably mockable via supertest, we'd check that.

      consoleErrorSpy.mockRestore();
    });
  });

  describe('DELETE /delete/:dealId/:fileId', () => {
    console.log('[LOG TEST GROUP] Starting tests for DELETE /delete/:dealId/:fileId');
    // Note: The DELETE route in fileUploadDownload.js is not implemented.
    // These tests will fail or need adjustment once the route is implemented.
    // For now, let's assume it would follow similar patterns to download for auth & metadata.

    it('should delete a file successfully and return 200 (NEEDS ROUTE IMPLEMENTATION)', async () => {
        console.log('[LOG TEST] DELETE /delete: successful deletion (PENDING ROUTE)');
        // Mocking assuming similar logic to download for checks:
        // 1. Deal exists, user is participant.
        // 2. File metadata exists, user is uploader (or admin logic).
        mocks.firestoreDocInstance.get
            .mockResolvedValueOnce(Promise.resolve({ // Deal Check
                exists: true,
                data: () => ({ participants: [testUserId] }) 
            }))
            .mockResolvedValueOnce(Promise.resolve({ // File Metadata Check
                exists: true,
                data: () => ({
                    uploadedBy: testUserId, // Current user is the uploader
                    storagePath: `uploads/${testDealId}/test.jpg`,
                })
            }));
        
        mocks.adminStorageFileInstance.delete.mockResolvedValue(); // GCS delete success
        // Assuming a db.collection('deals').doc(dealId).collection('files').doc(fileId).delete() call
        // mocks.firestoreDocInstance.delete.mockResolvedValue(); // This is already the default

        const response = await request(app)
            .delete(`/files/delete/${testDealId}/${testFileId}`)
            .set('Authorization', bearerToken); // Use bearerToken

        // This will likely be 404 until route is implemented
        // For now, let's expect what the current router would do if the path isn't matched by DELETE
        // If the route '/files/delete/:dealId/:fileId' for DELETE method isn't defined, it's typically a 404.
        // However, our fileUploadDownload.js doesn't have a delete route yet.
        // So, Supertest will hit Express, which won't find a handler for DELETE /files/delete/...
        expect(response.status).toBe(404); // Default Express 404 for unhandled route/method
        // Once implemented, change to 200 and add more expect calls:
        // expect(response.body).toHaveProperty('message', 'File deleted successfully');
        // expect(mocks.adminStorageFileInstance.delete).toHaveBeenCalled();
        // expect(mocks.firestoreDocInstance.delete).toHaveBeenCalled(); // For file metadata
    });
    
    it('should return 403 if user is not the uploader (NEEDS ROUTE IMPLEMENTATION & LOGIC)', async () => {
        console.log('[LOG TEST] DELETE /delete: forbidden, user not uploader (PENDING ROUTE)');
        mocks.firestoreDocInstance.get
            .mockResolvedValueOnce(Promise.resolve({ // Deal Check
                exists: true,
                data: () => ({ participants: [testUserId] })
            }))
            .mockResolvedValueOnce(Promise.resolve({ // File Metadata Check
                exists: true,
                data: () => ({
                    uploadedBy: 'anotherUserId', // File uploaded by someone else
                    storagePath: `uploads/${testDealId}/otheruserfile.jpg`,
                })
            }));

        const response = await request(app)
            .delete(`/files/delete/${testDealId}/${testFileId}`)
            .set('Authorization', bearerToken); // Token for testUserId

        expect(response.status).toBe(404); // Expect 404 due to no route
        // Once implemented with auth logic, this might be 403.
        // expect(response.body).toHaveProperty('message', 'User not authorized to delete this file.');
    });

    it('should return 401 if no token for delete (NEEDS ROUTE IMPLEMENTATION)', async () => {
        console.log('[LOG TEST] DELETE /delete: no token (PENDING ROUTE)');
        const response = await request(app)
            .delete(`/files/delete/${testDealId}/${testFileId}`);
        // If the route /files/delete... with method DELETE doesn't exist, Express returns 404.
        // The authenticateToken middleware is route-specific in fileUploadDownload.js,
        // so it won't be hit if the route itself is not defined for DELETE.
        expect(response.status).toBe(404); 
        // When route is implemented with authenticateToken:
        // expect(response.status).toBe(401);
        // expect(response.body).toEqual({ error: 'No token provided' });
    });


    // Add more tests for DELETE /delete (file not found, GCS deletion error, Firestore deletion error, etc.)
    // ...
  });

  // --- Route: GET /my-deals --- //
  describe('GET /my-deals', () => {
    console.log('[LOG TEST GROUP] Starting tests for GET /my-deals');

    it('should return files for deals the user is part of', async () => {
      console.log('[LOG TEST] GET /my-deals: successful retrieval with files');
      const mockUserId = 'userWithDealsAndFiles';
      const mockDealId1 = 'deal1';
      const mockDealId2 = 'deal2';
      // Create JS Date objects first for clarity and to get ISOString later
      const jsDateFile1 = new Date(Date.UTC(2023, 0, 10, 10, 0, 0));
      const jsDateFile2 = new Date(Date.UTC(2023, 0, 11, 11, 0, 0));

      const mockFile1Data = {
        filename: 'file1.pdf',
        contentType: 'application/pdf',
        size: 1024,
        uploadedAt: { toDate: () => jsDateFile1 }, // Mock Firestore Timestamp-like object
        uploadedBy: mockUserId,
        storagePath: `uploads/${mockDealId1}/file1.pdf`,
      };
       const mockFile2Data = {
        filename: 'file2.jpg',
        contentType: 'image/jpeg',
        size: 2048,
        uploadedAt: { toDate: () => jsDateFile2 }, // Mock Firestore Timestamp-like object
        uploadedBy: 'anotherUser',
        storagePath: `uploads/${mockDealId2}/file2.jpg`,
      };

      // Mock for dealsQuery
      mocks.firestoreQueryInstance.get.mockResolvedValueOnce({
        empty: false,
        docs: [
          { id: mockDealId1, data: () => ({ participants: [mockUserId, 'otherUser'] }) },
          { id: mockDealId2, data: () => ({ participants: [mockUserId] }) },
        ],
      });

      // Mock for filesSnapshots - first deal
      mocks.firestoreCollectionInstance.get
        .mockResolvedValueOnce({ // Files for deal1
          empty: false,
          docs: [{ id: 'file1Id', data: () => mockFile1Data }],
        })
        .mockResolvedValueOnce({ // Files for deal2
          empty: false,
          docs: [{ id: 'file2Id', data: () => mockFile2Data }],
        });
      
      mocks.adminAuthVerifyIdToken.mockResolvedValue({ uid: mockUserId });


      const response = await request(app)
        .get('/files/my-deals')
        .set('Authorization', `Bearer validTokenFor_${mockUserId}`);

      console.log('[LOG TEST RESPONSE] GET /my-deals response status:', response.status);
      console.log('[LOG TEST RESPONSE] GET /my-deals response body:', JSON.stringify(response.body));

      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.arrayContaining([
        expect.objectContaining({
          dealId: mockDealId1,
          fileId: 'file1Id',
          filename: mockFile1Data.filename,
          contentType: mockFile1Data.contentType,
          uploadedAt: jsDateFile1.toISOString(), // Compare with the ISO string from the original JS Date
          downloadPath: `/files/download/${mockDealId1}/file1Id`,
        }),
        expect.objectContaining({
          dealId: mockDealId2,
          fileId: 'file2Id',
          filename: mockFile2Data.filename,
          contentType: mockFile2Data.contentType,
          uploadedAt: jsDateFile2.toISOString(), // Compare with the ISO string from the original JS Date
          downloadPath: `/files/download/${mockDealId2}/file2Id`,
        }),
      ]));
      expect(response.body.length).toBe(2);

      // Verify Firestore calls
      expect(mocks.firestoreInstance.collection).toHaveBeenCalledWith('deals');
      expect(mocks.firestoreCollectionInstance.where).toHaveBeenCalledWith('participants', 'array-contains', mockUserId);
      expect(mocks.firestoreCollectionInstance.doc).toHaveBeenCalledWith(mockDealId1);
      expect(mocks.firestoreCollectionInstance.doc).toHaveBeenCalledWith(mockDealId2);
      expect(mocks.firestoreCollectionInstance.doc(mockDealId1).collection).toHaveBeenCalledWith('files');
    });

    it('should return an empty array if user has deals but no files in those deals', async () => {
      console.log('[LOG TEST] GET /my-deals: user has deals, but no files');
      const mockUserId = 'userWithDealsNoFiles';

      // Mock for dealsQuery - user is in one deal
      mocks.firestoreQueryInstance.get.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'dealWithNoFiles', data: () => ({ participants: [mockUserId] }) }],
      });

      // Mock for filesSnapshots - the deal has no files
      mocks.firestoreCollectionInstance.get.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });
      
      mocks.adminAuthVerifyIdToken.mockResolvedValue({ uid: mockUserId });

      const response = await request(app)
        .get('/files/my-deals')
        .set('Authorization', `Bearer validTokenFor_${mockUserId}`);

      console.log('[LOG TEST RESPONSE] GET /my-deals (no files) response status:', response.status);
      console.log('[LOG TEST RESPONSE] GET /my-deals (no files) response body:', JSON.stringify(response.body));
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return an empty array if user has no deals', async () => {
      console.log('[LOG TEST] GET /my-deals: user has no deals');
      const mockUserId = 'userWithNoDeals';

      // Mock for dealsQuery - user has no deals
      mocks.firestoreQueryInstance.get.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });
      
      mocks.adminAuthVerifyIdToken.mockResolvedValue({ uid: mockUserId });

      const response = await request(app)
        .get('/files/my-deals')
        .set('Authorization', `Bearer validTokenFor_${mockUserId}`);
      
      console.log('[LOG TEST RESPONSE] GET /my-deals (no deals) response status:', response.status);
      console.log('[LOG TEST RESPONSE] GET /my-deals (no deals) response body:', JSON.stringify(response.body));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 500 if an internal server error occurs (deals query fails)', async () => {
      console.log('[LOG TEST] GET /my-deals: internal server error (deals query)');
      const mockUserId = 'userFacingError';
      
      mocks.firestoreQueryInstance.get.mockRejectedValueOnce(new Error('Simulated Firestore error during deals query'));
      mocks.adminAuthVerifyIdToken.mockResolvedValue({ uid: mockUserId });

      const response = await request(app)
        .get('/files/my-deals')
        .set('Authorization', `Bearer validTokenFor_${mockUserId}`);

      console.log('[LOG TEST RESPONSE] GET /my-deals (deals query error) response status:', response.status);
      console.log('[LOG TEST RESPONSE] GET /my-deals (deals query error) response body:', JSON.stringify(response.body));
      
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    it('should return 500 if an internal server error occurs (files query fails)', async () => {
      console.log('[LOG TEST] GET /my-deals: internal server error (files query)');
      const mockUserId = 'userFacingFileError';
      const mockDealId = 'dealWithErroringFiles';

      // Mock for dealsQuery - user is in one deal
      mocks.firestoreQueryInstance.get.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: mockDealId, data: () => ({ participants: [mockUserId] }) }],
      });

      // Mock for filesSnapshots - fetching files for the deal fails
      mocks.firestoreCollectionInstance.get.mockRejectedValueOnce(new Error('Simulated Firestore error during files query'));
      mocks.adminAuthVerifyIdToken.mockResolvedValue({ uid: mockUserId });
      
      const response = await request(app)
        .get('/files/my-deals')
        .set('Authorization', `Bearer validTokenFor_${mockUserId}`);

      console.log('[LOG TEST RESPONSE] GET /my-deals (files query error) response status:', response.status);
      console.log('[LOG TEST RESPONSE] GET /my-deals (files query error) response body:', JSON.stringify(response.body));

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
    
    it('should return 401 if no token is provided for /my-deals', async () => {
        console.log('[LOG TEST] GET /my-deals: no token');
        const response = await request(app).get('/files/my-deals');
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'No token provided' });
    });

    it('should return 403 if invalid token provided for /my-deals', async () => {
        console.log('[LOG TEST] GET /my-deals: invalid token');
        mocks.adminAuthVerifyIdToken.mockRejectedValueOnce(new Error('Invalid mock token by adminAuthVerifyIdToken')); // Ensure the auth mock fails
        const response = await request(app)
            .get('/files/my-deals')
            .set('Authorization', 'Bearer invalidtoken123');
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'Invalid or expired token' });
    });

  });

  // Add more describe blocks for other routes if any
  // ...

}); // End of main describe block

console.log('[LOG] Test file execution end: fileUploadDownload.unit.test.js');


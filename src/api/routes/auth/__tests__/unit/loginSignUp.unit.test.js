// src/api/routes/auth/__tests__/unit/loginSignUp.unit.test.js
import { jest } from '@jest/globals';
import express from 'express';

// Create mock objects that will hold all our mock functions for Firebase Admin SDK
const mockFirebaseAdminAuth = {
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
  createCustomToken: jest.fn(),
  setCustomUserClaims: jest.fn(),
  getUser: jest.fn(),
  verifyIdToken: jest.fn(),
};

const mockFirebaseAdminFirestore = {
  collection: jest.fn(),
};

const mockAdminApp = { name: 'mockAdminApp' };

// Mock firebase-admin/auth (Admin SDK)
jest.unstable_mockModule('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockFirebaseAdminAuth),
}));

// Mock firebase-admin/firestore (Admin SDK)
jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockFirebaseAdminFirestore),
}));

// Mock admin.js
jest.unstable_mockModule('../../admin.js', () => ({
  getAdminApp: jest.fn().mockResolvedValue(mockAdminApp),
}));

// Mock Firestore operations
const mockFirestoreDoc = {
  set: jest.fn().mockResolvedValue({}),
};

const mockFirestoreCollection = {
  doc: jest.fn(() => mockFirestoreDoc),
};

let router;

beforeAll(async () => {
  const module = await import('../../loginSignUp.js');
  router = module.default;
});

const mockRequest = (body = {}, params = {}, query = {}, method = 'POST', url = '/') => ({
  body, params, query, method, url,
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn().mockReturnThis();
  res.send = jest.fn().mockReturnThis();
  return res;
};

let originalNodeEnv;

describe('Unit Tests for loginSignUp.js Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    originalNodeEnv = process.env.NODE_ENV;
    
    // Setup default Firestore mocks
    mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
    
    // Configure default mock return values for successful scenarios
    mockFirebaseAdminAuth.createUser.mockResolvedValue({
      uid: 'mockUserId',
      email: 'test@example.com'
    });
    
    mockFirebaseAdminAuth.getUserByEmail.mockResolvedValue({
      uid: 'mockUserId',
      email: 'test@example.com',
      customClaims: { admin: true }
    });
    
    mockFirebaseAdminAuth.getUser.mockResolvedValue({
      uid: 'mockUserId',
      email: 'test@example.com',
      customClaims: { admin: true }
    });
    
    mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'mockUserId',
      email: 'test@example.com'
    });
    
    mockFirebaseAdminAuth.setCustomUserClaims.mockResolvedValue();
    mockFirebaseAdminAuth.createCustomToken.mockResolvedValue('mock-custom-token');
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // --- POST /signUpEmailPass ---
  describe('POST /signUpEmailPass', () => {
    const routeUrl = '/signUpEmailPass';
    const routeMethod = 'POST';

    it('should create a user successfully (non-test env)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUserPayload = { uid: 'testUid', email: 'test@example.com' };
      mockFirebaseAdminAuth.createUser.mockResolvedValue(mockUserPayload);
      mockFirebaseAdminAuth.setCustomUserClaims.mockResolvedValue({});

      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      // Allow any pending microtasks/macrotasks to complete
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        emailVerified: false
      });
      expect(mockFirebaseAdminAuth.setCustomUserClaims).toHaveBeenCalledWith(mockUserPayload.uid, { admin: true });
      expect(mockFirebaseAdminFirestore.collection).toHaveBeenCalledWith('users');
      expect(mockFirestoreCollection.doc).toHaveBeenCalledWith(mockUserPayload.uid);
      expect(mockFirestoreDoc.set).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@example.com',
        uid: mockUserPayload.uid,
        wallets: []
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User created successfully',
        user: { uid: mockUserPayload.uid, email: mockUserPayload.email }
      });
    });

    it('should create a user successfully (test env - no claims set)', async () => {
      process.env.NODE_ENV = 'test';
      const mockUserPayload = { uid: 'testUid', email: 'test@example.com' };
      mockFirebaseAdminAuth.createUser.mockResolvedValue(mockUserPayload);

      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        emailVerified: false
      });
      expect(mockFirebaseAdminAuth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User created successfully',
        user: { uid: mockUserPayload.uid, email: mockUserPayload.email }
      });
    });

    it('should return 400 if email or password is missing', async () => {
      const req = mockRequest({ email: 'test@example.com' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
      expect(mockFirebaseAdminAuth.createUser).not.toHaveBeenCalled();
    });

    it('should return 409 if email already in use', async () => {
      const error = new Error('Email already exists');
      error.code = 'auth/email-already-exists';
      mockFirebaseAdminAuth.createUser.mockRejectedValue(error);
      
      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email already in use' });
    });

    it('should return 400 for other Firebase errors during sign up', async () => {
      const errorMessage = 'Some Firebase error';
      const error = new Error(errorMessage);
      error.code = 'auth/some-other-error';
      mockFirebaseAdminAuth.createUser.mockRejectedValue(error);
      
      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: errorMessage });
    });
  });

  // --- POST /signInEmailPass ---
  describe('POST /signInEmailPass', () => {
    const routeUrl = '/signInEmailPass';
    const routeMethod = 'POST';

    it('should sign in user successfully (test env)', async () => {
      process.env.NODE_ENV = 'test';
      const mockUserRecord = {
        uid: 'testUid',
        email: 'test@example.com',
        customClaims: { admin: true }
      };
      mockFirebaseAdminAuth.getUserByEmail.mockResolvedValue(mockUserRecord);
      mockFirebaseAdminAuth.createCustomToken.mockResolvedValue('mock-custom-token');

      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.getUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockFirebaseAdminAuth.createCustomToken).toHaveBeenCalledWith(mockUserRecord.uid);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User signed in successfully',
        token: 'mock-custom-token',
        user: { uid: mockUserRecord.uid, email: mockUserRecord.email }
      });
    });

    it('should sign in admin user successfully (non-test env)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUserRecord = {
        uid: 'testUid',
        email: 'admin@example.com',
        customClaims: { admin: true }
      };
      mockFirebaseAdminAuth.getUserByEmail.mockResolvedValue(mockUserRecord);
      mockFirebaseAdminAuth.createCustomToken.mockResolvedValue('mock-admin-token');

      const req = mockRequest({ email: 'admin@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.getUserByEmail).toHaveBeenCalledWith('admin@example.com');
      expect(mockFirebaseAdminAuth.createCustomToken).toHaveBeenCalledWith(mockUserRecord.uid);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User signed in successfully',
        token: 'mock-admin-token',
        user: { uid: mockUserRecord.uid, email: mockUserRecord.email }
      });
    });

    it('should return 401 if non-admin user signs in (non-test env and admin check is enforced)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUserRecord = {
        uid: 'testUid',
        email: 'user@example.com',
        customClaims: { admin: false } // Non-admin user
      };
      mockFirebaseAdminAuth.getUserByEmail.mockResolvedValue(mockUserRecord);

      const req = mockRequest({ email: 'user@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.getUserByEmail).toHaveBeenCalledWith('user@example.com');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized user' });
    });

    it('should return 400 if email or password is missing for sign in', async () => {
      const req = mockRequest({ email: 'test@example.com' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
      expect(mockFirebaseAdminAuth.getUserByEmail).not.toHaveBeenCalled();
    });

    it('should return 401 for user not found during sign in', async () => {
      const error = new Error('User not found');
      error.code = 'auth/user-not-found';
      mockFirebaseAdminAuth.getUserByEmail.mockRejectedValue(error);
      
      const req = mockRequest({ email: 'nonexistent@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should return 400 for other auth errors during sign in', async () => {
      const error = new Error('Some other auth error');
      error.code = 'auth/some-other-error';
      mockFirebaseAdminAuth.getUserByEmail.mockRejectedValue(error);
      
      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'An unexpected error occurred during sign-in.' });
    });
  });

  // --- POST /signInGoogle ---
  describe('POST /signInGoogle', () => {
    const routeUrl = '/signInGoogle';
    const routeMethod = 'POST';

    it('should return 400 if idToken is missing', async () => {
      const req = mockRequest({}, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing ID token' });
      expect(mockFirebaseAdminAuth.verifyIdToken).not.toHaveBeenCalled();
    });

    describe('Test Mode (NODE_ENV=test)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'test';
      });

      it('should return 401 for literal "invalid-token" in test mode', async () => {
        const req = mockRequest({ idToken: 'invalid-token' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID token' });
      });

      it('should authenticate admin user with UID as token in test mode', async () => {
        const adminUid = 'adminUid123';
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ 
          uid: adminUid, 
          customClaims: { admin: true } 
        });
        
        const req = mockRequest({ idToken: adminUid }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.getUser).toHaveBeenCalledWith(adminUid);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ 
          message: 'User authenticated (test)', 
          uid: adminUid, 
          isAdmin: true 
        });
      });

      it('should return 401 if non-admin user (UID as token) in test mode and admin required', async () => {
        const userUid = 'userUid456';
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ 
          uid: userUid, 
          customClaims: { admin: false } 
        });
        
        const req = mockRequest({ idToken: userUid }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.getUser).toHaveBeenCalledWith(userUid);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized user (test mode - admin required)' });
      });

      it('should return 401 if getUser fails (e.g., UID not found) in test mode', async () => {
        mockFirebaseAdminAuth.getUser.mockRejectedValue(new Error('User not found by UID'));
        
        const req = mockRequest({ idToken: 'unknownUid' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.getUser).toHaveBeenCalledWith('unknownUid');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid user UID provided as token (test mode)' });
      });
    });

    describe('Production Mode (NODE_ENV=development)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      it('should authenticate admin user from allowed list in production mode', async () => {
        const adminEmail = 'jasmindustin@gmail.com';
        const uid = 'prodAdminUid';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email: adminEmail });
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ uid, email: adminEmail });

        const req = mockRequest({ idToken: 'validGoogleToken' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('validGoogleToken', true);
        expect(mockFirebaseAdminAuth.getUser).toHaveBeenCalledWith(uid);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated', uid, isAdmin: true });
      });

      it('should authenticate non-admin user from allowed list in production mode', async () => {
        const userEmail = 'andyrowe00@gmail.com';
        const uid = 'prodUserUid';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email: userEmail });
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ uid, email: userEmail });

        const req = mockRequest({ idToken: 'validGoogleTokenUser' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('validGoogleTokenUser', true);
        expect(mockFirebaseAdminAuth.getUser).toHaveBeenCalledWith(uid);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated', uid, isAdmin: false });
      });

      it('should return 403 if email not in allowed list in production mode', async () => {
        const uid = 'unauthorizedUid';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email: 'unauthorized@example.com' });
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ uid, email: 'unauthorized@example.com' });

        const req = mockRequest({ idToken: 'validGoogleTokenUnauthorized' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('validGoogleTokenUnauthorized', true);
        expect(mockFirebaseAdminAuth.getUser).toHaveBeenCalledWith(uid);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. This email address is not authorized.' });
      });

      it('should return 401 for expired ID token in production mode', async () => {
        const error = new Error('Token expired');
        error.code = 'auth/id-token-expired';
        mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(error);
        
        const req = mockRequest({ idToken: 'expiredToken' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('expiredToken', true);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Login session expired, please sign in again.' });
      });

      it('should return 401 for invalid signature in production mode', async () => {
        const error = new Error('The Firebase ID token has an invalid signature...');
        error.code = 'auth/argument-error';
        mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(error);

        const req = mockRequest({ idToken: 'invalidSigToken' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('invalidSigToken', true);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ 
          error: 'Invalid authentication token signature. Please ensure the frontend and backend are using the same Firebase project.' 
        });
      });

      it('should return 404 if user not found after token verification in production mode', async () => {
        const uid = 'verifiedButNotFoundUid';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email: 'jasmindustin@gmail.com' });
        const error = new Error('User not found');
        error.code = 'auth/user-not-found';
        mockFirebaseAdminAuth.getUser.mockRejectedValue(error);

        const req = mockRequest({ idToken: 'tokenForNotFoundUser' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('tokenForNotFoundUser', true);
        expect(mockFirebaseAdminAuth.getUser).toHaveBeenCalledWith(uid);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Authenticated user profile not found.' });
      });

      it('should return 500 for other internal errors during Google sign-in in production mode', async () => {
        const errorMessage = 'Some other internal error';
        mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(new Error(errorMessage));
        
        const req = mockRequest({ idToken: 'tokenCausingInternalError' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('tokenCausingInternalError', true);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'An internal error occurred during authentication.' });
      });
    });
  });
});

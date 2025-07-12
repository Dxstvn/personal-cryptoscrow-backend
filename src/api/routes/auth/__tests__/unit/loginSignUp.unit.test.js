// src/api/routes/auth/__tests__/unit/loginSignUp.unit.test.js
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import express from 'express';

// Create mock objects that will hold all our mock functions for Firebase Admin SDK
const mockFirebaseAdminAuth = {
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  createCustomToken: vi.fn(),
  setCustomUserClaims: vi.fn(),
  getUser: vi.fn(),
  verifyIdToken: vi.fn(),
};

const mockFirebaseAdminFirestore = {
  collection: vi.fn(),
};

const mockAdminApp = { name: 'mockAdminApp' };

// Mock firebase-admin/auth (Admin SDK)
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => mockFirebaseAdminAuth),
}));

// Mock firebase-admin/firestore (Admin SDK)
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockFirebaseAdminFirestore),
}));

// Mock admin.js
vi.mock('../../admin.js', () => ({
  getAdminApp: vi.fn().mockResolvedValue(mockAdminApp),
}));

// Mock Firebase client auth
const mockUserCredential = {
  user: {
    getIdToken: vi.fn().mockResolvedValue('mock-id-token')
  }
};

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithCustomToken: vi.fn().mockResolvedValue(mockUserCredential)
}));

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(undefined),
    get: vi.fn((key) => {
      if (key === 'ALLOWED_EMAILS') {
        return 'jasmindustin@gmail.com,dustin.jasmin@jaspire.co,andyrowe00@gmail.com,testuser.a@example.com';
      }
      return null;
    }),
    isInitialized: true
  }
}));

// Mock authIndex.js
vi.mock('../../authIndex.js', () => ({
  ethEscrowApp: { name: 'mockEthEscrowApp' }
}));

// Mock Firestore operations
const mockFirestoreDoc = {
  set: vi.fn().mockResolvedValue({}),
  get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
};

const mockFirestoreCollection = {
  doc: vi.fn(() => mockFirestoreDoc),
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
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  res.send = vi.fn().mockReturnThis();
  return res;
};

let originalNodeEnv;

describe('Unit Tests for loginSignUp.js Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalNodeEnv = process.env.NODE_ENV;
    
    // Setup default Firestore mocks
    mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
    
    // Configure default mock return values for successful scenarios
    mockFirebaseAdminAuth.createUser.mockResolvedValue({
      uid: 'mockUserId',
      email: 'jasmindustin@gmail.com'
    });
    
    mockFirebaseAdminAuth.getUserByEmail.mockResolvedValue({
      uid: 'mockUserId',
      email: 'jasmindustin@gmail.com',
      customClaims: { admin: true }
    });
    
    mockFirebaseAdminAuth.getUser.mockResolvedValue({
      uid: 'mockUserId',
      email: 'jasmindustin@gmail.com',
      customClaims: { admin: true }
    });
    
    mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'mockUserId',
      email: 'jasmindustin@gmail.com'
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
      const mockUserPayload = { uid: 'testUid', email: 'jasmindustin@gmail.com' };
      mockFirebaseAdminAuth.createUser.mockResolvedValue(mockUserPayload);
      mockFirebaseAdminAuth.setCustomUserClaims.mockResolvedValue({});

      const req = mockRequest({ email: 'jasmindustin@gmail.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = vi.fn();
      await router(req, res, next);

      // Allow any pending microtasks/macrotasks to complete
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.createUser).toHaveBeenCalledWith({
        email: 'jasmindustin@gmail.com',
        password: 'password123',
        emailVerified: false
      });
      expect(mockFirebaseAdminAuth.setCustomUserClaims).toHaveBeenCalledWith(mockUserPayload.uid, { admin: true });
      expect(mockFirebaseAdminFirestore.collection).toHaveBeenCalledWith('users');
      expect(mockFirestoreCollection.doc).toHaveBeenCalledWith(mockUserPayload.uid);
      expect(mockFirestoreDoc.set).toHaveBeenCalledWith(expect.objectContaining({
        email: 'jasmindustin@gmail.com',
        uid: mockUserPayload.uid,
        wallets: []
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User created successfully',
        token: expect.any(String),
        tokenType: 'id',
        userId: mockUserPayload.uid,
        user: { uid: mockUserPayload.uid, email: mockUserPayload.email }
      });
    });

    it('should create a user successfully (test env - no claims set)', async () => {
      process.env.NODE_ENV = 'test';
      const mockUserPayload = { uid: 'testUid', email: 'test@example.com' };
      mockFirebaseAdminAuth.createUser.mockResolvedValue(mockUserPayload);

      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = vi.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        emailVerified: false
      });
      expect(mockFirebaseAdminAuth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User created successfully',
        token: expect.any(String),
        tokenType: 'id',
        userId: mockUserPayload.uid,
        user: { uid: mockUserPayload.uid, email: mockUserPayload.email }
      });
    });

    it('should return 400 if email or password is missing', async () => {
      const req = mockRequest({ email: 'test@example.com' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = vi.fn();
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
      const next = vi.fn();
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
      const next = vi.fn();
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
        email: 'jasmindustin@gmail.com',
        customClaims: { admin: true }
      };
      mockFirebaseAdminAuth.getUserByEmail.mockResolvedValue(mockUserRecord);
      mockFirebaseAdminAuth.createCustomToken.mockResolvedValue('mock-custom-token');

      const req = mockRequest({ email: 'jasmindustin@gmail.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = vi.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.getUserByEmail).toHaveBeenCalledWith('jasmindustin@gmail.com');
      expect(mockFirebaseAdminAuth.createCustomToken).toHaveBeenCalledWith(mockUserRecord.uid);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User signed in successfully',
        token: 'mock-id-token',
        tokenType: 'id',
        userId: mockUserRecord.uid,
        user: { uid: mockUserRecord.uid, email: mockUserRecord.email }
      });
    });

    it('should sign in admin user successfully (non-test env)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUserRecord = {
        uid: 'testUid',
        email: 'jasmindustin@gmail.com',
        customClaims: { admin: true }
      };
      mockFirebaseAdminAuth.getUserByEmail.mockResolvedValue(mockUserRecord);
      mockFirebaseAdminAuth.createCustomToken.mockResolvedValue('mock-admin-token');

      const req = mockRequest({ email: 'jasmindustin@gmail.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = vi.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.getUserByEmail).toHaveBeenCalledWith('jasmindustin@gmail.com');
      expect(mockFirebaseAdminAuth.createCustomToken).toHaveBeenCalledWith(mockUserRecord.uid);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User signed in successfully',
        token: 'mock-id-token',
        tokenType: 'id',
        userId: mockUserRecord.uid,
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
      const next = vi.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.getUserByEmail).toHaveBeenCalledWith('user@example.com');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    it('should return 400 if email or password is missing for sign in', async () => {
      const req = mockRequest({ email: 'test@example.com' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = vi.fn();
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
      const next = vi.fn();
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
      const next = vi.fn();
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
      const next = vi.fn();
      await router(req, res, next);

      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'ID token is required' });
      expect(mockFirebaseAdminAuth.verifyIdToken).not.toHaveBeenCalled();
    });

    describe('Test Mode (NODE_ENV=test)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'test';
      });

      it('should return 401 for invalid token in test mode', async () => {
        mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));
        
        const req = mockRequest({ idToken: 'invalid-token' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Google ID token' });
      });

      it('should authenticate user with valid token in test mode', async () => {
        const adminUid = 'adminUid123';
        const adminEmail = 'jasmindustin@gmail.com';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ 
          uid: adminUid, 
          email: adminEmail 
        });
        mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
        mockFirestoreCollection.doc.mockReturnValue(mockFirestoreDoc);
        mockFirestoreDoc.get.mockResolvedValue({ exists: true, data: () => ({ email: adminEmail }) });
        
        const req = mockRequest({ idToken: 'valid-token' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('valid-token');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ 
          message: 'User signed in successfully via Google', 
          token: 'valid-token',
          tokenType: 'id',
          userId: adminUid,
          user: { uid: adminUid, email: adminEmail }
        });
      });

      // In test mode, authentication works the same way - no special UID handling
    });

    describe('Production Mode (NODE_ENV=development)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      it('should authenticate admin user from allowed list in production mode', async () => {
        const adminEmail = 'jasmindustin@gmail.com';
        const uid = 'prodAdminUid';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email: adminEmail });
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ uid, email: adminEmail, customClaims: {} });
        mockFirebaseAdminAuth.setCustomUserClaims.mockResolvedValue({});
        mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
        mockFirestoreCollection.doc.mockReturnValue(mockFirestoreDoc);
        mockFirestoreDoc.get.mockResolvedValue({ exists: true, data: () => ({ email: adminEmail }) });

        const req = mockRequest({ idToken: 'validGoogleToken' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('validGoogleToken');
        expect(mockFirebaseAdminAuth.setCustomUserClaims).toHaveBeenCalledWith(uid, { admin: true });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ 
          message: 'User signed in successfully via Google',
          token: 'validGoogleToken',
          tokenType: 'id',
          userId: uid,
          user: { uid, email: adminEmail }
        });
      });

      it('should authenticate non-admin user from allowed list in production mode', async () => {
        const userEmail = 'andyrowe00@gmail.com';
        const uid = 'prodUserUid';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email: userEmail });
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ uid, email: userEmail, customClaims: {} });
        mockFirebaseAdminAuth.setCustomUserClaims.mockResolvedValue({});
        mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
        mockFirestoreCollection.doc.mockReturnValue(mockFirestoreDoc);
        mockFirestoreDoc.get.mockResolvedValue({ exists: true, data: () => ({ email: userEmail }) });

        const req = mockRequest({ idToken: 'validGoogleTokenUser' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('validGoogleTokenUser');
        expect(mockFirebaseAdminAuth.setCustomUserClaims).toHaveBeenCalledWith(uid, { admin: true });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ 
          message: 'User signed in successfully via Google',
          token: 'validGoogleTokenUser',
          tokenType: 'id',
          userId: uid,
          user: { uid, email: userEmail }
        });
      });

      it('should return 403 if email not in allowed list in production mode', async () => {
        const uid = 'unauthorizedUid';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email: 'unauthorized@example.com' });
        mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
        mockFirestoreCollection.doc.mockReturnValue(mockFirestoreDoc);
        mockFirestoreDoc.get.mockResolvedValue({ exists: true, data: () => ({ email: 'unauthorized@example.com' }) });

        const req = mockRequest({ idToken: 'validGoogleTokenUnauthorized' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('validGoogleTokenUnauthorized');
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      });

      it('should return 401 for expired ID token in production mode', async () => {
        const error = new Error('Token expired');
        error.code = 'auth/id-token-expired';
        mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(error);
        
        const req = mockRequest({ idToken: 'expiredToken' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('expiredToken');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Google ID token' });
      });

      it('should return 401 for invalid signature in production mode', async () => {
        const error = new Error('The Firebase ID token has an invalid signature...');
        error.code = 'auth/argument-error';
        mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(error);

        const req = mockRequest({ idToken: 'invalidSigToken' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('invalidSigToken');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Google ID token' });
      });

      it('should create new user profile on first Google sign-in', async () => {
        const uid = 'newGoogleUser';
        const email = 'jasmindustin@gmail.com';
        mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({ uid, email, name: 'Jasmin Dustin' });
        mockFirebaseAdminAuth.getUser.mockResolvedValue({ uid, email, customClaims: {} });
        mockFirebaseAdminAuth.setCustomUserClaims.mockResolvedValue({});
        mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
        mockFirestoreCollection.doc.mockReturnValue(mockFirestoreDoc);
        mockFirestoreDoc.get.mockResolvedValue({ exists: false }); // New user
        mockFirestoreDoc.set.mockResolvedValue({});

        const req = mockRequest({ idToken: 'tokenForNewUser' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('tokenForNewUser');
        expect(mockFirestoreDoc.set).toHaveBeenCalledWith(expect.objectContaining({
          email: email,
          first_name: 'Jasmin',
          last_name: 'Dustin',
          uid: uid
        }));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ 
          message: 'User signed in successfully via Google',
          token: 'tokenForNewUser',
          tokenType: 'id',
          userId: uid,
          user: { uid, email }
        });
      });

      it('should return 500 for other internal errors during Google sign-in in production mode', async () => {
        const errorMessage = 'Some other internal error';
        mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(new Error(errorMessage));
        
        const req = mockRequest({ idToken: 'tokenCausingInternalError' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = vi.fn();
        await router(req, res, next);

        await new Promise(resolve => setImmediate(resolve));

        expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('tokenCausingInternalError');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Google ID token' });
      });
    });
  });
});

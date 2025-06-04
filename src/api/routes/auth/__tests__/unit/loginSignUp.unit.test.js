// src/api/routes/auth/__tests__/unit/loginSignUp.unit.test.js
import { jest } from '@jest/globals';
import express from 'express';

// Declare variables that will hold the mock functions and mock instances
let mockCreateUserWithEmailAndPassword;
let mockSignInWithEmailAndPassword;
let mockClientGetAuth; // For firebase/auth
let mockClientAuthInstance; // The object returned by client getAuth

let mockSetCustomUserClaims;
let mockGetUser_admin; 
let mockVerifyIdToken;
let mockAdminGetAuth; // For firebase-admin/auth
let mockAdminAuthInstance; // The object returned by admin getAuth

let mockGetFirestore; // For firebase-admin/firestore
let mockFirestoreInstance; // The mock database instance

// Mock firebase/auth (Client SDK)
jest.unstable_mockModule('firebase/auth', () => {
  mockClientAuthInstance = { name: 'MockClientAuthInstance' }; 
  mockCreateUserWithEmailAndPassword = jest.fn();
  mockSignInWithEmailAndPassword = jest.fn();
  mockClientGetAuth = jest.fn(() => mockClientAuthInstance); 

  return {
    getAuth: mockClientGetAuth, 
    createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword, 
    signInWithEmailAndPassword: mockSignInWithEmailAndPassword,   
  };
});

// Mock firebase-admin/auth (Admin SDK)
jest.unstable_mockModule('firebase-admin/auth', () => {
  mockAdminAuthInstance = { name: 'MockAdminAuthInstance' }; 
  mockSetCustomUserClaims = jest.fn();
  mockGetUser_admin = jest.fn();
  mockVerifyIdToken = jest.fn();
  
  mockAdminAuthInstance.setCustomUserClaims = mockSetCustomUserClaims;
  mockAdminAuthInstance.getUser = mockGetUser_admin;
  mockAdminAuthInstance.verifyIdToken = mockVerifyIdToken;
  
  mockAdminGetAuth = jest.fn(() => mockAdminAuthInstance); 

  return {
    getAuth: mockAdminGetAuth, 
  };
});

// Mock firebase-admin/firestore (Admin SDK)
jest.unstable_mockModule('firebase-admin/firestore', () => {
  const mockDoc = {
    set: jest.fn().mockResolvedValue({}),
  };
  
  const mockCollection = {
    doc: jest.fn(() => mockDoc),
  };
  
  mockFirestoreInstance = {
    collection: jest.fn(() => mockCollection),
  };
  
  mockGetFirestore = jest.fn(() => mockFirestoreInstance);

  return {
    getFirestore: mockGetFirestore,
  };
});

const ethEscrowAppMock = { name: 'ethEscrowAppMock' }; 
const adminAppMock = { name: 'adminAppMock' };       

jest.unstable_mockModule('../../authIndex.js', () => ({
  ethEscrowApp: ethEscrowAppMock, 
}));
jest.unstable_mockModule('../../admin.js', () => ({
  adminApp: adminAppMock,
  getAdminApp: jest.fn().mockResolvedValue(adminAppMock),
}));

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
      mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUserPayload });
      mockSetCustomUserClaims.mockResolvedValue({}); 

      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next);

      // Allow any pending microtasks/macrotasks to complete
      await new Promise(resolve => setImmediate(resolve));

      expect(mockClientGetAuth).toHaveBeenCalledWith(ethEscrowAppMock);
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        mockClientAuthInstance, 'test@example.com', 'password123'
      );
      expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
      expect(mockSetCustomUserClaims).toHaveBeenCalledWith(mockUserPayload.uid, { admin: true });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'User created successfully', 
        user: { uid: mockUserPayload.uid, email: mockUserPayload.email } 
      });
    });

    it('should create a user successfully (test env - no claims set)', async () => {
      process.env.NODE_ENV = 'test'; 
      const mockUserPayload = { uid: 'testUid', email: 'test@example.com' };
      mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUserPayload });

      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next); 
      
      await new Promise(resolve => setImmediate(resolve)); // Added for consistency, though might not be strictly needed if no internal awaits before res

      expect(mockClientGetAuth).toHaveBeenCalledWith(ethEscrowAppMock);
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        mockClientAuthInstance, 'test@example.com', 'password123'
      );
      expect(mockAdminGetAuth).not.toHaveBeenCalled();
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled(); 
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
      expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('should return 409 if email already in use', async () => {
      mockCreateUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
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
      mockCreateUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/some-other-error', message: errorMessage });
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
      const mockUserPayload = { 
        uid: 'testUid', 
        email: 'test@example.com',
        getIdToken: jest.fn().mockResolvedValue('mock-id-token')
      }; 
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUserPayload });

      const req = mockRequest({ email: 'test@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next); 
      
      await new Promise(resolve => setImmediate(resolve));

      expect(mockClientGetAuth).toHaveBeenCalledWith(ethEscrowAppMock);
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        mockClientAuthInstance, 'test@example.com', 'password123'
      );
      expect(mockAdminGetAuth).not.toHaveBeenCalled();
      expect(mockGetUser_admin).not.toHaveBeenCalled(); 
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'User signed in successfully', 
        token: 'mock-id-token',
        user: { uid: mockUserPayload.uid, email: mockUserPayload.email } 
      }); 
    });

    it('should sign in admin user successfully (non-test env)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUserPayload = { 
        uid: 'testUid', 
        email: 'admin@example.com',
        getIdToken: jest.fn().mockResolvedValue('mock-admin-id-token')
      };
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUserPayload });
      mockGetUser_admin.mockResolvedValue({ uid: mockUserPayload.uid, customClaims: { admin: true } });

      const req = mockRequest({ email: 'admin@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next); 
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockClientGetAuth).toHaveBeenCalledWith(ethEscrowAppMock);
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        mockClientAuthInstance, 'admin@example.com', 'password123'
      );
      expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
      expect(mockGetUser_admin).toHaveBeenCalledWith(mockUserPayload.uid);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'User signed in successfully', 
        token: 'mock-admin-id-token',
        user: { uid: mockUserPayload.uid, email: mockUserPayload.email } 
      });
    });

    it('should return 401 if non-admin user signs in (non-test env and admin check is enforced)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUserPayload = { 
        uid: 'testUid', 
        email: 'user@example.com',
        getIdToken: jest.fn().mockResolvedValue('mock-user-id-token')
      };
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUserPayload });
      mockGetUser_admin.mockResolvedValue({ uid: mockUserPayload.uid, customClaims: { admin: false } }); 

      const req = mockRequest({ email: 'user@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next); 
      
      await new Promise(resolve => setImmediate(resolve));

      expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
      expect(mockGetUser_admin).toHaveBeenCalledWith(mockUserPayload.uid);
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
      expect(mockSignInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('should return 401 for wrong password', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/wrong-password' });
      const req = mockRequest({ email: 'test@example.com', password: 'wrongpassword' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next); 
      
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should return 401 for user not found during sign in', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/user-not-found' });
      const req = mockRequest({ email: 'nonexistent@example.com', password: 'password123' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();
      await router(req, res, next); 
      
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
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
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
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
        expect(mockAdminGetAuth).not.toHaveBeenCalled();
      });

      it('should authenticate admin user with UID as token in test mode', async () => {
        const adminUid = 'adminUid123';
        mockGetUser_admin.mockResolvedValue({ uid: adminUid, customClaims: { admin: true } }); 
        const req = mockRequest({ idToken: adminUid }, {}, {}, routeMethod, routeUrl); 
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockGetUser_admin).toHaveBeenCalledWith(adminUid);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated (test)', uid: adminUid, isAdmin: true });
      });

      it('should return 401 if non-admin user (UID as token) in test mode and admin required', async () => {
        const userUid = 'userUid456';
        mockGetUser_admin.mockResolvedValue({ uid: userUid, customClaims: { admin: false } }); 
        const req = mockRequest({ idToken: userUid }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockGetUser_admin).toHaveBeenCalledWith(userUid);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized user (test mode - admin required)' });
      });

      it('should return 401 if getUser fails (e.g., UID not found) in test mode', async () => {
        mockGetUser_admin.mockRejectedValue(new Error('User not found by UID'));
        const req = mockRequest({ idToken: 'unknownUid' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockGetUser_admin).toHaveBeenCalledWith('unknownUid');
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
        mockVerifyIdToken.mockResolvedValue({ uid, email: adminEmail });
        mockGetUser_admin.mockResolvedValue({ uid, email: adminEmail }); 
        
        const req = mockRequest({ idToken: 'validGoogleToken' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('validGoogleToken', true); 
        expect(mockGetUser_admin).toHaveBeenCalledWith(uid); 
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated', uid, isAdmin: true });
      });

      it('should authenticate non-admin user from allowed list in production mode', async () => {
        const userEmail = 'andyrowe00@gmail.com'; 
        const uid = 'prodUserUid';
        mockVerifyIdToken.mockResolvedValue({ uid, email: userEmail });
        mockGetUser_admin.mockResolvedValue({ uid, email: userEmail });

        const req = mockRequest({ idToken: 'validGoogleTokenUser' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('validGoogleTokenUser', true);
        expect(mockGetUser_admin).toHaveBeenCalledWith(uid);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated', uid, isAdmin: false });
      });

      it('should return 403 if email not in allowed list in production mode', async () => {
        const uid = 'unauthorizedUid';
        mockVerifyIdToken.mockResolvedValue({ uid, email: 'unauthorized@example.com' });
        mockGetUser_admin.mockResolvedValue({ uid, email: 'unauthorized@example.com' });

        const req = mockRequest({ idToken: 'validGoogleTokenUnauthorized' }, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));
        
        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('validGoogleTokenUnauthorized', true);
        expect(mockGetUser_admin).toHaveBeenCalledWith(uid);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. This email address is not authorized.' });
      });
      
      it('should return 401 for expired ID token in production mode', async () => {
        mockVerifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired' });
        const req = mockRequest({ idToken: 'expiredToken'}, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('expiredToken', true);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Login session expired, please sign in again.' });
      });

      it('should return 401 for invalid signature in production mode', async () => {
        const error = new Error('The Firebase ID token has an invalid signature...');
        error.code = 'auth/argument-error'; 
        mockVerifyIdToken.mockRejectedValue(error);
        
        const req = mockRequest({ idToken: 'invalidSigToken'}, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('invalidSigToken', true);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid authentication token signature. Please ensure the frontend and backend are using the same Firebase project.' });
      });

      it('should return 404 if user not found after token verification in production mode', async () => {
        const uid = 'verifiedButNotFoundUid';
        mockVerifyIdToken.mockResolvedValue({ uid, email: 'jasmindustin@gmail.com' }); 
        mockGetUser_admin.mockRejectedValue({ code: 'auth/user-not-found'}); 
        
        const req = mockRequest({ idToken: 'tokenForNotFoundUser'}, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('tokenForNotFoundUser', true);
        expect(mockGetUser_admin).toHaveBeenCalledWith(uid); 
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Authenticated user profile not found.' });
      });

      it('should return 500 for other internal errors during Google sign-in in production mode', async () => {
        const errorMessage = 'Some other internal error';
        mockVerifyIdToken.mockRejectedValue(new Error(errorMessage)); 
        const req = mockRequest({ idToken: 'tokenCausingInternalError'}, {}, {}, routeMethod, routeUrl);
        const res = mockResponse();
        const next = jest.fn();
        await router(req, res, next); 
        
        await new Promise(resolve => setImmediate(resolve));

        expect(mockAdminGetAuth).toHaveBeenCalledWith(adminAppMock);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('tokenCausingInternalError', true);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'An internal error occurred during authentication.' });
      });
    });
  });
});

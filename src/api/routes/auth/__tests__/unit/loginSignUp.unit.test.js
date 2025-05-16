import { jest } from '@jest/globals';
import express from 'express';
import router from '../../loginSignUp.js'; // Path to the router being tested

// Mock Firebase SDKs and apps
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockSignInWithEmailAndPassword = jest.fn();
const mockSetCustomUserClaims = jest.fn();
const mockGetUser = jest.fn();
const mockVerifyIdToken = jest.fn();

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})), // Mock getAuth to return a dummy auth object
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({ // Mock getAdminAuth
    setCustomUserClaims: mockSetCustomUserClaims,
    getUser: mockGetUser,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

// Mock app initializations (if they export anything specific that's used beyond being passed to getAuth)
jest.mock('../../../authIndex.js', () => ({
  ethEscrowApp: {},
}));
jest.mock('../../../admin.js', () => ({
  adminApp: {},
}));

// Helper to create a mock Express app with the router
const setupApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/', router); // Mount router at root for simpler testing of its routes
  return app;
  
};

// Mock Express request and response objects
const mockRequest = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query,
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
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

  describe('POST /signUpEmailPass', () => {
    const route = '/signUpEmailPass';

    it('should create a user successfully (non-test env)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUser = { uid: 'testUid', email: 'test@example.com' };
      mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser });
      mockSetCustomUserClaims.mockResolvedValue({});

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();

      await router.handle(req, res, () => {}); // Manually invoke router handler

      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'test@example.com', 'password123');
      expect(mockSetCustomUserClaims).toHaveBeenCalledWith(mockUser.uid, { admin: true });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'User created', uid: mockUser.uid });
    });

    it('should create a user successfully (test env - no claims set)', async () => {
      process.env.NODE_ENV = 'test';
      const mockUser = { uid: 'testUid', email: 'test@example.com' };
      mockCreateUserWithEmailAndPassword.mockResolvedValue({ user: mockUser });

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'test@example.com', 'password123');
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'User created', uid: mockUser.uid });
    });

    it('should return 400 if email or password is missing', async () => {
      const req = mockRequest({ email: 'test@example.com' }); // Missing password
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    it('should return 401 if email already in use', async () => {
      mockCreateUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email already in use' });
    });

    it('should return 401 for other Firebase errors', async () => {
      mockCreateUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/some-other-error', message: 'Some Firebase error' });
      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Some Firebase error' });
    });
  });

  describe('POST /signInEmailPass', () => {
    const route = '/signInEmailPass';

    it('should sign in user successfully (test env)', async () => {
      process.env.NODE_ENV = 'test';
      const mockUser = { uid: 'testUid', email: 'test@example.com' };
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUser });

      const req = mockRequest({ email: 'test@example.com', password: 'password123' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'test@example.com', 'password123');
      expect(mockGetUser).not.toHaveBeenCalled(); // No admin check in test mode
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User signed in', uid: mockUser.email });
    });

    it('should sign in admin user successfully (non-test env)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUser = { uid: 'testUid', email: 'admin@example.com' };
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUser });
      mockGetUser.mockResolvedValue({ uid: mockUser.uid, customClaims: { admin: true } });

      const req = mockRequest({ email: 'admin@example.com', password: 'password123' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(mockGetUser).toHaveBeenCalledWith(mockUser.uid);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User signed in', uid: mockUser.email });
    });

    it('should return 401 if non-admin user signs in (non-test env)', async () => {
      process.env.NODE_ENV = 'development';
      const mockUser = { uid: 'testUid', email: 'user@example.com' };
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: mockUser });
      mockGetUser.mockResolvedValue({ uid: mockUser.uid, customClaims: { admin: false } });

      const req = mockRequest({ email: 'user@example.com', password: 'password123' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized user' });
    });

    it('should return 400 if email or password is missing', async () => {
      const req = mockRequest({ email: 'test@example.com' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    it('should return 401 for wrong password', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/wrong-password' });
      const req = mockRequest({ email: 'test@example.com', password: 'wrongpassword' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid password' });
    });

    it('should return 401 for user not found', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValue({ code: 'auth/user-not-found' });
      const req = mockRequest({ email: 'nonexistent@example.com', password: 'password123' });
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  describe('POST /signInGoogle', () => {
    const route = '/signInGoogle';

    it('should return 400 if idToken is missing', async () => {
      const req = mockRequest({});
      const res = mockResponse();
      await router.handle(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing ID token' });
    });

    // --- Test Mode Scenarios --- //
    describe('Test Mode (NODE_ENV=test)', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'test';
      });

      it('should return 401 for literal \'invalid-token\'', async () => {
        const req = mockRequest({ idToken: 'invalid-token' });
        const res = mockResponse();
        await router.handle(req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID token' });
      });

      it('should authenticate admin user with UID as token', async () => {
        const adminUid = 'adminUid123';
        mockGetUser.mockResolvedValue({ uid: adminUid, customClaims: { admin: true } });
        const req = mockRequest({ idToken: adminUid });
        const res = mockResponse();
        await router.handle(req, res, () => {});

        expect(mockGetUser).toHaveBeenCalledWith(adminUid);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated (test)', uid: adminUid, isAdmin: true });
      });

      it('should return 401 if non-admin user (UID as token)', async () => {
        const userUid = 'userUid456';
        mockGetUser.mockResolvedValue({ uid: userUid, customClaims: { admin: false } });
        const req = mockRequest({ idToken: userUid });
        const res = mockResponse();
        await router.handle(req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized user (test mode - admin required)' });
      });

      it('should return 401 if getUser fails (e.g. UID not found)', async () => {
        mockGetUser.mockRejectedValue(new Error('User not found by UID'));
        const req = mockRequest({ idToken: 'unknownUid' });
        const res = mockResponse();
        await router.handle(req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid user UID provided as token (test mode)' });
      });
    });

    // --- Production Mode Scenarios --- //
    describe('Production Mode (NODE_ENV=development)', () => {
      const allowedEmails = ['jasmindustin@gmail.com', 'dustin.jasmin@jaspire.co', 'andyrowe00@gmail.com'];
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      it('should authenticate admin user from allowed list', async () => {
        const adminEmail = 'jasmindustin@gmail.com';
        const uid = 'prodAdminUid';
        mockVerifyIdToken.mockResolvedValue({ uid, email: adminEmail });
        mockGetUser.mockResolvedValue({ uid, email: adminEmail }); // Assuming getUser is called and returns email
        
        const req = mockRequest({ idToken: 'validGoogleToken' });
        const res = mockResponse();
        await router.handle(req, res, () => {});

        expect(mockVerifyIdToken).toHaveBeenCalledWith('validGoogleToken', true);
        expect(mockGetUser).toHaveBeenCalledWith(uid);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated', uid, isAdmin: true });
      });

      it('should authenticate non-admin user from allowed list', async () => {
        const userEmail = 'andyrowe00@gmail.com';
        const uid = 'prodUserUid';
        mockVerifyIdToken.mockResolvedValue({ uid, email: userEmail });
        mockGetUser.mockResolvedValue({ uid, email: userEmail });

        const req = mockRequest({ idToken: 'validGoogleTokenUser' });
        const res = mockResponse();
        await router.handle(req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'User authenticated', uid, isAdmin: false });
      });

      it('should return 403 if email not in allowed list', async () => {
        const uid = 'unauthorizedUid';
        mockVerifyIdToken.mockResolvedValue({ uid, email: 'unauthorized@example.com' });
        mockGetUser.mockResolvedValue({ uid, email: 'unauthorized@example.com' });

        const req = mockRequest({ idToken: 'validGoogleTokenUnauthorized' });
        const res = mockResponse();
        await router.handle(req, res, () => {});

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. This email address is not authorized.' });
      });
      
      it('should return 401 for expired ID token', async () => {
        mockVerifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired' });
        const req = mockRequest({ idToken: 'expiredToken'});
        const res = mockResponse();
        await router.handle(req, res, () => {});
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Login session expired, please sign in again.' });
      });

      it('should return 401 for invalid signature', async () => {
        mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message: 'invalid signature' });
        const req = mockRequest({ idToken: 'invalidSigToken'});
        const res = mockResponse();
        await router.handle(req, res, () => {});
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid authentication token signature. Please ensure the frontend and backend are using the same Firebase project.' });
      });

      it('should return 404 if user not found after token verification', async () => {
        const uid = 'verifiedButNotFoundUid';
        mockVerifyIdToken.mockResolvedValue({ uid, email: 'jasmindustin@gmail.com' });
        mockGetUser.mockRejectedValue({ code: 'auth/user-not-found'});
        const req = mockRequest({ idToken: 'tokenForNotFoundUser'});
        const res = mockResponse();
        await router.handle(req, res, () => {});
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Authenticated user profile not found.' });
      });

      it('should return 500 for other internal errors', async () => {
        mockVerifyIdToken.mockRejectedValue(new Error('Some other internal error'));
        const req = mockRequest({ idToken: 'tokenCausingInternalError'});
        const res = mockResponse();
        await router.handle(req, res, () => {});
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'An internal error occurred during authentication.' });
      });
    });
  });
}); 
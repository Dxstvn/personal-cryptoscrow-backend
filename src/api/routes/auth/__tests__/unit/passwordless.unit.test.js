import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import passwordlessRouter from '../../passwordless.js';

// Mock dependencies
vi.mock('../../../../services/emailLinkService.js', () => ({
  default: {
    sendSignInLink: vi.fn(),
    verifyUserToken: vi.fn(),
    createOrUpdateUserProfile: vi.fn(),
    getUserByEmail: vi.fn(),
    maskEmail: vi.fn(email => email.replace(/(.{2}).*@/, '$1***@'))
  }
}));

vi.mock('../../../../services/databaseService.js', () => ({
  default: {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('../../../../services/securityLogger.js', () => ({
  default: {
    logSecurityEvent: vi.fn()
  }
}));

vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP'
      }
    }
  }
}));

// Get mocked modules
const emailLinkService = (await import('../../../../services/emailLinkService.js')).default;
const databaseService = (await import('../../../../services/databaseService.js')).default;
const securityLogger = (await import('../../../../services/securityLogger.js')).default;

describe('Passwordless Authentication Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/auth/passwordless', passwordlessRouter);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /auth/passwordless/send-link', () => {
    beforeEach(() => {
      // Set test environment
      process.env.NODE_ENV = 'test';
    });

    it('should send sign-in link successfully', async () => {
      emailLinkService.sendSignInLink.mockResolvedValue({
        success: true,
        message: 'Sign-in link generated successfully',
        link: 'https://example.com/auth/action' // Only in dev/test mode
      });

      emailLinkService.getUserByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/passwordless/send-link')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Sign-in link sent to your email. Please check your inbox.'
      });
      
      // In test mode, link should be included
      expect(response.body.link).toBeDefined();

      expect(emailLinkService.sendSignInLink).toHaveBeenCalledWith('test@example.com');
      expect(databaseService.create).toHaveBeenCalledWith('auth_attempts', expect.objectContaining({
        email: 'test@example.com',
        type: 'passwordless',
        userExists: false
      }));
    });

    it('should return 400 if email is missing', async () => {
      const response = await request(app)
        .post('/auth/passwordless/send-link')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Email is required'
      });

      expect(emailLinkService.sendSignInLink).not.toHaveBeenCalled();
    });

    it('should handle rate limiting', async () => {
      // Send 3 requests to trigger rate limit
      for (let i = 0; i < 3; i++) {
        emailLinkService.sendSignInLink.mockResolvedValue({
          success: true,
          link: 'https://example.com/auth/action',
          message: 'Sign-in link generated successfully'
        });

        await request(app)
          .post('/auth/passwordless/send-link')
          .send({ email: 'ratelimit@example.com' });
      }

      // Fourth request should be rate limited
      const response = await request(app)
        .post('/auth/passwordless/send-link')
        .send({ email: 'ratelimit@example.com' });

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Too many attempts. Please try again later.'
      });

      expect(securityLogger.logSecurityEvent).toHaveBeenCalledWith(
        'PASSWORDLESS_RATE_LIMIT_EXCEEDED',
        expect.any(Object)
      );
    });
  });

  describe('POST /auth/passwordless/verify-token', () => {
    it('should verify token and create new user successfully', async () => {
      const mockDecodedToken = {
        uid: 'test-uid-123',
        email: 'test@example.com',
        email_verified: true
      };

      emailLinkService.verifyUserToken.mockResolvedValue(mockDecodedToken);
      emailLinkService.createOrUpdateUserProfile.mockResolvedValue({
        uid: 'test-uid-123',
        email: 'test@example.com',
        emailVerified: true,
        signInProvider: 'email',
        lastSignIn: new Date().toISOString()
      });

      databaseService.get.mockResolvedValue(null); // User doesn't exist

      const response = await request(app)
        .post('/auth/passwordless/verify-token')
        .send({ idToken: 'valid-firebase-token' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        user: {
          uid: 'test-uid-123',
          email: 'test@example.com',
          emailVerified: true
        }
      });
      expect(response.body.token).toBeDefined();

      expect(emailLinkService.verifyUserToken).toHaveBeenCalledWith('valid-firebase-token');
      expect(databaseService.create).toHaveBeenCalledWith(
        'users',
        expect.objectContaining({
          uid: 'test-uid-123',
          email: 'test@example.com',
          emailVerified: true,
          authMethod: 'passwordless'
        }),
        'test-uid-123'
      );
    });

    it('should verify token and update existing user', async () => {
      const mockDecodedToken = {
        uid: 'existing-uid-123',
        email: 'existing@example.com',
        email_verified: true
      };

      const existingUser = {
        uid: 'existing-uid-123',
        email: 'existing@example.com',
        profile: {
          displayName: 'Existing User',
          photoURL: ''
        }
      };

      emailLinkService.verifyUserToken.mockResolvedValue(mockDecodedToken);
      emailLinkService.createOrUpdateUserProfile.mockResolvedValue({
        uid: 'existing-uid-123',
        email: 'existing@example.com',
        emailVerified: true
      });

      databaseService.get.mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/auth/passwordless/verify-token')
        .send({ idToken: 'valid-firebase-token' });

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        uid: 'existing-uid-123',
        email: 'existing@example.com',
        emailVerified: true,
        displayName: 'Existing User'
      });

      expect(databaseService.update).toHaveBeenCalledWith(
        'users',
        'existing-uid-123',
        expect.objectContaining({
          lastLogin: 'SERVER_TIMESTAMP',
          emailVerified: true
        })
      );
    });

    it('should return 400 if token is missing', async () => {
      const response = await request(app)
        .post('/auth/passwordless/verify-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'ID token is required'
      });
    });

    it('should handle invalid token error', async () => {
      const error = new Error('Invalid token');
      error.code = 'auth/invalid-id-token';
      emailLinkService.verifyUserToken.mockRejectedValue(error);

      const response = await request(app)
        .post('/auth/passwordless/verify-token')
        .send({ idToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid authentication token.'
      });
    });
  });

  describe('GET /auth/passwordless/check-email', () => {
    it('should always return success for security', async () => {
      emailLinkService.getUserByEmail.mockResolvedValue({
        uid: 'user-123',
        email: 'existing@example.com'
      });

      const response = await request(app)
        .get('/auth/passwordless/check-email')
        .query({ email: 'existing@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        hint: 'Check your email for sign-in link'
      });
    });

    it('should return success even if user does not exist', async () => {
      emailLinkService.getUserByEmail.mockRejectedValue({
        code: 'auth/user-not-found'
      });

      const response = await request(app)
        .get('/auth/passwordless/check-email')
        .query({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        hint: 'Check your email for sign-in link'
      });
    });
  });

  describe('POST /auth/passwordless/resend', () => {
    it('should resend sign-in link with stricter rate limiting', async () => {
      emailLinkService.sendSignInLink.mockResolvedValue({
        success: true,
        message: 'Sign-in link generated successfully',
        link: 'https://example.com/auth/action' // Only in dev/test mode
      });

      // First resend should work
      const response1 = await request(app)
        .post('/auth/passwordless/resend')
        .send({ email: 'resend@example.com' });

      expect(response1.status).toBe(200);
      expect(response1.body).toMatchObject({
        success: true,
        message: 'New sign-in link sent to your email.'
      });

      // Second resend should also work
      const response2 = await request(app)
        .post('/auth/passwordless/resend')
        .send({ email: 'resend@example.com' });

      expect(response2.status).toBe(200);

      // Third resend should be rate limited
      const response3 = await request(app)
        .post('/auth/passwordless/resend')
        .send({ email: 'resend@example.com' });

      expect(response3.status).toBe(429);
      expect(response3.body).toMatchObject({
        success: false,
        error: 'Please wait before requesting another link.'
      });
    });

    it('should return 400 if email is missing', async () => {
      const response = await request(app)
        .post('/auth/passwordless/resend')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Email is required'
      });
    });
  });
});
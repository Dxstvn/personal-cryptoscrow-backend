// Import required modules
import request from 'supertest';
import app from '../quicktest.js'; // Import your Express app
import {
  mockCreateUserWithEmailAndPassword,
  mockSignInWithEmailAndPassword,
  mockVerifyIdToken,
  mockAuth,
  mockAdminAuth
} from './setup.js';

// Test suite for authentication routes
describe('Authentication Routes', () => {
  // Email/Password Sign-Up Tests
  describe('Email/Password Sign-Up', () => {
    it('should successfully sign up a new user with valid credentials', async () => {
      // Mock successful user creation
      const mockUser = { uid: 'test-uid' };
      mockCreateUserWithEmailAndPassword.mockResolvedValueOnce({ user: mockUser });

      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/signUpEmailPass')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        message: 'User created',
        uid: mockUser.uid
      });
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        userData.email,
        userData.password
      );
    });

    it('should reject sign-up with missing email', async () => {
      const response = await request(app)
        .post('/auth/signUpEmailPass')
        .send({ password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Email and password are required' });
    });

    it('should reject sign-up with missing password', async () => {
      const response = await request(app)
        .post('/auth/signUpEmailPass')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Email and password are required' });
    });

    it('should handle Firebase errors during sign-up', async () => {
      mockCreateUserWithEmailAndPassword.mockRejectedValueOnce({
        code: 'auth/email-already-in-use',
        message: 'Email already in use'
      });

      const response = await request(app)
        .post('/auth/signUpEmailPass')
        .send({
          email: 'existing@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Email already in use' });
    });
  });

  // Email/Password Sign-In Tests
  describe('Email/Password Sign-In', () => {
    it('should successfully sign in with valid credentials', async () => {
      const mockUser = { uid: 'test-uid' };
      mockSignInWithEmailAndPassword.mockResolvedValueOnce({ user: mockUser });

      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/signInEmailPass')
        .send(userData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'User signed in',
        uid: mockUser.uid
      });
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        userData.email,
        userData.password
      );
    });

    it('should reject sign-in with invalid credentials', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValueOnce({
        code: 'auth/wrong-password',
        message: 'Invalid password'
      });

      const response = await request(app)
        .post('/auth/signInEmailPass')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid password' });
    });

    it('should reject sign-in for non-existent user', async () => {
      mockSignInWithEmailAndPassword.mockRejectedValueOnce({
        code: 'auth/user-not-found',
        message: 'User not found'
      });

      const response = await request(app)
        .post('/auth/signInEmailPass')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not found' });
    });
  });

  // Google Sign-In Tests
  describe('Google Sign-In', () => {
    it('should successfully authenticate with valid Google ID token', async () => {
      const mockDecodedToken = {
        uid: 'qmKQsr8ZKJb6p7HKeLRGzcB1dsA2',
        email: 'admin@example.com'
      };
      mockVerifyIdToken.mockResolvedValueOnce(mockDecodedToken);

      const response = await request(app)
        .post('/auth/signInGoogle')
        .send({ idToken: 'valid-google-id-token' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'User authenticated',
        uid: mockDecodedToken.uid,
        isAdmin: true
      });
      expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-google-id-token');
    });

    it('should reject Google sign-in with invalid token', async () => {
      mockVerifyIdToken.mockRejectedValueOnce({
        code: 'auth/invalid-id-token',
        message: 'Invalid ID token'
      });

      const response = await request(app)
        .post('/auth/signInGoogle')
        .send({ idToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid ID token' });
    });

    it('should reject Google sign-in for non-admin user', async () => {
      const mockDecodedToken = {
        uid: 'non-admin-uid',
        email: 'user@example.com'
      };
      mockVerifyIdToken.mockResolvedValueOnce(mockDecodedToken);

      const response = await request(app)
        .post('/auth/signInGoogle')
        .send({ idToken: 'valid-google-id-token' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized user' });
    });

    it('should reject Google sign-in with missing ID token', async () => {
      const response = await request(app)
        .post('/auth/signInGoogle')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing ID token' });
    });
  });
}); 
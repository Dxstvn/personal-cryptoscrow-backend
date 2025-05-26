// Import required modules
import request from 'supertest';
import express from 'express';
import loginRouter from '../../loginSignUp.js'; // Adjusted path
import { adminAuth } from '/Users/dustinjasmin/personal-cryptoscrow-backend/jest.emulator.setup.js';

// Create test app
const app = express();
app.use(express.json());
app.use("/auth", loginRouter);

// Mock user data for tests
const mockUser = {
  email: `testuser-${Date.now()}@example.com`,
  password: 'password123',
};

const mockUserDuplicate = {
  email: `duplicate-${Date.now()}@example.com`,
  password: 'password123',
};

// Test suite for authentication routes
describe('Authentication Routes', () => {
  // Clean up before running tests
  beforeAll(async () => {
    try {
      const userList = await adminAuth.listUsers(1000);
      const userIds = userList.users.map(user => user.uid);
      if (userIds.length > 0) {
        console.log(`BeforeAll: Deleting ${userIds.length} users: ${userIds.join(', ')}`);
        await Promise.all(userIds.map(uid => adminAuth.deleteUser(uid)));
      } else {
        console.log('BeforeAll: No users to delete');
      }
    } catch (error) {
      console.error('BeforeAll cleanup failed:', error);
      throw error;
    }
  });

  // Clean up before each test
  beforeEach(async () => {
    try {
      const userList = await adminAuth.listUsers(1000);
      const userIds = userList.users.map(user => user.uid);
      if (userIds.length > 0) {
        console.log(`BeforeEach: Deleting ${userIds.length} users: ${userIds.join(', ')}`);
        await Promise.all(userIds.map(uid => adminAuth.deleteUser(uid)));
      } else {
        console.log('BeforeEach: No users to delete');
      }
    } catch (error) {
      console.error('Pre-test cleanup failed:', error);
      throw error;
    }
  });

  // Clean up after each test
  afterEach(async () => {
    try {
      const userList = await adminAuth.listUsers(1000);
      const userIds = userList.users.map(user => user.uid);
      if (userIds.length > 0) {
        console.log(`AfterEach: Deleting ${userIds.length} users: ${userIds.join(', ')}`);
        await Promise.all(userIds.map(uid => adminAuth.deleteUser(uid)));
      } else {
        console.log('AfterEach: No users to delete');
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  });

  // Email/Password Sign-Up Tests
  describe('Email/Password Sign-Up', () => {
    it('should successfully sign up a new user with valid credentials', async () => {
      try {
        const response = await request(app)
          .post('/auth/signUpEmailPass')
          .send(mockUser);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body.user).toHaveProperty('uid');
        expect(response.body).toHaveProperty('message', 'User created successfully');
      } catch (error) {
        console.error('Test error:', error);
        throw error;
      }
    });

    it('should reject sign-up with missing email', async () => {
      const response = await request(app)
        .post('/auth/signUpEmailPass')
        .send({ password: mockUser.password });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Email and password are required' });
    });

    it('should reject sign-up with missing password', async () => {
      const response = await request(app)
        .post('/auth/signUpEmailPass')
        .send({ email: mockUser.email });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Email and password are required' });
    });

    it('should handle duplicate email during sign-up', async () => {
      // First create a user via the sign-up endpoint
      const firstResponse = await request(app)
        .post('/auth/signUpEmailPass')
        .send(mockUserDuplicate);
      expect(firstResponse.status).toBe(201);

      // Sign in to confirm the user exists
      const signInResponse = await request(app)
        .post('/auth/signInEmailPass')
        .send(mockUserDuplicate);
      expect(signInResponse.status).toBe(200);

      // Try to create another user with the same email
      const response = await request(app)
        .post('/auth/signUpEmailPass')
        .send(mockUserDuplicate);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Email already in use' });
    });
  });

  // Email/Password Sign-In Tests
  describe('Email/Password Sign-In', () => {
    beforeEach(async () => {
      // Create a test user directly via the emulator
      await adminAuth.createUser({
        email: mockUser.email,
        password: mockUser.password,
      });
    });

    it('should successfully sign in with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/signInEmailPass')
        .send(mockUser);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('uid');
      expect(response.body).toHaveProperty('message', 'User signed in successfully');
    });

    it('should reject sign-in with invalid password', async () => {
      const response = await request(app)
        .post('/auth/signInEmailPass')
        .send({
          email: mockUser.email,
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid credentials' });
    });

    it('should reject sign-in for non-existent user', async () => {
      const response = await request(app)
        .post('/auth/signInEmailPass')
        .send({
          email: 'nonexistent@example.com',
          password: mockUser.password
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not found' });
    });
  });

  // Google Sign-In Tests
  describe('Google Sign-In', () => {
    it('should successfully authenticate with valid Google ID token', async () => {
      // Create a test admin user
      const adminUser = await adminAuth.createUser({
        email: 'admin@example.com',
        password: 'password123'
      });
      await adminAuth.setCustomUserClaims(adminUser.uid, { admin: true });

      // For testing, we use the UID directly as the token
      const customToken = adminUser.uid;
      
      const response = await request(app)
        .post('/auth/signInGoogle')
        .send({ idToken: customToken });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'User authenticated (test)',
        uid: adminUser.uid,
        isAdmin: true
      });
    });

    it('should reject Google sign-in with invalid token', async () => {
      const response = await request(app)
        .post('/auth/signInGoogle')
        .send({ idToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid ID token' });
    });

    it('should reject Google sign-in for non-admin user', async () => {
      // Create a test non-admin user
      const regularUser = await adminAuth.createUser({
        email: 'user@example.com',
        password: 'password123'
      });
      
      // For testing, we use the UID directly as the token
      const customToken = regularUser.uid;

      const response = await request(app)
        .post('/auth/signInGoogle')
        .send({ idToken: customToken });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized user (test mode - admin required)' });
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
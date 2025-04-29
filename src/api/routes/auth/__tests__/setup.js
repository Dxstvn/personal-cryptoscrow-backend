import { jest } from '@jest/globals';

// Mock Firebase Auth
const mockCreateUserWithEmailAndPassword = jest.fn();
const mockSignInWithEmailAndPassword = jest.fn();
const mockVerifyIdToken = jest.fn();

// Mock Firebase Admin Auth
const mockAdminAuth = {
  verifyIdToken: mockVerifyIdToken
};

// Mock Firebase Auth
const mockAuth = {
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword
};

// Mock Firebase App
const mockFirebaseApp = {
  auth: () => mockAuth
};

// Mock Firebase Admin App
const mockAdminApp = {
  auth: () => mockAdminAuth
};

// Reset all mocks before each test
beforeEach(() => {
  mockCreateUserWithEmailAndPassword.mockReset();
  mockSignInWithEmailAndPassword.mockReset();
  mockVerifyIdToken.mockReset();
});

export {
  mockCreateUserWithEmailAndPassword,
  mockSignInWithEmailAndPassword,
  mockVerifyIdToken,
  mockAuth,
  mockAdminAuth,
  mockFirebaseApp,
  mockAdminApp
}; 
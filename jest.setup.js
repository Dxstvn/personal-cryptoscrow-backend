import { jest } from '@jest/globals';

// Mock Firebase modules
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn()
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
  initializeApp: jest.fn()
}));

// Mock environment variables
process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.FIREBASE_AUTH_DOMAIN = 'test-auth-domain';
process.env.FIREBASE_PROJECT_ID = 'test-project-id';
process.env.FIREBASE_STORAGE_BUCKET = 'test-storage-bucket';
process.env.FIREBASE_MESSAGING_SENDER_ID = 'test-messaging-sender-id';
process.env.FIREBASE_APP_ID = 'test-app-id';
process.env.FIREBASE_MEASUREMENT_ID = 'test-measurement-id';
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'test-credentials-path';
process.env.FRONTEND_URL = 'http://localhost:3000'; 
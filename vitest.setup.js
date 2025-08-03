import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(process.cwd(), 'config/test-env/.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.KYC_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-for-testing-only';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Mock console methods to reduce noise during tests
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

beforeAll(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    // Keep error logs for debugging
    console.error = (...args) => {
      if (process.env.VERBOSE_ERRORS) {
        originalConsole.error(...args);
      }
    };
  }
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

// Global test utilities
global.testHelpers = {
  generateTestEmail: () => `test-${Date.now()}@example.com`,
  generateTestWallet: () => `0x${Math.random().toString(16).substring(2, 42).padEnd(40, '0')}`,
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// KYC test utilities
global.testUtils = {
  generateMockUser: (overrides = {}) => ({
    userId: 'test-user-123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@test.com',
    dateOfBirth: '1990-01-01',
    nationality: 'US',
    countryOfResidence: 'US',
    address: '123 Test St, Test City, TC 12345',
    createdAt: new Date('2024-01-01'),
    kycStatus: {
      level: 'none',
      status: 'pending',
      lastUpdated: null,
      expiryDate: null
    },
    ...overrides
  }),

  generateMockKYCSession: (overrides = {}) => ({
    sessionId: 'session-123',
    userId: 'test-user-123',
    requiredLevel: 'basic',
    status: 'active',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    steps: {
      documentUpload: { status: 'pending', completedAt: null },
      livenessCheck: { status: 'pending', completedAt: null },
      dataVerification: { status: 'pending', completedAt: null },
      amlScreening: { status: 'pending', completedAt: null }
    },
    ...overrides
  }),

  generateMockDocument: (overrides = {}) => ({
    documentId: 'doc-123',
    type: 'passport',
    uploadedAt: new Date(),
    verified: false,
    extractedData: {
      fullName: 'John Doe',
      documentNumber: 'AB123456',
      dateOfBirth: '1990-01-01',
      expiryDate: '2030-01-01',
      nationality: 'US'
    },
    qualityScore: 85,
    ...overrides
  })
};

// Firebase emulator settings
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
}
if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
}
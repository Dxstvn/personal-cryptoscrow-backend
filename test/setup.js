// Test setup file for Vitest
import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.KYC_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-for-testing-only';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Mock Firebase Admin
vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(),
    auth: vi.fn(() => ({
      verifyIdToken: vi.fn(),
      getUser: vi.fn(),
      createUser: vi.fn()
    })),
    firestore: vi.fn(() => ({
      collection: vi.fn(),
      doc: vi.fn(),
      batch: vi.fn(),
      runTransaction: vi.fn()
    })),
    storage: vi.fn(() => ({
      bucket: vi.fn()
    }))
  }
}));

// Global test utilities
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
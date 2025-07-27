import { vi, describe, it, expect } from 'vitest';

// Mock config first
vi.mock('../../../config/index.js', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    isInitialized: true
  }
}));

// Mock EscrowServiceV3
vi.mock('../../../services/escrowServiceV3.js', () => ({
  EscrowServiceV3: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getChainConfig: vi.fn(),
    getContract: vi.fn(),
    calculateServiceFee: vi.fn(),
    estimateTotalFees: vi.fn()
  }))
}));

// Mock Firebase Admin
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn()
  }))
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
  FieldValue: {
    arrayUnion: vi.fn(),
    arrayRemove: vi.fn(),
    delete: vi.fn()
  },
  Timestamp: {
    now: vi.fn(),
    fromDate: vi.fn()
  }
}));

vi.mock('../auth/admin.js', () => ({
  getAdminApp: vi.fn().mockResolvedValue({ name: 'test-app' })
}));

describe('Debug Transaction Routes', () => {
  it('should load module', async () => {
    console.log('Starting module import...');
    const module = await import('../../transactionRoutes.js');
    console.log('Module imported successfully');
    expect(module).toBeDefined();
  });
});
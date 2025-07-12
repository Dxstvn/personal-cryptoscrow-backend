import { vi, describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock all dependencies before importing the module
vi.mock('../../../config/index.js', () => ({
  default: {
    initialize: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue('mock-value'),
    isInitialized: true
  }
}));

vi.mock('../../../services/escrowServiceV3.js', () => ({
  EscrowServiceV3: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getChainConfig: vi.fn().mockReturnValue({ chainId: 1 }),
    getContract: vi.fn().mockReturnValue({ address: '0x123' }),
    calculateServiceFee: vi.fn().mockReturnValue('1000000000000000000'),
    estimateTotalFees: vi.fn().mockResolvedValue({
      serviceFee: '1000000000000000000',
      gasEstimate: '50000',
      totalEstimate: '1050000000000000000',
      method: 'direct',
      isEnhanced: false
    })
  }))
}));

const mockGetFirestore = vi.fn();
mockGetFirestore.mockReturnValue({
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({
        exists: true,
        data: () => ({ status: 'Pending' })
      })),
      set: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve())
    })),
    add: vi.fn(() => Promise.resolve({ id: 'newDocId' })),
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ docs: [] }))
        }))
      })),
      get: vi.fn(() => Promise.resolve({ docs: [] }))
    }))
  })),
  doc: vi.fn(),
  runTransaction: vi.fn()
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: mockGetFirestore,
  FieldValue: {
    serverTimestamp: vi.fn(() => 'serverTimestamp'),
    arrayUnion: vi.fn((...args) => ({ _fieldName: 'arrayUnion', _elements: args })),
    arrayRemove: vi.fn((...args) => ({ _fieldName: 'arrayRemove', _elements: args })),
    delete: vi.fn(() => 'deleteField')
  },
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
    fromDate: vi.fn((date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }))
  }
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'testUserId' })
  }))
}));

vi.mock('../../../auth/admin.js', () => ({
  adminApp: { name: 'adminApp', projectId: 'test-project' },
  getAdminApp: vi.fn().mockResolvedValue({ name: 'adminApp', projectId: 'test-project' })
}));

vi.mock('../../../databaseService.js', () => ({
  sendNotificationDB: vi.fn().mockResolvedValue(true),
  updateDealStatusInDB: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('../../../helperFunctions.js', () => ({
  validateAddress: vi.fn((address) => {
    if (!address || typeof address !== 'string') return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  })
}));

vi.mock('ethers', () => ({
  isAddress: vi.fn((addr) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
  getAddress: vi.fn((addr) => addr),
  parseUnits: vi.fn((value, decimals) => value + '0'.repeat(decimals || 18)),
  parseEther: vi.fn((value) => value + '0'.repeat(18)),
  formatEther: vi.fn((value) => (parseInt(value) / 1e18).toString()),
  Wallet: vi.fn().mockImplementation(() => ({
    address: '0x1234567890123456789012345678901234567890'
  })),
  JsonRpcProvider: vi.fn().mockImplementation(() => ({}))
}));

// Import router at top level after mocks
import transactionRouter from '../../transactionRoutes.js';
import { getFirestore } from 'firebase-admin/firestore';

describe('Transaction Routes Unit Tests', () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set up Express app
    app = express();
    app.use(express.json());
    app.use(transactionRouter);
  });

  describe('GET /api/v3/quote', () => {
    it('should return quote for cross-chain transaction', async () => {
      const response = await request(app)
        .get('/api/v3/quote')
        .query({
          amount: '1000000000000000000',
          sourceChain: 'ethereum',
          targetChain: 'polygon'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('serviceFee');
      expect(response.body).toHaveProperty('gasEstimate');
    });

    it('should return 400 without required parameters', async () => {
      const response = await request(app)
        .get('/api/v3/quote');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/createDeal', () => {
    it('should create a new deal', async () => {
      const dealData = {
        buyerAddress: '0x1234567890123456789012345678901234567890',
        sellerAddress: '0x0987654321098765432109876543210987654321',
        depositToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        depositAmount: '1000000000000000000',
        targetToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        sourceChainId: 1,
        targetChainId: 1,
        transactionType: 'direct',
        userId: 'testUserId'
      };

      const response = await request(app)
        .post('/api/createDeal')
        .set('Authorization', 'Bearer valid-token')
        .send(dealData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('dealId');
    });

    it('should return 400 for invalid addresses', async () => {
      const dealData = {
        buyerAddress: 'invalid-address',
        sellerAddress: '0x0987654321098765432109876543210987654321',
        depositToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        depositAmount: '1000000000000000000',
        targetToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        sourceChainId: 1,
        targetChainId: 1,
        transactionType: 'direct',
        userId: 'testUserId'
      };

      const response = await request(app)
        .post('/api/createDeal')
        .set('Authorization', 'Bearer valid-token')
        .send(dealData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/deal/:dealId', () => {
    it('should get deal details', async () => {
      // Mock Firestore to return a deal
      const mockDoc = {
        exists: true,
        data: () => ({
          buyerAddress: '0x1234567890123456789012345678901234567890',
          sellerAddress: '0x0987654321098765432109876543210987654321',
          status: 'Pending',
          depositAmount: '1000000000000000000'
        })
      };
      
      mockGetFirestore.mockReturnValue({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve(mockDoc))
          }))
        }))
      });

      const response = await request(app)
        .get('/api/deal/test-deal-id')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deal');
    });

    it('should return 404 for non-existent deal', async () => {
      // Mock Firestore to return no deal
      const mockDoc = {
        exists: false
      };
      
      mockGetFirestore.mockReturnValue({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: vi.fn(() => Promise.resolve(mockDoc))
          }))
        }))
      });

      const response = await request(app)
        .get('/api/deal/non-existent-deal')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
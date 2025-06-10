import { jest } from '@jest/globals';
import express from 'express';

// Create mock objects for Firebase Admin SDK
const mockFirebaseAdminAuth = {
  verifyIdToken: jest.fn(),
  getUser: jest.fn(),
};

const mockFirebaseAdminFirestore = {
  collection: jest.fn(),
};

const mockAdminApp = { name: 'mockAdminApp' };

// Mock firebase-admin/auth (Admin SDK)
jest.unstable_mockModule('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockFirebaseAdminAuth),
}));

// Mock firebase-admin/firestore (Admin SDK)
jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockFirebaseAdminFirestore),
  FieldValue: {
    serverTimestamp: jest.fn(() => ({ _type: 'serverTimestamp' })),
  },
}));

// Mock admin.js
jest.unstable_mockModule('../../../auth/admin.js', () => ({
  getAdminApp: jest.fn().mockResolvedValue(mockAdminApp),
}));

// Mock ethers for address validation
jest.unstable_mockModule('ethers', () => ({
  isAddress: jest.fn(),
}));

// Mock cross-chain service
jest.unstable_mockModule('../../../../../services/crossChainService.js', () => ({
  prepareCrossChainTransaction: jest.fn(),
  executeCrossChainStep: jest.fn(),
  getCrossChainTransactionStatus: jest.fn(),
  estimateTransactionFees: jest.fn(),
  areNetworksEVMCompatible: jest.fn(),
  getBridgeInfo: jest.fn(),
}));

// Mock Firestore operations
const mockFirestoreDoc = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockFirestoreCollection = {
  doc: jest.fn(() => mockFirestoreDoc),
};

let router;
let ethers;
let crossChainService;

beforeAll(async () => {
  const module = await import('../../walletRoutes.js');
  router = module.default;
  
  ethers = await import('ethers');
  crossChainService = await import('../../../../../services/crossChainService.js');
});

const mockRequest = (body = {}, params = {}, query = {}, method = 'POST', url = '/', userId = 'testUserId') => ({
  body, 
  params, 
  query, 
  method, 
  url,
  userId,
  headers: { authorization: 'Bearer test-token' }
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn().mockReturnThis();
  res.send = jest.fn().mockReturnThis();
  return res;
};

let originalNodeEnv;

describe('Unit Tests for walletRoutes.js Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    originalNodeEnv = process.env.NODE_ENV;
    
    // Setup default Firestore mocks
    mockFirebaseAdminFirestore.collection.mockReturnValue(mockFirestoreCollection);
    
    // Configure default mock return values for successful scenarios
    mockFirebaseAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'testUserId',
      email: 'test@example.com'
    });
    
    mockFirebaseAdminAuth.getUser.mockResolvedValue({
      uid: 'testUserId',
      email: 'test@example.com'
    });

    // Default Firestore document mock
    mockFirestoreDoc.get.mockResolvedValue({
      exists: true,
      data: () => ({
        email: 'test@example.com',
        uid: 'testUserId',
        wallets: []
      })
    });

    mockFirestoreDoc.update.mockResolvedValue({});

    // Mock ethers address validation
    ethers.isAddress.mockReturnValue(true);

    // Mock cross-chain service functions
    crossChainService.estimateTransactionFees.mockResolvedValue({
      sourceNetworkFee: '0.001',
      targetNetworkFee: '0.001',
      bridgeFee: '0',
      totalEstimatedFee: '0.002'
    });

    crossChainService.areNetworksEVMCompatible.mockReturnValue(true);
    crossChainService.getBridgeInfo.mockReturnValue(null);
    crossChainService.prepareCrossChainTransaction.mockResolvedValue({
      id: 'tx_test_123',
      status: 'prepared'
    });
    crossChainService.executeCrossChainStep.mockResolvedValue({
      success: true,
      nextStep: 2
    });
    crossChainService.getCrossChainTransactionStatus.mockResolvedValue({
      id: 'tx_test_123',
      status: 'completed'
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Authentication Middleware', () => {
    it('should return 401 if no token provided', async () => {
      const req = mockRequest({}, {}, {}, 'GET', '/');
      delete req.headers.authorization;
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should authenticate successfully with valid token', async () => {
      const req = mockRequest({}, {}, {}, 'GET', '/');
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirebaseAdminAuth.verifyIdToken).toHaveBeenCalledWith('test-token', false);
    });

    it('should handle authentication errors', async () => {
      mockFirebaseAdminAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const req = mockRequest({}, {}, {}, 'GET', '/');
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });
  });

  describe('POST /register', () => {
    const routeUrl = '/register';
    const routeMethod = 'POST';

    it('should register a new wallet successfully', async () => {
      const walletData = {
        address: '0x742d35Cc6639C0532fEb88c5cd5Bb8b68C287CfA',
        name: 'Main Wallet',
        network: 'ethereum',
        isPrimary: true
      };

      const req = mockRequest(walletData, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirestoreDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          wallets: expect.arrayContaining([
            expect.objectContaining({
              address: walletData.address.toLowerCase(),
              name: walletData.name,
              network: walletData.network,
              isPrimary: true
            })
          ]),
          updatedAt: expect.any(Object)
        })
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Wallet registered successfully',
        wallet: expect.objectContaining({
          address: walletData.address.toLowerCase(),
          name: walletData.name,
          network: walletData.network
        })
      });
    });

    it('should return 400 if required fields are missing', async () => {
      const req = mockRequest({ address: '0x742d35Cc6639C0532fEb88c5cd5Bb8b68C287CfA' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Address, name, and network are required' });
    });

    it('should return 400 for invalid EVM address', async () => {
      ethers.isAddress.mockReturnValue(false);

      const walletData = {
        address: 'invalid_address',
        name: 'Test Wallet',
        network: 'ethereum'
      };

      const req = mockRequest(walletData, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid EVM wallet address' });
    });

    it('should validate Solana addresses correctly', async () => {
      const walletData = {
        address: 'invalid_solana_address',
        name: 'Solana Wallet',
        network: 'solana'
      };

      const req = mockRequest(walletData, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Solana wallet address' });
    });

    it('should validate Bitcoin addresses correctly', async () => {
      const walletData = {
        address: 'invalid_bitcoin_address',
        name: 'Bitcoin Wallet',
        network: 'bitcoin'
      };

      const req = mockRequest(walletData, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Bitcoin wallet address' });
    });

    it('should return 404 if user profile not found', async () => {
      mockFirestoreDoc.get.mockResolvedValue({ exists: false });

      const walletData = {
        address: '0x742d35Cc6639C0532fEb88c5cd5Bb8b68C287CfA',
        name: 'Test Wallet',
        network: 'ethereum'
      };

      const req = mockRequest(walletData, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User profile not found' });
    });

    it('should update existing wallet if already exists', async () => {
      const existingAddress = '0x742d35Cc6639C0532fEb88c5cd5Bb8b68C287CfA';
      
      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: [{
            address: existingAddress.toLowerCase(),
            name: 'Old Name',
            network: 'ethereum',
            isPrimary: false
          }]
        })
      });

      const walletData = {
        address: existingAddress,
        name: 'Updated Name',
        network: 'ethereum',
        isPrimary: true
      };

      const req = mockRequest(walletData, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Wallet registered successfully',
        wallet: expect.objectContaining({
          name: 'Updated Name',
          isPrimary: true
        })
      });
    });
  });

  describe('GET /', () => {
    const routeUrl = '/';
    const routeMethod = 'GET';

    it('should return user wallets successfully', async () => {
      const mockWallets = [
        {
          address: '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa',
          name: 'Main Wallet',
          network: 'ethereum',
          isPrimary: true,
          balance: '1.5'
        }
      ];

      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: mockWallets
        })
      });

      const req = mockRequest({}, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        wallets: expect.arrayContaining([
          expect.objectContaining({
            address: mockWallets[0].address,
            name: mockWallets[0].name,
            network: mockWallets[0].network,
            isPrimary: true,
            balance: '1.5'
          })
        ])
      });
    });

    it('should return empty array if user has no wallets', async () => {
      const req = mockRequest({}, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ wallets: [] });
    });
  });

  describe('DELETE /:address', () => {
    const routeMethod = 'DELETE';

    it('should remove wallet successfully', async () => {
      const addressToRemove = '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa';
      
      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: [
            {
              address: addressToRemove,
              name: 'Wallet to Remove',
              network: 'ethereum',
              isPrimary: false
            },
            {
              address: '0x123456789abcdef',
              name: 'Another Wallet',
              network: 'polygon',
              isPrimary: true
            }
          ]
        })
      });

      const req = mockRequest(
        { network: 'ethereum' },
        { address: addressToRemove },
        {},
        routeMethod,
        `/${addressToRemove}`
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirestoreDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          wallets: expect.arrayContaining([
            expect.objectContaining({
              address: '0x123456789abcdef'
            })
          ])
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Wallet removed successfully' });
    });

    it('should return 400 if address or network missing', async () => {
      const req = mockRequest({}, { address: '0x123' }, {}, routeMethod, '/0x123');
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Address and network are required' });
    });

    it('should set another wallet as primary if removing primary wallet', async () => {
      const primaryAddress = '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa';
      
      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: [
            {
              address: primaryAddress,
              name: 'Primary Wallet',
              network: 'ethereum',
              isPrimary: true
            },
            {
              address: '0x123456789abcdef',
              name: 'Secondary Wallet',
              network: 'polygon',
              isPrimary: false
            }
          ]
        })
      });

      const req = mockRequest(
        { network: 'ethereum' },
        { address: primaryAddress },
        {},
        routeMethod,
        `/${primaryAddress}`
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirestoreDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          wallets: expect.arrayContaining([
            expect.objectContaining({
              address: '0x123456789abcdef',
              isPrimary: true
            })
          ])
        })
      );
    });
  });

  describe('PUT /primary', () => {
    const routeUrl = '/primary';
    const routeMethod = 'PUT';

    it('should set primary wallet successfully', async () => {
      const walletAddress = '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa';
      
      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: [
            {
              address: walletAddress,
              name: 'Wallet 1',
              network: 'ethereum',
              isPrimary: false
            },
            {
              address: '0x123456789abcdef',
              name: 'Wallet 2',
              network: 'polygon',
              isPrimary: true
            }
          ]
        })
      });

      const req = mockRequest(
        { address: walletAddress, network: 'ethereum' },
        {},
        {},
        routeMethod,
        routeUrl
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirestoreDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          wallets: expect.arrayContaining([
            expect.objectContaining({
              address: walletAddress,
              isPrimary: true
            }),
            expect.objectContaining({
              address: '0x123456789abcdef',
              isPrimary: false
            })
          ])
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Primary wallet updated successfully' });
    });

    it('should return 404 if wallet not found', async () => {
      const req = mockRequest(
        { address: '0xnonexistent', network: 'ethereum' },
        {},
        {},
        routeMethod,
        routeUrl
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Wallet not found in user profile' });
    });
  });

  describe('PUT /balance', () => {
    const routeUrl = '/balance';
    const routeMethod = 'PUT';

    it('should update wallet balance successfully', async () => {
      const walletAddress = '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa';
      
      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: [
            {
              address: walletAddress,
              name: 'Main Wallet',
              network: 'ethereum',
              balance: '0'
            }
          ]
        })
      });

      const req = mockRequest(
        { address: walletAddress, network: 'ethereum', balance: '1.5' },
        {},
        {},
        routeMethod,
        routeUrl
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirestoreDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          wallets: expect.arrayContaining([
            expect.objectContaining({
              address: walletAddress,
              balance: '1.5',
              lastBalanceUpdate: expect.any(Object)
            })
          ])
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Wallet balance updated successfully' });
    });

    it('should return 400 if required fields missing', async () => {
      const req = mockRequest(
        { address: '0x123', network: 'ethereum' },
        {},
        {},
        routeMethod,
        routeUrl
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Address, network, and balance are required' });
    });
  });

  describe('GET /preferences', () => {
    const routeUrl = '/preferences';
    const routeMethod = 'GET';

    it('should return wallet preferences successfully', async () => {
      const mockWallets = [
        {
          address: '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa',
          name: 'Primary Wallet',
          network: 'ethereum',
          isPrimary: true
        },
        {
          address: '0x123456789abcdef',
          name: 'Secondary Wallet',
          network: 'polygon',
          isPrimary: false
        }
      ];

      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: mockWallets
        })
      });

      const req = mockRequest({}, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        preferences: {
          primaryWallet: {
            address: '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa',
            network: 'ethereum'
          },
          preferredNetworks: ['ethereum', 'polygon']
        }
      });
    });

    it('should return null primary wallet if none set', async () => {
      mockFirestoreDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          email: 'test@example.com',
          uid: 'testUserId',
          wallets: [{
            address: '0x123456789abcdef',
            name: 'Wallet',
            network: 'ethereum',
            isPrimary: false
          }]
        })
      });

      const req = mockRequest({}, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        preferences: {
          primaryWallet: null,
          preferredNetworks: ['ethereum']
        }
      });
    });
  });

  describe('POST /detection', () => {
    const routeUrl = '/detection';
    const routeMethod = 'POST';

    it('should process wallet detection data successfully', async () => {
      const detectionData = {
        detectedWallets: {
          evmWallets: ['0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa'],
          solanaWallets: ['4fYNw3dojWmQ4dXtSGE9epjRGy3xGFNP7JQvGXqsMAEs'],
          bitcoinWallets: ['bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh']
        }
      };

      const req = mockRequest(detectionData, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockFirestoreDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastWalletDetection: expect.objectContaining({
            timestamp: expect.any(Object),
            evmWallets: 1,
            solanaWallets: 1,
            bitcoinWallets: 1,
            totalDetected: 3
          }),
          updatedAt: expect.any(Object)
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Wallet detection data received successfully' 
      });
    });

    it('should return 400 if detection data missing', async () => {
      const req = mockRequest({}, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Detected wallets data is required' });
    });
  });

  // Cross-chain route tests
  describe('POST /cross-chain/estimate-fees', () => {
    const routeUrl = '/cross-chain/estimate-fees';
    const routeMethod = 'POST';

    it('should estimate cross-chain fees successfully', async () => {
      const feeRequest = {
        sourceNetwork: 'ethereum',
        targetNetwork: 'polygon',
        amount: '1.0'
      };

      const req = mockRequest(feeRequest, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(crossChainService.estimateTransactionFees).toHaveBeenCalledWith(
        'ethereum',
        'polygon',
        '1.0'
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          feeEstimate: expect.any(Object),
          isEVMCompatible: true,
          bridgeInfo: null,
          requiresBridge: false
        })
      });
    });

    it('should return 400 if required parameters missing', async () => {
      const req = mockRequest({ sourceNetwork: 'ethereum' }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Source network, target network, and amount are required'
      });
    });
  });

  describe('POST /cross-chain/prepare', () => {
    const routeUrl = '/cross-chain/prepare';
    const routeMethod = 'POST';

    it('should prepare cross-chain transaction successfully', async () => {
      const transactionData = {
        fromAddress: '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa',
        toAddress: '0x123456789abcdef',
        amount: '1.0',
        sourceNetwork: 'ethereum',
        targetNetwork: 'polygon',
        dealId: 'deal_123'
      };

      const req = mockRequest(transactionData, {}, {}, routeMethod, routeUrl);
      req.user = { uid: 'testUserId' };
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(crossChainService.prepareCrossChainTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          ...transactionData,
          userId: 'testUserId'
        })
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'tx_test_123',
          status: 'prepared'
        })
      });
    });

    it('should return 400 if required parameters missing', async () => {
      const req = mockRequest({
        fromAddress: '0x742d35cc6639c0532feb88c5cd5bb8b68c287cfa'
      }, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'All transaction parameters are required'
      });
    });
  });

  describe('POST /cross-chain/:transactionId/execute-step', () => {
    const routeMethod = 'POST';

    it('should execute cross-chain step successfully', async () => {
      const req = mockRequest(
        { stepNumber: 1, txHash: '0xabcdef123456' },
        { transactionId: 'tx_test_123' },
        {},
        routeMethod,
        '/cross-chain/tx_test_123/execute-step'
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(crossChainService.executeCrossChainStep).toHaveBeenCalledWith(
        'tx_test_123',
        1,
        '0xabcdef123456'
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          success: true,
          nextStep: 2
        })
      });
    });

    it('should return 400 if step number missing', async () => {
      const req = mockRequest(
        { txHash: '0xabcdef123456' },
        { transactionId: 'tx_test_123' },
        {},
        routeMethod,
        '/cross-chain/tx_test_123/execute-step'
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Step number is required'
      });
    });
  });

  describe('GET /cross-chain/:transactionId/status', () => {
    const routeMethod = 'GET';

    it('should get cross-chain transaction status successfully', async () => {
      const req = mockRequest(
        {},
        { transactionId: 'tx_test_123' },
        {},
        routeMethod,
        '/cross-chain/tx_test_123/status'
      );
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(crossChainService.getCrossChainTransactionStatus).toHaveBeenCalledWith('tx_test_123');

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'tx_test_123',
          status: 'completed'
        })
      });
    });
  });

  describe('GET /cross-chain/networks', () => {
    const routeUrl = '/cross-chain/networks';
    const routeMethod = 'GET';

    it('should return supported networks successfully', async () => {
      const req = mockRequest({}, {}, {}, routeMethod, routeUrl);
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          networks: expect.objectContaining({
            ethereum: expect.objectContaining({
              name: 'Ethereum',
              symbol: 'ETH',
              isEVM: true
            }),
            polygon: expect.objectContaining({
              name: 'Polygon',
              symbol: 'MATIC',
              isEVM: true
            }),
            solana: expect.objectContaining({
              name: 'Solana',
              symbol: 'SOL',
              isEVM: false
            })
          })
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors gracefully', async () => {
      mockFirestoreDoc.get.mockRejectedValue(new Error('Database error'));

      const req = mockRequest({}, {}, {}, 'GET', '/');
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Internal server error while fetching wallets' 
      });
    });

    it('should handle cross-chain service errors', async () => {
      crossChainService.estimateTransactionFees.mockRejectedValue(new Error('Service error'));

      const req = mockRequest({
        sourceNetwork: 'ethereum',
        targetNetwork: 'polygon',
        amount: '1.0'
      }, {}, {}, 'POST', '/cross-chain/estimate-fees');
      const res = mockResponse();
      const next = jest.fn();

      await router(req, res, next);
      await new Promise(resolve => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to estimate fees',
        error: 'Service error'
      });
    });
  });
}); 
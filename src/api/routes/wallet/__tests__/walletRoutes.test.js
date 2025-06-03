import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import walletRouter from '../walletRoutes.js';

// Mock Firebase Admin
const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
      set: jest.fn()
    }))
  }))
};

const mockAuth = {
  verifyIdToken: jest.fn()
};

const mockFieldValue = {
  serverTimestamp: jest.fn(() => 'mock-timestamp')
};

jest.unstable_mockModule('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockFirestore),
  FieldValue: mockFieldValue
}));

jest.unstable_mockModule('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockAuth)
}));

jest.unstable_mockModule('../../auth/admin.js', () => ({
  getAdminApp: jest.fn(() => Promise.resolve({}))
}));

jest.unstable_mockModule('ethers', () => ({
  isAddress: jest.fn()
}));

// Import after mocking
const { isAddress } = await import('ethers');

describe('Wallet Routes', () => {
  let app;
  const mockUserId = 'test-user-123';
  const validToken = 'valid-token';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/wallets', walletRouter);

    // Reset mocks
    jest.clearAllMocks();

    // Default auth mock
    mockAuth.verifyIdToken.mockResolvedValue({ uid: mockUserId });
    isAddress.mockReturnValue(true);
  });

  describe('POST /api/wallets/register', () => {
    const validWalletData = {
      address: '0x1234567890123456789012345678901234567890',
      name: 'MetaMask',
      network: 'ethereum',
      isPrimary: true
    };

    it('should register a new EVM wallet successfully', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: [] })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);
      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validWalletData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Wallet registered successfully');
      expect(response.body.wallet.address).toBe(validWalletData.address.toLowerCase());
      expect(response.body.wallet.network).toBe(validWalletData.network);
    });

    it('should register a Solana wallet successfully', async () => {
      const solanaWallet = {
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        name: 'Phantom',
        network: 'solana',
        publicKey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
      };

      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: [] })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);
      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(solanaWallet);

      expect(response.status).toBe(201);
      expect(response.body.wallet.publicKey).toBe(solanaWallet.publicKey);
    });

    it('should register a Bitcoin wallet successfully', async () => {
      const bitcoinWallet = {
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        name: 'Unisat',
        network: 'bitcoin'
      };

      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: [] })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);
      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(bitcoinWallet);

      expect(response.status).toBe(201);
      expect(response.body.wallet.network).toBe('bitcoin');
    });

    it('should update existing wallet if already registered', async () => {
      const existingWallet = {
        address: validWalletData.address.toLowerCase(),
        name: 'Old Name',
        network: 'ethereum',
        isPrimary: false
      };

      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: [existingWallet] })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);
      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validWalletData);

      expect(response.status).toBe(201);
      expect(mockFirestore.collection().doc().update).toHaveBeenCalled();
    });

    it('should reject invalid EVM address', async () => {
      isAddress.mockReturnValue(false);

      const invalidWallet = {
        ...validWalletData,
        address: 'invalid-address'
      };

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidWallet);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid EVM wallet address');
    });

    it('should reject invalid Solana address', async () => {
      const invalidSolanaWallet = {
        address: 'invalid-solana-address',
        name: 'Phantom',
        network: 'solana'
      };

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidSolanaWallet);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid Solana wallet address');
    });

    it('should reject invalid Bitcoin address', async () => {
      const invalidBitcoinWallet = {
        address: 'invalid-bitcoin-address',
        name: 'Unisat',
        network: 'bitcoin'
      };

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidBitcoinWallet);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid Bitcoin wallet address');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/wallets/register')
        .send(validWalletData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    it('should require all required fields', async () => {
      const incompleteWallet = {
        address: validWalletData.address
        // Missing name and network
      };

      const response = await request(app)
        .post('/api/wallets/register')
        .set('Authorization', `Bearer ${validToken}`)
        .send(incompleteWallet);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Address, name, and network are required');
    });
  });

  describe('GET /api/wallets', () => {
    it('should retrieve user wallets successfully', async () => {
      const mockWallets = [
        {
          address: '0x1234567890123456789012345678901234567890',
          name: 'MetaMask',
          network: 'ethereum',
          isPrimary: true,
          balance: '1.2345'
        },
        {
          address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
          name: 'Phantom',
          network: 'solana',
          isPrimary: false,
          publicKey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
        }
      ];

      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: mockWallets })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);

      const response = await request(app)
        .get('/api/wallets')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.wallets).toHaveLength(2);
      expect(response.body.wallets[0].network).toBe('ethereum');
      expect(response.body.wallets[1].network).toBe('solana');
      expect(response.body.wallets[1].publicKey).toBe(mockWallets[1].publicKey);
    });

    it('should return empty array for user with no wallets', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: [] })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);

      const response = await request(app)
        .get('/api/wallets')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.wallets).toHaveLength(0);
    });

    it('should handle user not found', async () => {
      const mockUserDoc = {
        exists: false
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);

      const response = await request(app)
        .get('/api/wallets')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User profile not found');
    });
  });

  describe('DELETE /api/wallets/:address', () => {
    const walletAddress = '0x1234567890123456789012345678901234567890';

    it('should remove wallet successfully', async () => {
      const mockWallets = [
        {
          address: walletAddress.toLowerCase(),
          name: 'MetaMask',
          network: 'ethereum',
          isPrimary: false
        },
        {
          address: '0x9876543210987654321098765432109876543210',
          name: 'Coinbase',
          network: 'ethereum',
          isPrimary: true
        }
      ];

      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: mockWallets })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);
      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .delete(`/api/wallets/${walletAddress}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ network: 'ethereum' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Wallet removed successfully');
    });

    it('should promote another wallet to primary when removing primary wallet', async () => {
      const mockWallets = [
        {
          address: walletAddress.toLowerCase(),
          name: 'MetaMask',
          network: 'ethereum',
          isPrimary: true // This one will be removed
        },
        {
          address: '0x9876543210987654321098765432109876543210',
          name: 'Coinbase',
          network: 'ethereum',
          isPrimary: false
        }
      ];

      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: mockWallets })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);
      
      let updatedWallets;
      mockFirestore.collection().doc().update.mockImplementation((data) => {
        updatedWallets = data.wallets;
        return Promise.resolve();
      });

      const response = await request(app)
        .delete(`/api/wallets/${walletAddress}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ network: 'ethereum' });

      expect(response.status).toBe(200);
      expect(updatedWallets).toHaveLength(1);
      expect(updatedWallets[0].isPrimary).toBe(true);
    });

    it('should require network parameter', async () => {
      const response = await request(app)
        .delete(`/api/wallets/${walletAddress}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Address and network are required');
    });
  });

  describe('PUT /api/wallets/primary', () => {
    it('should set primary wallet successfully', async () => {
      const walletAddress = '0x1234567890123456789012345678901234567890';
      const mockWallets = [
        {
          address: walletAddress.toLowerCase(),
          name: 'MetaMask',
          network: 'ethereum',
          isPrimary: false
        },
        {
          address: '0x9876543210987654321098765432109876543210',
          name: 'Coinbase',
          network: 'ethereum',
          isPrimary: true
        }
      ];

      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: mockWallets })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);
      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .put('/api/wallets/primary')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ address: walletAddress, network: 'ethereum' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Primary wallet updated successfully');
    });

    it('should handle wallet not found', async () => {
      const mockUserDoc = {
        exists: true,
        data: () => ({ wallets: [] })
      };
      
      mockFirestore.collection().doc().get.mockResolvedValue(mockUserDoc);

      const response = await request(app)
        .put('/api/wallets/primary')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ 
          address: '0x1234567890123456789012345678901234567890', 
          network: 'ethereum' 
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Wallet not found in user profile');
    });
  });

  describe('POST /api/wallets/detection', () => {
    it('should receive and store wallet detection data successfully', async () => {
      const detectionData = {
        detectedWallets: {
          evmWallets: [
            { name: 'MetaMask', rdns: 'io.metamask' },
            { name: 'Coinbase Wallet', rdns: 'com.coinbase.wallet' }
          ],
          solanaWallets: [
            { adapter: { name: 'Phantom' } }
          ],
          bitcoinWallets: [
            { name: 'Unisat' }
          ]
        }
      };

      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .post('/api/wallets/detection')
        .set('Authorization', `Bearer ${validToken}`)
        .send(detectionData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Wallet detection data received successfully');
      
      expect(mockFirestore.collection().doc().update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastWalletDetection: expect.objectContaining({
            evmWallets: 2,
            solanaWallets: 1,
            bitcoinWallets: 1,
            totalDetected: 4
          })
        })
      );
    });

    it('should handle empty detection data', async () => {
      const detectionData = {
        detectedWallets: {
          evmWallets: [],
          solanaWallets: [],
          bitcoinWallets: []
        }
      };

      mockFirestore.collection().doc().update.mockResolvedValue();

      const response = await request(app)
        .post('/api/wallets/detection')
        .set('Authorization', `Bearer ${validToken}`)
        .send(detectionData);

      expect(response.status).toBe(200);
      expect(mockFirestore.collection().doc().update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastWalletDetection: expect.objectContaining({
            totalDetected: 0
          })
        })
      );
    });

    it('should require detection data', async () => {
      const response = await request(app)
        .post('/api/wallets/detection')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Detected wallets data is required');
    });
  });

  describe('Authentication middleware', () => {
    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/wallets');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    it('should reject requests with invalid token', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .get('/api/wallets')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid or expired token');
    });
  });
}); 
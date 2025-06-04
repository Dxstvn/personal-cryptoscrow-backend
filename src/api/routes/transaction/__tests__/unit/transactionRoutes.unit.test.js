import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// console.log('[TEST FILE SCOPE V5] Top of test file.');

let effectiveMockGetAdminAuth;
const effectiveMockVerifyIdToken = jest.fn();
// console.log('[TEST FILE SCOPE V5] effectiveMockVerifyIdToken created.');

const mockTimestampNowFn = jest.fn();
const mockTimestampFromDateFn = jest.fn();

jest.unstable_mockModule('firebase-admin/auth', () => {
  // console.log('[MOCK FACTORY V5] jest.unstable_mockModule for "firebase-admin/auth" - FACTORY EXECUTED.');
  const mockGetAdminAuthInFactory = jest.fn();
  effectiveMockGetAdminAuth = mockGetAdminAuthInFactory;
  // console.log('[MOCK FACTORY V5] effectiveMockGetAdminAuth INSTANCE ASSIGNED via factory.');
  return {
    getAuth: (...args) => {
      // console.log('[MOCK FACTORY getAuth PROXY V5] "getAuth" from factory proxy CALLED.');
      const authInstance = mockGetAdminAuthInFactory(...args);
      // console.log('[MOCK FACTORY getAuth PROXY V5] mockGetAdminAuthInFactory returned:', typeof authInstance);
      return authInstance;
    },
  };
});
// console.log('[TEST FILE SCOPE V5] jest.unstable_mockModule for "firebase-admin/auth" REGISTERED.');

const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockWhere = jest.fn();
const mockRunTransaction = jest.fn();
const mockOrderBy = jest.fn(); // Specific mock for orderBy
const mockLimit = jest.fn();   // Specific mock for limit
const mockTransactionGet = jest.fn(); // For use within runTransaction

// Updated FieldValue mocks
const mockArrayUnion = jest.fn((...args) => ({ _fieldName: 'FieldValue.arrayUnion', _elements: args }));
const mockArrayRemove = jest.fn((...args) => ({ _fieldName: 'FieldValue.arrayRemove', _elements: args }));
const mockDeleteFieldValue = jest.fn().mockReturnValue('---mocked delete output---');

jest.unstable_mockModule('firebase-admin/firestore', () => {
  // console.log('[MOCK FACTORY V5] jest.unstable_mockModule for "firebase-admin/firestore" - FACTORY EXECUTED.');
  return {
    getFirestore: jest.fn().mockReturnValue({
      collection: mockCollection,
      doc: mockDoc,
      runTransaction: mockRunTransaction,
    }),
    Timestamp: {
      now: mockTimestampNowFn,
      fromDate: mockTimestampFromDateFn,
    },
    FieldValue: {
      serverTimestamp: () => mockTimestampNowFn(),
      arrayUnion: mockArrayUnion, // Use updated mock
      arrayRemove: mockArrayRemove, // Use updated mock
      delete: mockDeleteFieldValue,
    },
  };
});
// console.log('[TEST FILE SCOPE V5] jest.unstable_mockModule for "firebase-admin/firestore" REGISTERED.');

const mockAdminApp = { name: 'mockAdminApp' };
jest.unstable_mockModule('../../../auth/admin.js', () => {
  // console.log('[MOCK FACTORY V5] jest.unstable_mockModule for "../../../auth/admin.js" - FACTORY EXECUTED.');
  return { 
    adminApp: mockAdminApp,
    getAdminApp: jest.fn().mockResolvedValue(mockAdminApp),
  };
});
// console.log('[TEST FILE SCOPE V5] jest.unstable_mockModule for "../../../auth/admin.js" REGISTERED.');

const mockIsAddress = jest.fn();
const mockGetAddress = jest.fn(addr => addr);
const mockParseUnits = jest.fn();
const mockWallet = jest.fn().mockImplementation((privateKey) => ({
  address: '0x' + 'a'.repeat(40), // Mock wallet address
  privateKey: privateKey
}));

jest.unstable_mockModule('ethers', () => {
  // console.log('[MOCK FACTORY V5] jest.unstable_mockModule for "ethers" - FACTORY EXECUTED.');
  return {
    isAddress: mockIsAddress,
    getAddress: mockGetAddress,
    parseUnits: mockParseUnits,
    Wallet: mockWallet,
  };
});
// console.log('[TEST FILE SCOPE V5] jest.unstable_mockModule for "ethers" REGISTERED.');

const mockDeployPropertyEscrowContract = jest.fn();
jest.unstable_mockModule('../../../../../services/contractDeployer.js', () => {
  // console.log('[MOCK FACTORY V5] jest.unstable_mockModule for contractDeployer REGISTERED.');
  return {
    deployPropertyEscrowContract: mockDeployPropertyEscrowContract,
  };
});
// console.log('[TEST FILE SCOPE V5] jest.unstable_mockModule for contractDeployer REGISTERED.');

// Mock cross-chain services
const mockAreNetworksEVMCompatible = jest.fn();
const mockGetBridgeInfo = jest.fn();
const mockEstimateTransactionFees = jest.fn();
const mockPrepareCrossChainTransaction = jest.fn();
const mockExecuteCrossChainStep = jest.fn();
const mockGetCrossChainTransactionStatus = jest.fn();

jest.unstable_mockModule('../../../../../services/crossChainService.js', () => {
  return {
    areNetworksEVMCompatible: mockAreNetworksEVMCompatible,
    getBridgeInfo: mockGetBridgeInfo,
    estimateTransactionFees: mockEstimateTransactionFees,
    prepareCrossChainTransaction: mockPrepareCrossChainTransaction,
    executeCrossChainStep: mockExecuteCrossChainStep,
    getCrossChainTransactionStatus: mockGetCrossChainTransactionStatus,
  };
});

let testAgent;
let transactionRoutes;
const mockDecodedToken = { uid: 'testUserId', email: 'user@example.com' };
const otherUserDecodedToken = { uid: 'otherUserId', email: 'otherparty@example.com' };

const transactionId = 'tx123';
const conditionId = 'cond123';

const fixedDate = new Date('2025-05-20T01:00:00.000Z');
// This is the object structure Timestamp.now() and Timestamp.fromDate() should return
const createFirestoreTimestamp = (date) => ({
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1000000,
    toDate: () => date, // Actual function
});

const expectedFixedTimestampObject = createFirestoreTimestamp(fixedDate);

// Helper for matching Firestore Timestamp objects in expectations
const matchTimestampObject = (timestampInstance) => expect.objectContaining({
    seconds: timestampInstance.seconds,
    nanoseconds: timestampInstance.nanoseconds,
    toDate: expect.any(Function)
});

const matchSpecificTimestampObject = (date) => expect.objectContaining({
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1000000,
    toDate: expect.any(Function)
});

describe('Unit Tests for transactionRoutes.js', () => {
  beforeEach(async () => {
    // console.log('[TEST beforeEach V5] Clearing all mocks, resetting modules.');
    jest.clearAllMocks();
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(fixedDate);

    mockTimestampNowFn.mockReturnValue(expectedFixedTimestampObject);
    mockTimestampFromDateFn.mockImplementation((dateInput) => {
        const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
        return createFirestoreTimestamp(date);
    });

    const routerModule = await import('../../transactionRoutes.js');
    transactionRoutes = routerModule.default;
    // console.log('[TEST beforeEach V5] Router dynamically imported.');

    const app = express();
    app.use(express.json());
    app.use('/', transactionRoutes);
    testAgent = request(app);
    // console.log('[TEST beforeEach V5] Express app and supertest agent configured.');

    effectiveMockGetAdminAuth.mockReturnValue({
      verifyIdToken: effectiveMockVerifyIdToken,
      getUserByEmail: jest.fn().mockImplementation(email => {
        if (email === mockDecodedToken.email) return Promise.resolve({ uid: mockDecodedToken.uid, email: mockDecodedToken.email });
        if (email === otherUserDecodedToken.email) return Promise.resolve({ uid: otherUserDecodedToken.uid, email: otherUserDecodedToken.email });
        if (email === 'nonexistent@example.com') {
            const error = new Error('User not found');
            error.code = 'auth/user-not-found'; // Firestore often uses this code
            return Promise.reject(error);
        }
        return Promise.resolve({ uid: `uid-for-${email}` });
      }),
    });

    effectiveMockVerifyIdToken.mockImplementation(async (token) => {
      if (token === 'validtoken') return mockDecodedToken;
      if (token === 'othervalidtoken') return otherUserDecodedToken;
      const error = new Error("Invalid token");
      error.code = "auth/invalid-id-token";
      throw error;
    });

    // Firestore mocks
    const mockQueryChain = {
        orderBy: mockOrderBy.mockReturnThis(), // Return 'this' (the mockQueryChain object)
        limit: mockLimit.mockReturnThis(),     // Return 'this'
        get: mockGet,                          // Final method in the chain (general mockGet)
    };

    const specificUserQueryGet = jest.fn(); // Specific mock for users collection queries
    const mockUserDocGet = jest.fn(); // Specific mock for individual user document gets

    mockCollection.mockImplementation(collectionName => {
      if (collectionName === 'users') {
        return {
          where: mockWhere.mockImplementation((field, op, emailValue) => {
            if (emailValue === otherUserDecodedToken.email) { // 'otherparty@example.com'
              specificUserQueryGet.mockResolvedValueOnce({
                empty: false,
                docs: [{ id: otherUserDecodedToken.uid, data: () => ({ email: otherUserDecodedToken.email, uid: otherUserDecodedToken.uid }) }],
              });
            } else if (emailValue === 'nonexistent@example.com') {
              specificUserQueryGet.mockResolvedValueOnce({
                empty: true,
                docs: [],
              });
            } else if (emailValue === mockDecodedToken.email) { // For the "cannot create with self" test
                specificUserQueryGet.mockResolvedValueOnce({
                    empty: false, // User exists
                    docs: [{ id: mockDecodedToken.uid, data: () => ({ email: mockDecodedToken.email, uid: mockDecodedToken.uid }) }]
                });
            } else {
              // Default for any other email query on users collection (e.g. if a test adds a new one)
              specificUserQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });
            }
            return { // The object returned by where()
              limit: mockLimit.mockReturnThis(), // limit() returns an object that has get()
              get: specificUserQueryGet, // This get is specificUserQueryGet
            };
          }),
          // Mock for individual user document get
          doc: jest.fn().mockImplementation(docId => ({
            get: mockUserDocGet.mockImplementation(() => {
              // Default mock for getting user profile - should return the current user's profile
              if (docId === mockDecodedToken.uid) {
                return Promise.resolve({
                  exists: true,
                  data: () => ({ email: mockDecodedToken.email, uid: mockDecodedToken.uid })
                });
              }
              return Promise.resolve({ exists: false, data: () => undefined });
            })
          }))
        };
      }
      // Default for 'deals' collection (and any other not specified)
      return {
        add: mockAdd,
        doc: mockDoc.mockImplementation(docId => ({ // mockDoc for individual deal documents
            get: mockGet, // General mockGet, to be configured per test for specific deal data
            set: mockSet,
            update: mockUpdate,
        })),
        where: mockWhere.mockReturnValue(mockQueryChain), // Uses general mockGet
        orderBy: mockOrderBy.mockReturnValue(mockQueryChain), // Uses general mockGet
        limit: mockLimit.mockReturnValue(mockQueryChain),   // Uses general mockGet
        get: mockGet, // For direct collection('deals').get(), uses general mockGet
      };
    });

    // Reset the general mockGet to its default for each test.
    // Specific tests for GETting deals will override this with mockResolvedValueOnce.
    mockGet.mockReset();
    mockGet.mockResolvedValue({ exists: false, data: () => undefined }); // Default: deal not found
    mockTransactionGet.mockReset(); // Reset transactional get mock
    mockTransactionGet.mockResolvedValue({ exists: false, data: () => undefined }); // Default for transactional get

    // Fix mockAdd to return a proper DocumentReference mock with update method
    mockAdd.mockReset();
    mockAdd.mockImplementation(() => {
      const mockDocId = mockAdd.mockImplementation.mockDocumentId || 'mockDocumentId';
      return Promise.resolve({
        id: mockDocId,
        update: mockUpdate
      });
    });

    mockDoc.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate });
    // mockGet.mockResolvedValue({ exists: false, data: () => undefined }); // This default is now set above and reset each time
    mockSet.mockResolvedValue({ writeTime: 'mockWriteTime' });
    mockUpdate.mockResolvedValue({ writeTime: 'mockWriteTime' });
    mockRunTransaction.mockImplementation(async (updateFunction) => {
        // Use the new mockTransactionGet for t.get()
        const mockTransaction = { get: mockTransactionGet, update: mockUpdate, set: mockSet };
        await updateFunction(mockTransaction);
        return { success: true }; // Or some other relevant success indicator
    });


    // Ethers mocks
    mockIsAddress.mockImplementation(addr => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr));
    mockGetAddress.mockImplementation(addr => {
        if (mockIsAddress(addr)) return addr; // Return as is if valid, ethers.getAddress would checksum
        throw new Error('invalid address in mockGetAddress');
    });
    mockParseUnits.mockImplementation((value, unit) => {
        let decimals = 18; // Default for 'ether'
        if (typeof unit === 'number') {
            decimals = unit;
        } else if (unit === 'gwei') {
            decimals = 9;
        } // Add other units if needed
        if (isNaN(Number(value))) { // Prevent BigInt from failing on non-numeric strings
            throw new SyntaxError(`Cannot convert ${value} to a BigInt`);
        }
        return BigInt(String(value)) * (BigInt(10) ** BigInt(decimals));
    });
    mockWallet.mockImplementation((privateKey) => ({
        address: '0x' + 'a'.repeat(40), // Mock wallet address
        privateKey: privateKey
    }));

    // Cross-chain service mocks
    mockAreNetworksEVMCompatible.mockImplementation((network1, network2) => {
        // Mock EVM compatibility - ethereum, polygon, bsc are compatible
        const evmNetworks = ['ethereum', 'polygon', 'bsc'];
        return evmNetworks.includes(network1) && evmNetworks.includes(network2);
    });
    
    mockGetBridgeInfo.mockImplementation((sourceNetwork, targetNetwork) => {
        if (sourceNetwork === 'ethereum' && targetNetwork === 'polygon') {
            return { bridge: 'PoS Bridge', fee: '0.001', estimatedTime: '7-8 minutes' };
        }
        if (sourceNetwork === 'bitcoin' && targetNetwork === 'ethereum') {
            return { bridge: 'Wrapped Bitcoin', fee: '0.0005', estimatedTime: '30 minutes' };
        }
        return null; // No bridge needed for same network or unsupported pairs
    });
    
    mockEstimateTransactionFees.mockResolvedValue({
        gasPrice: '20000000000', // 20 gwei
        gasLimit: '21000',
        estimatedFee: '0.00042', // ETH
        bridgeFee: '0.001' // If bridge is needed
    });
    
    mockPrepareCrossChainTransaction.mockResolvedValue({
        id: 'cross-chain-tx-123',
        needsBridge: true,
        steps: [
            { step: 1, description: 'Lock funds on source network' },
            { step: 2, description: 'Bridge transfer' },
            { step: 3, description: 'Release funds on target network' }
        ]
    });
    
    mockExecuteCrossChainStep.mockResolvedValue({
        status: 'completed',
        txHash: '0x' + '1'.repeat(64)
    });
    
    mockGetCrossChainTransactionStatus.mockResolvedValue({
        id: 'cross-chain-tx-123',
        status: 'pending',
        currentStep: 1,
        needsBridge: true
    });

    mockDeployPropertyEscrowContract.mockResolvedValue('0xDeployedContractAddress');
    process.env.DEPLOYER_PRIVATE_KEY = 'test_deployer_key';
    process.env.RPC_URL = 'test_rpc_url';
    // console.log('[TEST beforeEach V5] All other mocks configured.');
  });

  afterEach(() => {
    jest.useRealTimers();
    // console.log('[TEST afterEach V5] Real timers restored.');
  });

  describe('authenticateToken Middleware', () => {
    it('should return 401 if no token provided', async () => {
      const response = await testAgent.post('/create');
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication token is required.');
    });

    it('should return 403 if token is invalid', async () => {
      const response = await testAgent.post('/create').set('Authorization', 'Bearer invalid');
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid or expired token');
    });
  });

  describe('POST /create', () => {
    // Use valid hex addresses
    const baseCreatePayload = {
      initiatedBy: 'BUYER',
      propertyAddress: '123 Test Lane',
      amount: 100,
      otherPartyEmail: 'otherparty@example.com',
      buyerWalletAddress: '0x1234567890123456789012345678901234567890',
      sellerWalletAddress: '0x0987654321098765432109876543210987654321',
      initialConditions: [{ id: 'c1', description: 'Condition 1', type: 'CUSTOM' }],
    };

    beforeEach(() => {
      // Reset user document get mock for each test in this describe block
      const mockUserDocGet = jest.fn();
      mockUserDocGet.mockImplementation(() => {
        return Promise.resolve({
          exists: true,
          data: () => ({ email: mockDecodedToken.email, uid: mockDecodedToken.uid })
        });
      });
      
      // Update the collection mock to ensure users collection doc calls use the reset mock
      mockCollection.mockImplementation(collectionName => {
        if (collectionName === 'users') {
          return {
            where: mockWhere.mockImplementation((field, op, emailValue) => {
              const specificUserQueryGet = jest.fn();
              if (emailValue === otherUserDecodedToken.email) {
                specificUserQueryGet.mockResolvedValueOnce({
                  empty: false,
                  docs: [{ id: otherUserDecodedToken.uid, data: () => ({ email: otherUserDecodedToken.email, uid: otherUserDecodedToken.uid }) }],
                });
              } else if (emailValue === 'nonexistent@example.com') {
                specificUserQueryGet.mockResolvedValueOnce({
                  empty: true,
                  docs: [],
                });
              } else if (emailValue === mockDecodedToken.email) {
                  specificUserQueryGet.mockResolvedValueOnce({
                      empty: false,
                      docs: [{ id: mockDecodedToken.uid, data: () => ({ email: mockDecodedToken.email, uid: mockDecodedToken.uid }) }]
                  });
              } else {
                specificUserQueryGet.mockResolvedValueOnce({ empty: true, docs: [] });
              }
              return {
                limit: mockLimit.mockReturnThis(),
                get: specificUserQueryGet,
              };
            }),
            doc: jest.fn().mockImplementation(docId => ({
              get: mockUserDocGet
            }))
          };
        }
        // Default for 'deals' collection
        return {
          add: mockAdd,
          doc: mockDoc.mockImplementation(docId => ({
              get: mockGet,
              set: mockSet,
              update: mockUpdate,
          })),
          where: mockWhere.mockReturnValue({
              orderBy: mockOrderBy.mockReturnThis(),
              limit: mockLimit.mockReturnThis(),
              get: mockGet,
          }),
          orderBy: mockOrderBy.mockReturnValue({
              orderBy: mockOrderBy.mockReturnThis(),
              limit: mockLimit.mockReturnThis(),
              get: mockGet,
          }),
          limit: mockLimit.mockReturnValue({
              get: mockGet,
          }),
          get: mockGet,
        };
      });
    });

    // Cross-chain test payloads
    const crossChainEthereumToPolygonPayload = {
      ...baseCreatePayload,
      buyerWalletAddress: '0x1234567890123456789012345678901234567890', // Ethereum
      sellerWalletAddress: '0x0987654321098765432109876543210987654321', // Polygon (treated as different network)
    };

    const crossChainBitcoinToEthereumPayload = {
      ...baseCreatePayload,
      buyerWalletAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', // Bitcoin
      sellerWalletAddress: '0x0987654321098765432109876543210987654321', // Ethereum
    };

    const crossChainSolanaToEthereumPayload = {
      ...baseCreatePayload,
      buyerWalletAddress: 'So11111111111111111111111111111111111111112', // Solana
      sellerWalletAddress: '0x0987654321098765432109876543210987654321', // Ethereum
    };

    it('should create a transaction successfully (BUYER initiated)', async () => {
      mockAdd.mockImplementation.mockDocumentId = 'newTxIdBuyer';
      const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(baseCreatePayload);
      expect(response.status).toBe(201);
      expect(response.body.transactionId).toBe('newTxIdBuyer');
    });

    it('should create a cross-chain transaction (Ethereum to Polygon)', async () => {
      mockAdd.mockImplementation.mockDocumentId = 'newCrossChainTxId';
      mockPrepareCrossChainTransaction.mockResolvedValueOnce({
        id: 'cross-chain-tx-123',
        needsBridge: true,
        steps: [
          { step: 1, description: 'Lock funds on source network' },
          { step: 2, description: 'Bridge transfer' },
          { step: 3, description: 'Release funds on target network' }
        ]
      });

      const response = await testAgent.post('/create')
        .set('Authorization', 'Bearer validtoken')
        .send(crossChainEthereumToPolygonPayload);

      expect(response.status).toBe(201);
      expect(response.body.transactionId).toBe('newCrossChainTxId');
      expect(response.body.isCrossChain).toBe(false); // EVM networks are compatible, so not cross-chain
      expect(mockPrepareCrossChainTransaction).not.toHaveBeenCalled(); // Should not be called for EVM-compatible networks
    });

    it('should create a cross-chain transaction (Bitcoin to Ethereum)', async () => {
      mockAdd.mockImplementation.mockDocumentId = 'newBtcEthTxId';
      mockPrepareCrossChainTransaction.mockResolvedValueOnce({
        id: 'cross-chain-btc-eth-123',
        needsBridge: true,
        steps: [
          { step: 1, description: 'Lock Bitcoin funds' },
          { step: 2, description: 'Mint wrapped Bitcoin on Ethereum' }
        ]
      });

      const response = await testAgent.post('/create')
        .set('Authorization', 'Bearer validtoken')
        .send(crossChainBitcoinToEthereumPayload);

      expect(response.status).toBe(201);
      expect(response.body.transactionId).toBe('newBtcEthTxId');
      expect(response.body.isCrossChain).toBe(true);
      expect(response.body.crossChainInfo).toBeDefined();
      expect(response.body.crossChainInfo.buyerNetwork).toBe('bitcoin');
      expect(response.body.crossChainInfo.sellerNetwork).toBe('ethereum');

      // Verify cross-chain transaction was prepared
      expect(mockPrepareCrossChainTransaction).toHaveBeenCalledWith({
        fromAddress: crossChainBitcoinToEthereumPayload.buyerWalletAddress,
        toAddress: crossChainBitcoinToEthereumPayload.sellerWalletAddress,
        amount: String(crossChainBitcoinToEthereumPayload.amount),
        sourceNetwork: 'bitcoin',
        targetNetwork: 'ethereum',
        dealId: 'newBtcEthTxId',
        userId: mockDecodedToken.uid
      });

      // Verify cross-chain conditions were added
      expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
        isCrossChain: true,
        buyerNetwork: 'bitcoin',
        sellerNetwork: 'ethereum',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            id: 'cross_chain_network_validation',
            type: 'CROSS_CHAIN',
            description: 'Network compatibility validated (bitcoin to ethereum)'
          }),
          expect.objectContaining({
            id: 'cross_chain_bridge_setup',
            type: 'CROSS_CHAIN',
            description: 'Cross-chain bridge connection established'
          }),
          expect.objectContaining({
            id: 'cross_chain_funds_locked',
            type: 'CROSS_CHAIN',
            description: 'Funds locked on source network (bitcoin)'
          }),
          expect.objectContaining({
            id: 'cross_chain_bridge_transfer',
            type: 'CROSS_CHAIN',
            description: 'Bridge transfer via Wrapped Bitcoin completed'
          })
        ])
      }));
    });

    it('should create a cross-chain transaction (Solana to Ethereum)', async () => {
      mockAdd.mockImplementation.mockDocumentId = 'newSolEthTxId';
      mockPrepareCrossChainTransaction.mockResolvedValueOnce({
        id: 'cross-chain-sol-eth-123',
        needsBridge: true,
        steps: [
          { step: 1, description: 'Lock Solana funds' },
          { step: 2, description: 'Bridge to Ethereum' }
        ]
      });

      const response = await testAgent.post('/create')
        .set('Authorization', 'Bearer validtoken')
        .send(crossChainSolanaToEthereumPayload);

      expect(response.status).toBe(201);
      expect(response.body.transactionId).toBe('newSolEthTxId');
      expect(response.body.isCrossChain).toBe(true);
      expect(response.body.crossChainInfo.buyerNetwork).toBe('solana');
      expect(response.body.crossChainInfo.sellerNetwork).toBe('ethereum');
    });

    it('should handle cross-chain transaction preparation failure', async () => {
      mockAdd.mockImplementation.mockDocumentId = 'failedCrossChainTx';
      // Reset the mock to reject for this specific test
      mockPrepareCrossChainTransaction.mockReset();
      mockPrepareCrossChainTransaction.mockRejectedValueOnce(new Error('Cross-chain service unavailable'));

      const response = await testAgent.post('/create')
        .set('Authorization', 'Bearer validtoken')
        .send(crossChainBitcoinToEthereumPayload);

      expect(response.status).toBe(201); // Transaction still created
      expect(response.body.transactionId).toBe('failedCrossChainTx');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        timeline: expect.objectContaining({
          _fieldName: 'FieldValue.arrayUnion',
          _elements: expect.arrayContaining([
            expect.objectContaining({
              event: 'Cross-chain transaction preparation FAILED: Cross-chain service unavailable'
            })
          ])
        })
      }));
    });

    it('should create a transaction successfully (SELLER initiated)', async () => {
        mockAdd.mockImplementation.mockDocumentId = 'newTxIdSeller';
        const sellerPayload = { ...baseCreatePayload, initiatedBy: 'SELLER' };
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(sellerPayload);
        expect(response.status).toBe(201);
        expect(response.body.transactionId).toBe('newTxIdSeller');
      });

    it('should skip contract deployment if env vars missing', async () => {
        delete process.env.DEPLOYER_PRIVATE_KEY;
        mockAdd.mockImplementation.mockDocumentId = 'newTxIdNoSC';
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(baseCreatePayload);
        expect(response.status).toBe(201);
        expect(mockDeployPropertyEscrowContract).not.toHaveBeenCalled();
        process.env.DEPLOYER_PRIVATE_KEY = 'test_deployer_key'; // Restore
    });

    it('should handle contract deployment failure', async () => {
        mockDeployPropertyEscrowContract.mockRejectedValueOnce(new Error('Deployment failed badly'));
        mockAdd.mockImplementation.mockDocumentId = 'newTxIdFailSC';
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(baseCreatePayload);
        expect(response.status).toBe(201); // Still creates off-chain
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
          smartContractAddress: null, // Changed from 'None' to null
          timeline: expect.arrayContaining([
            expect.objectContaining({ event: expect.stringContaining('Smart contract deployment FAILED: Deployment failed badly') })
          ])
        }));
    });

    const invalidFieldTestCases = [
        { field: 'initiatedBy', value: 'INVALID_ROLE', error: 'Invalid "initiatedBy". Must be "BUYER" or "SELLER".' },
        { field: 'initiatedBy', value: undefined, error: 'Invalid "initiatedBy". Must be "BUYER" or "SELLER".' },
        { field: 'propertyAddress', value: '', error: 'Property address is required.' },
        { field: 'propertyAddress', value: undefined, error: 'Property address is required.' },
        { field: 'amount', value: 0, error: 'Amount must be a positive finite number.' },
        { field: 'amount', value: -5, error: 'Amount must be a positive finite number.' },
        { field: 'amount', value: undefined, error: 'Amount must be a positive finite number.' },
        { field: 'otherPartyEmail', value: 'invalid-email', error: 'Valid other party email is required.' },
        { field: 'otherPartyEmail', value: undefined, error: 'Valid other party email is required.' },
        { field: 'buyerWalletAddress', value: 'TEST_INVALID_ADDRESS', error: 'Valid buyer wallet address is required.' },
        { field: 'buyerWalletAddress', value: undefined, error: 'Valid buyer wallet address is required.' },
        { field: 'sellerWalletAddress', value: 'TEST_INVALID_ADDRESS', error: 'Valid seller wallet address is required.' },
        { field: 'sellerWalletAddress', value: undefined, error: 'Valid seller wallet address is required.' },
    ];

    invalidFieldTestCases.forEach(({ field, value, error }) => {
        it(`should return 400 if ${field} is invalid/missing`, async () => {
            const payload = { ...baseCreatePayload };
            if (value === undefined) {
                delete payload[field];
            } else {
                payload[field] = value;
            }
            const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
            expect(response.status).toBe(400);
            expect(response.body.error).toBe(error);
        });
    });

    it('should return 400 if buyer and seller wallet addresses are the same', async () => {
        const sameAddress = '0xabcdef1234567890abcdef1234567890abcdef12'; // Valid hex
        const payload = {
          ...baseCreatePayload,
          buyerWalletAddress: sameAddress,
          sellerWalletAddress: sameAddress,
        };
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Buyer and Seller wallet addresses cannot be the same.');
    });

    it('should return 400 if initialConditions are malformed (e.g. missing description)', async () => {
        const payload = { ...baseCreatePayload, initialConditions: [{ id: 'c1', type: 'CUSTOM' /* description missing */ }] };
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Initial conditions must be an array of objects with non-empty "id", "type", and "description".');
    });

    it('should return 404 if otherPartyEmail not found in DB', async () => {
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send({ ...baseCreatePayload, otherPartyEmail: 'nonexistent@example.com' });
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('User with email nonexistent@example.com not found.');
    });

    it('should return 400 if initiator tries to create transaction with self', async () => {
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send({ ...baseCreatePayload, otherPartyEmail: mockDecodedToken.email });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Cannot create a transaction with yourself.');
    });

    it('should return 500 on Firestore error during creation', async () => {
        mockAdd.mockRejectedValueOnce(new Error('Firestore failed to add'));
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(baseCreatePayload);
        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Internal server error during transaction creation.');
    });
  });

  describe('GET /:transactionId', () => {
    const mockTxData = {
        id: transactionId,
        participants: [mockDecodedToken.uid, 'otherUserId'],
        amount: 100,
        propertyAddress: '123 Main St',
        status: 'PENDING_BUYER_REVIEW',
        timeline: [],
        conditions: [],
        createdAt: expectedFixedTimestampObject, // Use the object with actual toDate
        updatedAt: expectedFixedTimestampObject,
      };

    it('should fetch a transaction successfully if user is participant', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, id: transactionId, data: () => mockTxData });
      const response = await testAgent.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(transactionId);
      // Ensure dates are ISO strings in the response
      expect(typeof response.body.createdAt).toBe('string');
      expect(new Date(response.body.createdAt).toISOString()).toBe(fixedDate.toISOString());
    });

    it('should return 404 if transaction not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const response = await testAgent.get('/nonexistentTxId').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(404);
    });

    it('should return 403 if user is not a participant', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...mockTxData, participants: ['anotherUser1', 'anotherUser2'] }) });
      const response = await testAgent.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(403);
    });
  });

  describe('GET /', () => {
    it('should list transactions for the user', async () => {
      const userTransactionsData = [
        { id: 'tx1', propertyAddress: 'Addr1', participants: [mockDecodedToken.uid], createdAt: expectedFixedTimestampObject, updatedAt: expectedFixedTimestampObject },
        { id: 'tx2', propertyAddress: 'Addr2', participants: [mockDecodedToken.uid], createdAt: expectedFixedTimestampObject, updatedAt: expectedFixedTimestampObject },
      ];
      mockGet.mockResolvedValueOnce({ empty: false, docs: userTransactionsData.map(tx => ({ id: tx.id, data: () => tx })) });
      const response = await testAgent.get('/').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      expect(response.body[0].id).toBe('tx1');
      expect(typeof response.body[0].createdAt).toBe('string');
    });

    it('should return empty array if no transactions found', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
      const response = await testAgent.get('/').set('Authorization', 'Bearer validtoken');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('PATCH /conditions/:conditionId/buyer-review', () => {
    const transactionIdForCond = 'txConditionReview';
    const conditionIdToReview = 'condToReview';
    const mockTxDataForCondReview = {
        buyerId: mockDecodedToken.uid,
        sellerId: 'otherUserId',
        status: 'PENDING_BUYER_CONDITION_REVIEW',
        conditions: [
            { id: conditionIdToReview, description: 'Test Condition', status: 'PENDING_BUYER_REVIEW', type: 'STANDARD', updatedAt: expectedFixedTimestampObject },
            { id: 'otherCond', description: 'Other Condition', status: 'PENDING_BUYER_REVIEW', type: 'STANDARD', updatedAt: expectedFixedTimestampObject }
        ],
        participants: [mockDecodedToken.uid, 'otherUserId'],
        updatedAt: expectedFixedTimestampObject,
        timeline: [],
    };

    it('should update condition status successfully by buyer', async () => {
      // Set up document mock for this test
      mockGet.mockResolvedValueOnce({ exists: true, data: () => mockTxDataForCondReview });

      const response = await testAgent
        .patch(`/conditions/${conditionIdToReview}/buyer-review`)
        .set('Authorization', 'Bearer validtoken')
        .send({ 
          dealId: transactionIdForCond,
          status: 'FULFILLED_BY_BUYER', 
          notes: 'Looks good!' 
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Condition updated successfully');
    });

    it('should return 400 for invalid status', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => mockTxDataForCondReview });
      
      const response = await testAgent
        .patch(`/conditions/${conditionIdToReview}/buyer-review`)
        .set('Authorization', 'Bearer validtoken')
        .send({ 
          dealId: transactionIdForCond,
          status: 'INVALID_STATUS_FOO' 
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid status. Must be "FULFILLED_BY_BUYER" or "ACTION_WITHDRAWN_BY_BUYER".');
    });

    // Other tests for this route (403, 404s) would follow similar patterns
  });

  describe('PUT /:transactionId/sync-status', () => {
    const txSyncId = 'txSyncStatusTarget';
    const mockTxDataForSync = {
      id: txSyncId,
      participants: [mockDecodedToken.uid, 'otherUserId'],
      smartContractAddress: '0xDeployedContractAddress',
      status: 'ACTIVE',
      updatedAt: expectedFixedTimestampObject,
      timeline: [],
      fundsDepositedByBuyer: false,
      fundsReleasedToSeller: false,
    };

    it('should sync status successfully', async () => {
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => mockTxDataForSync });
      const payload = { newSCStatus: 'IN_ESCROW' };
      const response = await testAgent.put(`/${txSyncId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        status: 'IN_ESCROW',
        updatedAt: expectedFixedTimestampObject,
        timeline: {
          _fieldName: 'FieldValue.arrayUnion',
          _elements: [
            expect.objectContaining({
              event: `Backend status synced to IN_ESCROW based on smart contract state. Synced by UID: ${mockDecodedToken.uid}.`,
              systemTriggered: true,
              timestamp: expectedFixedTimestampObject,
              userId: mockDecodedToken.uid
            })
          ]
        }
      }));
    });

    it('should update fundsReleasedToSeller if status is COMPLETED', async () => {
      const initialSyncData = {...mockTxDataForSync, fundsDepositedByBuyer: true, fundsReleasedToSeller: false };
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => initialSyncData });
      const payload = { newSCStatus: 'COMPLETED' };
      await testAgent.put(`/${txSyncId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
      expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        status: 'COMPLETED',
        fundsReleasedToSeller: true,
        updatedAt: expectedFixedTimestampObject,
        timeline: {
          _fieldName: 'FieldValue.arrayUnion',
          _elements: expect.arrayContaining([
            expect.objectContaining({ event: expect.stringContaining('Backend status synced to COMPLETED'), systemTriggered: true, timestamp: expectedFixedTimestampObject, userId: mockDecodedToken.uid }),
            // The "Funds confirmed deposited" event is NOT expected because initialSyncData.fundsDepositedByBuyer was already true
            expect.objectContaining({ event: 'Funds confirmed released to seller (synced from SC).', system: true, timestamp: expectedFixedTimestampObject })
          ])
        }
      }));
    });

    it('should set deadlines if provided for IN_FINAL_APPROVAL', async () => {
      const initialSyncData = {...mockTxDataForSync, fundsDepositedByBuyer: false};
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => initialSyncData });
      const deadlineDate = new Date(fixedDate.getTime() + 24 * 60 * 60 * 1000);
      const deadlineISO = deadlineDate.toISOString();
      const payload = { newSCStatus: 'IN_FINAL_APPROVAL', finalApprovalDeadlineISO: deadlineISO };
      await testAgent.put(`/${txSyncId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
      expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        status: 'IN_FINAL_APPROVAL',
        fundsDepositedByBuyer: true,
        finalApprovalDeadlineBackend: matchSpecificTimestampObject(deadlineDate),
        updatedAt: matchTimestampObject(expectedFixedTimestampObject),
        timeline: {
          _fieldName: 'FieldValue.arrayUnion',
          _elements: expect.arrayContaining([
            expect.objectContaining({ event: expect.stringContaining('Backend status synced to IN_FINAL_APPROVAL'), systemTriggered: true, timestamp: matchTimestampObject(expectedFixedTimestampObject), userId: mockDecodedToken.uid }),
            expect.objectContaining({ event: `Final approval deadline set/updated to ${deadlineISO}.`, system: true, timestamp: matchTimestampObject(expectedFixedTimestampObject)}),
            expect.objectContaining({ event: 'Funds confirmed deposited (synced from SC).', system: true, timestamp: matchTimestampObject(expectedFixedTimestampObject) })
          ])
        }
      }));
    });
     it('should return 400 for invalid newSCStatus', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => mockTxDataForSync });
      const payload = { newSCStatus: 'INVALID_SC_STATUS_XYZ' };
      const response = await testAgent.put(`/${txSyncId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid smart contract status value: INVALID_SC_STATUS_XYZ.');
    });
  });

  describe('POST /:transactionId/sc/start-final-approval', () => {
    const txFinalAppId = 'txFinalApprovalTarget';
    const mockTxDataForFinal = {
      id: txFinalAppId,
      buyerId: mockDecodedToken.uid,
      participants: [mockDecodedToken.uid, 'otherUserId'],
      status: 'IN_ESCROW',
      updatedAt: expectedFixedTimestampObject,
      timeline: [],
    };
    const deadlineDate = new Date(fixedDate.getTime() + 4 * 24 * 60 * 60 * 1000);
    const deadlineISO = deadlineDate.toISOString();

    it('should sync start of final approval successfully', async () => {
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => mockTxDataForFinal });
      const response = await testAgent
        .post(`/${txFinalAppId}/sc/start-final-approval`)
        .set('Authorization', 'Bearer validtoken')
        .send({ finalApprovalDeadlineISO: deadlineISO });
      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(), // First argument is the transactionRef (document reference)
        expect.objectContaining({
          status: 'IN_FINAL_APPROVAL',
          finalApprovalDeadlineBackend: matchSpecificTimestampObject(deadlineDate),
          updatedAt: matchTimestampObject(expectedFixedTimestampObject),
          timeline: {
            _fieldName: 'FieldValue.arrayUnion',
            _elements: [expect.objectContaining({
              event: `Final approval period started (synced from on-chain action by UID: ${mockDecodedToken.uid}). Deadline: ${deadlineISO}.`,
              timestamp: matchTimestampObject(expectedFixedTimestampObject),
              userId: mockDecodedToken.uid
            })]
          }
        })
      );
    });

    it('should return 400 if deadline is missing or in the past', async () => {
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => mockTxDataForFinal });
      const pastDeadlineISO = new Date(fixedDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const response = await testAgent
        .post(`/${txFinalAppId}/sc/start-final-approval`)
        .set('Authorization', 'Bearer validtoken')
        .send({ finalApprovalDeadlineISO: pastDeadlineISO });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid finalApprovalDeadlineISO format or value: Final approval deadline must be in the future.');
    });
  });

  describe('POST /:transactionId/sc/raise-dispute', () => {
    const txDisputeId = 'txRaiseDisputeTarget';
    const condDisputeId = 'condInDisputeTarget';
    const mockTxDataForDispute = {
        id: txDisputeId,
        buyerId: mockDecodedToken.uid,
        participants: [mockDecodedToken.uid, 'otherUserId'],
        status: 'IN_ESCROW',
        conditions: [{ id: condDisputeId, description: 'A condition', status: 'PENDING_ACTION', type: 'STANDARD', updatedAt: expectedFixedTimestampObject }],
        updatedAt: expectedFixedTimestampObject,
        timeline: [],
    };
    const deadlineDate = new Date(fixedDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const deadlineISO = deadlineDate.toISOString();

    it('should sync dispute raised successfully', async () => {
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => mockTxDataForDispute });
      const response = await testAgent
        .post(`/${txDisputeId}/sc/raise-dispute`)
        .set('Authorization', 'Bearer validtoken')
        .send({ conditionId: condDisputeId, disputeComment: 'Test dispute', disputeResolutionDeadlineISO: deadlineISO });
      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        status: 'IN_DISPUTE',
        disputeResolutionDeadlineBackend: matchSpecificTimestampObject(deadlineDate),
        conditions: expect.arrayContaining([
          expect.objectContaining({ id: condDisputeId, status: 'ACTION_WITHDRAWN_BY_BUYER', updatedAt: matchTimestampObject(expectedFixedTimestampObject) })
        ]),
        updatedAt: matchTimestampObject(expectedFixedTimestampObject),
        timeline: {
          _fieldName: 'FieldValue.arrayUnion',
          _elements: [expect.objectContaining({
            event: `Dispute raised (synced from on-chain action by UID: ${mockDecodedToken.uid}) regarding condition ID: ${condDisputeId}. Deadline: ${deadlineISO}.`,
            timestamp: matchTimestampObject(expectedFixedTimestampObject),
            userId: mockDecodedToken.uid
          })]
        }
      }));
    });

    it('should return 403 if non-buyer tries to sync dispute raise', async () => {
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...mockTxDataForDispute, buyerId: 'anotherBuyerId' }) });
      const response = await testAgent.post(`/${txDisputeId}/sc/raise-dispute`)
          .set('Authorization', 'Bearer validtoken').send({ conditionId: condDisputeId, disputeComment: 'Test', disputeResolutionDeadlineISO: deadlineISO });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Only the buyer can raise a dispute via this sync endpoint.');
    });

    it('should return 400 if deal is already in terminal state', async () => {
      mockTransactionGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...mockTxDataForDispute, status: 'COMPLETED' }) });
      const response = await testAgent.post(`/${txDisputeId}/sc/raise-dispute`)
          .set('Authorization', 'Bearer validtoken').send({ conditionId: condDisputeId, disputeComment: 'Test', disputeResolutionDeadlineISO: deadlineISO });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(`Deal is not in a state where a dispute can be raised (current status: COMPLETED).`);
    });
  });

  // Add new cross-chain specific test suites
  describe('Cross-Chain Transaction Management', () => {
    const crossChainDealId = 'crossChainDeal123';
    const mockCrossChainDealData = {
      id: crossChainDealId,
      participants: [mockDecodedToken.uid, 'otherUserId'],
      isCrossChain: true,
      crossChainTransactionId: 'cross-chain-tx-123',
      buyerNetwork: 'bitcoin',
      sellerNetwork: 'ethereum',
      crossChainInfo: { bridge: 'Wrapped Bitcoin', fee: '0.0005', estimatedTime: '30 minutes' },
      conditions: [
        { id: 'cross_chain_network_validation', type: 'CROSS_CHAIN', description: 'Network validation', status: 'PENDING_BUYER_ACTION' },
        { id: 'cross_chain_bridge_setup', type: 'CROSS_CHAIN', description: 'Bridge setup', status: 'PENDING_BUYER_ACTION' }
      ],
      timeline: [],
      updatedAt: expectedFixedTimestampObject
    };

    describe('POST /cross-chain/:dealId/execute-step', () => {
      it('should execute cross-chain step successfully', async () => {
        mockGet.mockResolvedValueOnce({ exists: true, data: () => mockCrossChainDealData });
        mockExecuteCrossChainStep.mockResolvedValueOnce({ status: 'completed', txHash: '0x123' });

        const response = await testAgent
          .post(`/cross-chain/${crossChainDealId}/execute-step`)
          .set('Authorization', 'Bearer validtoken')
          .send({ stepNumber: 1, txHash: '0x123' });

        expect(response.status).toBe(200);
        expect(response.body.message).toContain('Cross-chain step 1 executed successfully');
        expect(mockExecuteCrossChainStep).toHaveBeenCalledWith('cross-chain-tx-123', 1, '0x123');
      });

      it('should return 400 for invalid step number', async () => {
        const response = await testAgent
          .post(`/cross-chain/${crossChainDealId}/execute-step`)
          .set('Authorization', 'Bearer validtoken')
          .send({ stepNumber: 'invalid', txHash: '0x123' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Valid step number is required.');
      });

      it('should return 404 for non-existent deal', async () => {
        mockGet.mockResolvedValueOnce({ exists: false });

        const response = await testAgent
          .post(`/cross-chain/nonexistent/execute-step`)
          .set('Authorization', 'Bearer validtoken')
          .send({ stepNumber: 1, txHash: '0x123' });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Deal not found.');
      });

      it('should return 403 for non-participant', async () => {
        const nonParticipantDeal = { ...mockCrossChainDealData, participants: ['otherUser1', 'otherUser2'] };
        mockGet.mockResolvedValueOnce({ exists: true, data: () => nonParticipantDeal });

        const response = await testAgent
          .post(`/cross-chain/${crossChainDealId}/execute-step`)
          .set('Authorization', 'Bearer validtoken')
          .send({ stepNumber: 1, txHash: '0x123' });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Access denied. User is not a participant in this deal.');
      });

      it('should return 400 for non-cross-chain deal', async () => {
        const regularDeal = { ...mockCrossChainDealData, isCrossChain: false, crossChainTransactionId: null };
        mockGet.mockResolvedValueOnce({ exists: true, data: () => regularDeal });

        const response = await testAgent
          .post(`/cross-chain/${crossChainDealId}/execute-step`)
          .set('Authorization', 'Bearer validtoken')
          .send({ stepNumber: 1, txHash: '0x123' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('This is not a cross-chain transaction.');
      });
    });

    describe('GET /cross-chain/:dealId/status', () => {
      it('should get cross-chain status successfully', async () => {
        mockGet.mockResolvedValueOnce({ exists: true, data: () => mockCrossChainDealData });
        mockGetCrossChainTransactionStatus.mockResolvedValueOnce({
          id: 'cross-chain-tx-123',
          status: 'pending',
          currentStep: 1,
          needsBridge: true
        });

        const response = await testAgent
          .get(`/cross-chain/${crossChainDealId}/status`)
          .set('Authorization', 'Bearer validtoken');

        expect(response.status).toBe(200);
        expect(response.body.dealId).toBe(crossChainDealId);
        expect(response.body.crossChainTransaction.status).toBe('pending');
        expect(response.body.buyerNetwork).toBe('bitcoin');
        expect(response.body.sellerNetwork).toBe('ethereum');
        expect(response.body.crossChainConditions).toHaveLength(2);
      });
    });

    describe('PATCH /cross-chain/:dealId/conditions/:conditionId', () => {
      it('should update cross-chain condition successfully', async () => {
        mockGet.mockResolvedValueOnce({ exists: true, data: () => mockCrossChainDealData });

        const response = await testAgent
          .patch(`/cross-chain/${crossChainDealId}/conditions/cross_chain_network_validation`)
          .set('Authorization', 'Bearer validtoken')
          .send({ status: 'FULFILLED_BY_BUYER', notes: 'Network validation completed' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Cross-chain condition updated successfully');
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
          conditions: expect.arrayContaining([
            expect.objectContaining({
              id: 'cross_chain_network_validation',
              status: 'FULFILLED_BY_BUYER',
              notes: 'Network validation completed'
            })
          ])
        }));
      });

      it('should return 400 for non-cross-chain condition', async () => {
        const dealWithRegularCondition = {
          ...mockCrossChainDealData,
          conditions: [{ id: 'regular_condition', type: 'CUSTOM', description: 'Regular condition' }]
        };
        mockGet.mockResolvedValueOnce({ exists: true, data: () => dealWithRegularCondition });

        const response = await testAgent
          .patch(`/cross-chain/${crossChainDealId}/conditions/regular_condition`)
          .set('Authorization', 'Bearer validtoken')
          .send({ status: 'FULFILLED_BY_BUYER' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('This is not a cross-chain condition.');
      });
    });

    describe('POST /cross-chain/:dealId/transfer', () => {
      it('should execute cross-chain transfer with bridge successfully', async () => {
        const dealWithBridge = { 
          ...mockCrossChainDealData, 
          conditions: mockCrossChainDealData.conditions.map(c => ({ ...c, status: 'FULFILLED_BY_BUYER' })) 
        };
        mockGet.mockResolvedValueOnce({ exists: true, data: () => dealWithBridge });
        mockGetCrossChainTransactionStatus.mockResolvedValueOnce({
          id: 'cross-chain-tx-123',
          status: 'ready',
          needsBridge: true
        });

        const response = await testAgent
          .post(`/cross-chain/${crossChainDealId}/transfer`)
          .set('Authorization', 'Bearer validtoken')
          .send({ fromTxHash: '0xabc123', bridgeTxHash: '0xdef456' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Cross-chain transfer initiated successfully');
        expect(response.body.requiresBridge).toBe(true);
        expect(mockExecuteCrossChainStep).toHaveBeenCalledWith('cross-chain-tx-123', 1, '0xabc123');
        expect(mockExecuteCrossChainStep).toHaveBeenCalledWith('cross-chain-tx-123', 2, '0xdef456');
      });

      it('should return 400 if conditions not fulfilled', async () => {
        // Use the original mockCrossChainDealData with PENDING_BUYER_ACTION conditions
        const dealWithUnfulfilledConditions = {
          ...mockCrossChainDealData,
          conditions: [
            { id: 'cross_chain_network_validation', type: 'CROSS_CHAIN', description: 'Network validation', status: 'PENDING_BUYER_ACTION' },
            { id: 'cross_chain_bridge_setup', type: 'CROSS_CHAIN', description: 'Bridge setup', status: 'PENDING_BUYER_ACTION' }
          ]
        };
        mockGet.mockResolvedValueOnce({ exists: true, data: () => dealWithUnfulfilledConditions });

        const response = await testAgent
          .post(`/cross-chain/${crossChainDealId}/transfer`)
          .set('Authorization', 'Bearer validtoken')
          .send({ fromTxHash: '0xabc123' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('All conditions must be fulfilled before executing transfer.');
      });
    });
  });

  describe('GET /cross-chain/estimate-fees', () => {
    it('should estimate cross-chain fees successfully', async () => {
      const response = await testAgent
        .get('/cross-chain/estimate-fees')
        .query({
          sourceNetwork: 'bitcoin',
          targetNetwork: 'ethereum',
          amount: '1.0'
        })
        .set('Authorization', 'Bearer validtoken');

      expect(response.status).toBe(200);
      expect(response.body.sourceNetwork).toBe('bitcoin');
      expect(response.body.targetNetwork).toBe('ethereum');
      expect(response.body.amount).toBe('1.0');
      expect(response.body.feeEstimate).toBeDefined();
      expect(response.body.bridgeInfo).toBeDefined();
      expect(response.body.isEVMCompatible).toBe(false);
    });

    it('should return 400 for missing parameters', async () => {
      const response = await testAgent
        .get('/cross-chain/estimate-fees')
        .query({ sourceNetwork: 'bitcoin' }) // Missing targetNetwork and amount
        .set('Authorization', 'Bearer validtoken');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('sourceNetwork, targetNetwork, and amount are required.');
    });
  });
});
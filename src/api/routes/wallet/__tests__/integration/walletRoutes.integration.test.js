import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';

// Mock the 'ethers' module using unstable mocking for ESM
const mockIsAddress = jest.fn();
const mockGetAddress = jest.fn();

jest.unstable_mockModule('ethers', () => ({
    __esModule: true,
    isAddress: mockIsAddress,
    getAddress: mockGetAddress,
    ethers: {
        isAddress: mockIsAddress,
        getAddress: mockGetAddress,
    }
}));

// Mock cross-chain service
jest.unstable_mockModule('../../../../../services/crossChainService.js', () => ({
    areNetworksEVMCompatible: jest.fn(),
    getBridgeInfo: jest.fn(),
    estimateTransactionFees: jest.fn(),
    prepareCrossChainTransaction: jest.fn(),
    executeCrossChainStep: jest.fn(),
    getCrossChainTransactionStatus: jest.fn()
}));

// Now import everything else after setting up the mock
const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { Timestamp } = await import('firebase-admin/firestore');
const { adminFirestore, PROJECT_ID } = await import('../../../../../../jest.emulator.setup.js');
const { deleteAdminApp } = await import('../../../auth/admin.js');
const { createTestUser, cleanUp } = await import('../../../../../helperFunctions.js');

// Import cross-chain service mocks
const crossChainService = await import('../../../../../services/crossChainService.js');

// Import the module under test AFTER setting up the mock
const { default: walletRoutes } = await import('../../walletRoutes.js');

jest.setTimeout(60000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const app = express();
app.use(express.json());
app.use('/api/wallets', walletRoutes);

let testUser, secondUser;

// Generate test addresses for different networks
const generateEthereumAddress = (prefix = '00') => {
    let randomHex = Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    return `0x${prefix}${randomHex.substring(prefix.length)}`.toLowerCase();
};

const generateSolanaAddress = () => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return Array(44).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const generateBitcoinAddress = () => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return 'bc1' + Array(39).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// Valid test addresses
const testAddresses = {
    ethereum: generateEthereumAddress('aa'),
    polygon: generateEthereumAddress('bb'),
    bsc: generateEthereumAddress('cc'),
    solana: '4fYNw3dojWmQ4dXtSGE9epjRGy3xGFNP7JQvGXqsMAEs',
    bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
};

beforeAll(async () => {
    console.log(`[TEST SETUP] Starting Wallet integration tests with Project ID: ${PROJECT_ID}`);
    await cleanUp();
}, 60000);

afterAll(async () => {
    console.log('[TEST TEARDOWN] Cleaning up after all wallet tests.');
    await cleanUp();
    if (typeof deleteAdminApp === 'function') {
        try {
            await deleteAdminApp();
        } catch (e) {
            console.warn('[TEST TEARDOWN] Could not delete admin app:', e.message);
        }
    }
    jest.restoreAllMocks();
}, 60000);

beforeEach(async () => {
    await cleanUp();

    // Reset and configure mocks for each test
    mockIsAddress.mockReset().mockReturnValue(true);
    mockGetAddress.mockReset().mockImplementation(addr => addr);

    // Reset cross-chain service mocks
    crossChainService.areNetworksEVMCompatible.mockReset();
    crossChainService.getBridgeInfo.mockReset();
    crossChainService.estimateTransactionFees.mockReset();
    crossChainService.prepareCrossChainTransaction.mockReset();
    crossChainService.executeCrossChainStep.mockReset();
    crossChainService.getCrossChainTransactionStatus.mockReset();

    // Configure cross-chain service mocks
    crossChainService.areNetworksEVMCompatible.mockImplementation((source, target) => {
        const evmNetworks = ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism'];
        return evmNetworks.includes(source) && evmNetworks.includes(target);
    });

    crossChainService.getBridgeInfo.mockImplementation((source, target) => {
        if (crossChainService.areNetworksEVMCompatible(source, target)) {
            return null;
        }
        return {
            bridge: 'test-bridge',
            estimatedTime: '10-30 minutes',
            fees: '0.01 ETH'
        };
    });

    crossChainService.estimateTransactionFees.mockResolvedValue({
        sourceNetworkFee: '0.001',
        targetNetworkFee: '0.001',
        bridgeFee: '0.01',
        totalEstimatedFee: '0.021'
    });

    crossChainService.prepareCrossChainTransaction.mockResolvedValue({
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'prepared',
        steps: []
    });

    crossChainService.executeCrossChainStep.mockResolvedValue({
        success: true,
        nextStep: 2
    });

    crossChainService.getCrossChainTransactionStatus.mockResolvedValue({
        id: 'tx_test_123',
        status: 'completed'
    });

    try {
        const timestamp = Date.now();
        testUser = await createTestUser(`wallet.test.${timestamp}@example.com`, {
            first_name: 'WalletTest',
            wallets: []
        });
        secondUser = await createTestUser(`wallet.second.${timestamp}@example.com`, {
            first_name: 'SecondUser',
            wallets: []
        });

        // Ensure both users have clean wallet arrays
        await adminFirestore.collection('users').doc(testUser.uid).update({
            wallets: []
        });
        await adminFirestore.collection('users').doc(secondUser.uid).update({
            wallets: []
        });

        if (!testUser || !testUser.token) {
            throw new Error('TEST SETUP FAIL: Test user creation/token fetch failed.');
        }
        if (!secondUser || !secondUser.token) {
            throw new Error('TEST SETUP FAIL: Second user creation/token fetch failed.');
        }
    } catch (error) {
        console.error("CRITICAL FAILURE in beforeEach (Wallet Tests):", error.message, error.stack);
        throw error;
    }
});

describe('Wallet Routes API Integration Tests (/api/wallets)', () => {
    describe('POST /register', () => {
        it('should register a new Ethereum wallet successfully', async () => {
            const walletData = {
                address: testAddresses.ethereum,
                name: 'Main Ethereum Wallet',
                network: 'ethereum',
                isPrimary: true
            };

            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send(walletData)
                .expect(201);

            expect(response.body).toEqual({
                message: 'Wallet registered successfully',
                wallet: expect.objectContaining({
                    address: walletData.address.toLowerCase(),
                    name: walletData.name,
                    network: walletData.network,
                    isPrimary: true
                })
            });

            // Verify wallet was saved in database
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            expect(userData.wallets).toHaveLength(1);
            expect(userData.wallets[0]).toMatchObject({
                address: walletData.address.toLowerCase(),
                name: walletData.name,
                network: walletData.network,
                isPrimary: true
            });
        });

        it('should register a Solana wallet with valid address format', async () => {
            const walletData = {
                address: testAddresses.solana,
                name: 'Solana Wallet',
                network: 'solana',
                isPrimary: false
            };

            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send(walletData)
                .expect(201);

            expect(response.body.wallet.address).toBe(walletData.address.toLowerCase());
            expect(response.body.wallet.network).toBe('solana');
        });

        it('should register a Bitcoin wallet with valid address format', async () => {
            const walletData = {
                address: testAddresses.bitcoin,
                name: 'Bitcoin Wallet',
                network: 'bitcoin',
                isPrimary: false
            };

            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send(walletData)
                .expect(201);

            expect(response.body.wallet.address).toBe(walletData.address.toLowerCase());
            expect(response.body.wallet.network).toBe('bitcoin');
        });

        it('should return 400 for missing required fields', async () => {
            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({ address: testAddresses.ethereum })
                .expect(400);

            expect(response.body.error).toBe('Address, name, and network are required');
        });

        it('should return 400 for invalid EVM address', async () => {
            mockIsAddress.mockReturnValue(false);

            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: 'invalid_address',
                    name: 'Test Wallet',
                    network: 'ethereum'
                })
                .expect(400);

            expect(response.body.error).toBe('Invalid EVM wallet address');
        });

        it('should return 400 for invalid Solana address', async () => {
            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: 'invalid_solana_123',
                    name: 'Test Wallet',
                    network: 'solana'
                })
                .expect(400);

            expect(response.body.error).toBe('Invalid Solana wallet address');
        });

        it('should return 400 for invalid Bitcoin address', async () => {
            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: 'invalid_bitcoin_address',
                    name: 'Test Wallet',
                    network: 'bitcoin'
                })
                .expect(400);

            expect(response.body.error).toBe('Invalid Bitcoin wallet address');
        });

        it('should return 401 for missing authentication token', async () => {
            const response = await request(app)
                .post('/api/wallets/register')
                .send({
                    address: testAddresses.ethereum,
                    name: 'Test Wallet',
                    network: 'ethereum'
                })
                .expect(401);

            expect(response.body.error).toBe('No token provided');
        });

        it('should update existing wallet if same address and network', async () => {
            // First registration
            await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: testAddresses.ethereum,
                    name: 'Original Name',
                    network: 'ethereum',
                    isPrimary: false
                })
                .expect(201);

            // Update the same wallet
            const response = await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: testAddresses.ethereum,
                    name: 'Updated Name',
                    network: 'ethereum',
                    isPrimary: true
                })
                .expect(201);

            expect(response.body.wallet.name).toBe('Updated Name');
            expect(response.body.wallet.isPrimary).toBe(true);

            // Verify only one wallet in database
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            expect(userData.wallets).toHaveLength(1);
        });

        it('should handle multiple wallets with correct primary wallet logic', async () => {
            // Register first wallet as primary
            await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: testAddresses.ethereum,
                    name: 'Ethereum Wallet',
                    network: 'ethereum',
                    isPrimary: true
                })
                .expect(201);

            // Register second wallet as primary (should unset first)
            await request(app)
                .post('/api/wallets/register')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: testAddresses.polygon,
                    name: 'Polygon Wallet',
                    network: 'polygon',
                    isPrimary: true
                })
                .expect(201);

            // Verify primary wallet logic
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            expect(userData.wallets).toHaveLength(2);
            
            const primaryWallets = userData.wallets.filter(w => w.isPrimary);
            expect(primaryWallets).toHaveLength(1);
            expect(primaryWallets[0].network).toBe('polygon');
        });
    });

    describe('GET /', () => {
        beforeEach(async () => {
            // Add some test wallets
            await adminFirestore.collection('users').doc(testUser.uid).update({
                wallets: [
                    {
                        address: testAddresses.ethereum,
                        name: 'Ethereum Wallet',
                        network: 'ethereum',
                        isPrimary: true,
                        balance: '1.5',
                        addedAt: Timestamp.now()
                    },
                    {
                        address: testAddresses.solana,
                        name: 'Solana Wallet',
                        network: 'solana',
                        isPrimary: false,
                        balance: '10.0',
                        addedAt: Timestamp.now()
                    }
                ]
            });
        });

        it('should return user wallets successfully', async () => {
            const response = await request(app)
                .get('/api/wallets')
                .set('Authorization', `Bearer ${testUser.token}`)
                .expect(200);

            expect(response.body.wallets).toHaveLength(2);
            expect(response.body.wallets).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        address: testAddresses.ethereum,
                        name: 'Ethereum Wallet',
                        network: 'ethereum',
                        isPrimary: true,
                        balance: '1.5'
                    }),
                    expect.objectContaining({
                        address: testAddresses.solana,
                        name: 'Solana Wallet',
                        network: 'solana',
                        isPrimary: false,
                        balance: '10.0'
                    })
                ])
            );
        });

        it('should return empty array for user with no wallets', async () => {
            const response = await request(app)
                .get('/api/wallets')
                .set('Authorization', `Bearer ${secondUser.token}`)
                .expect(200);

            expect(response.body.wallets).toEqual([]);
        });

        it('should return 401 for missing authentication', async () => {
            const response = await request(app)
                .get('/api/wallets')
                .expect(401);

            expect(response.body.error).toBe('No token provided');
        });
    });

    describe('DELETE /:address', () => {
        beforeEach(async () => {
            // Add test wallets
            await adminFirestore.collection('users').doc(testUser.uid).update({
                wallets: [
                    {
                        address: testAddresses.ethereum,
                        name: 'Ethereum Wallet',
                        network: 'ethereum',
                        isPrimary: true
                    },
                    {
                        address: testAddresses.polygon,
                        name: 'Polygon Wallet',
                        network: 'polygon',
                        isPrimary: false
                    }
                ]
            });
        });

        it('should remove wallet successfully', async () => {
            const response = await request(app)
                .delete(`/api/wallets/${testAddresses.polygon}`)
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({ network: 'polygon' })
                .expect(200);

            expect(response.body.message).toBe('Wallet removed successfully');

            // Verify wallet was removed
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            expect(userData.wallets).toHaveLength(1);
            expect(userData.wallets[0].address).toBe(testAddresses.ethereum);
        });

        it('should set another wallet as primary when removing primary wallet', async () => {
            const response = await request(app)
                .delete(`/api/wallets/${testAddresses.ethereum}`)
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({ network: 'ethereum' })
                .expect(200);

            // Verify primary wallet was reassigned
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            expect(userData.wallets).toHaveLength(1);
            expect(userData.wallets[0].isPrimary).toBe(true);
            expect(userData.wallets[0].address).toBe(testAddresses.polygon);
        });

        it('should return 400 if network not provided', async () => {
            const response = await request(app)
                .delete(`/api/wallets/${testAddresses.ethereum}`)
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({})
                .expect(400);

            expect(response.body.error).toBe('Address and network are required');
        });
    });

    describe('PUT /primary', () => {
        beforeEach(async () => {
            await adminFirestore.collection('users').doc(testUser.uid).update({
                wallets: [
                    {
                        address: testAddresses.ethereum,
                        name: 'Ethereum Wallet',
                        network: 'ethereum',
                        isPrimary: true
                    },
                    {
                        address: testAddresses.polygon,
                        name: 'Polygon Wallet',
                        network: 'polygon',
                        isPrimary: false
                    }
                ]
            });
        });

        it('should set primary wallet successfully', async () => {
            const response = await request(app)
                .put('/api/wallets/primary')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: testAddresses.polygon,
                    network: 'polygon'
                })
                .expect(200);

            expect(response.body.message).toBe('Primary wallet updated successfully');

            // Verify primary wallet changed
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            
            const primaryWallets = userData.wallets.filter(w => w.isPrimary);
            expect(primaryWallets).toHaveLength(1);
            expect(primaryWallets[0].address).toBe(testAddresses.polygon);
        });

        it('should return 404 if wallet not found', async () => {
            const response = await request(app)
                .put('/api/wallets/primary')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: '0xnonexistent',
                    network: 'ethereum'
                })
                .expect(404);

            expect(response.body.error).toBe('Wallet not found in user profile');
        });
    });

    describe('PUT /balance', () => {
        beforeEach(async () => {
            await adminFirestore.collection('users').doc(testUser.uid).update({
                wallets: [
                    {
                        address: testAddresses.ethereum,
                        name: 'Ethereum Wallet',
                        network: 'ethereum',
                        isPrimary: true,
                        balance: '0'
                    }
                ]
            });
        });

        it('should update wallet balance successfully', async () => {
            const response = await request(app)
                .put('/api/wallets/balance')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: testAddresses.ethereum,
                    network: 'ethereum',
                    balance: '2.5'
                })
                .expect(200);

            expect(response.body.message).toBe('Wallet balance updated successfully');

            // Verify balance was updated
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            expect(userData.wallets[0].balance).toBe('2.5');
            expect(userData.wallets[0].lastBalanceUpdate).toBeDefined();
        });

        it('should return 400 if balance not provided', async () => {
            const response = await request(app)
                .put('/api/wallets/balance')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({
                    address: testAddresses.ethereum,
                    network: 'ethereum'
                })
                .expect(400);

            expect(response.body.error).toBe('Address, network, and balance are required');
        });
    });

    describe('GET /preferences', () => {
        beforeEach(async () => {
            await adminFirestore.collection('users').doc(testUser.uid).update({
                wallets: [
                    {
                        address: testAddresses.ethereum,
                        name: 'Ethereum Wallet',
                        network: 'ethereum',
                        isPrimary: true
                    },
                    {
                        address: testAddresses.solana,
                        name: 'Solana Wallet',
                        network: 'solana',
                        isPrimary: false
                    }
                ]
            });
        });

        it('should return wallet preferences successfully', async () => {
            const response = await request(app)
                .get('/api/wallets/preferences')
                .set('Authorization', `Bearer ${testUser.token}`)
                .expect(200);

            expect(response.body.preferences).toEqual({
                primaryWallet: {
                    address: testAddresses.ethereum,
                    network: 'ethereum'
                },
                preferredNetworks: ['ethereum', 'solana']
            });
        });

        it('should return null primary wallet if none set', async () => {
            await adminFirestore.collection('users').doc(testUser.uid).update({
                wallets: [
                    {
                        address: testAddresses.ethereum,
                        name: 'Ethereum Wallet',
                        network: 'ethereum',
                        isPrimary: false
                    }
                ]
            });

            const response = await request(app)
                .get('/api/wallets/preferences')
                .set('Authorization', `Bearer ${testUser.token}`)
                .expect(200);

            expect(response.body.preferences.primaryWallet).toBeNull();
            expect(response.body.preferences.preferredNetworks).toEqual(['ethereum']);
        });
    });

    describe('POST /detection', () => {
        it('should process wallet detection data successfully', async () => {
            const detectionData = {
                detectedWallets: {
                    evmWallets: [testAddresses.ethereum, testAddresses.polygon],
                    solanaWallets: [testAddresses.solana],
                    bitcoinWallets: [testAddresses.bitcoin]
                }
            };

            const response = await request(app)
                .post('/api/wallets/detection')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send(detectionData)
                .expect(200);

            expect(response.body.message).toBe('Wallet detection data received successfully');

            // Verify detection data was saved
            const userDoc = await adminFirestore.collection('users').doc(testUser.uid).get();
            const userData = userDoc.data();
            expect(userData.lastWalletDetection).toBeDefined();
            expect(userData.lastWalletDetection.evmWallets).toBe(2);
            expect(userData.lastWalletDetection.solanaWallets).toBe(1);
            expect(userData.lastWalletDetection.bitcoinWallets).toBe(1);
            expect(userData.lastWalletDetection.totalDetected).toBe(4);
        });

        it('should return 400 if detection data missing', async () => {
            const response = await request(app)
                .post('/api/wallets/detection')
                .set('Authorization', `Bearer ${testUser.token}`)
                .send({})
                .expect(400);

            expect(response.body.error).toBe('Detected wallets data is required');
        });
    });

    describe('Cross-chain endpoints', () => {
        describe('POST /cross-chain/estimate-fees', () => {
            it('should estimate cross-chain fees successfully', async () => {
                const response = await request(app)
                    .post('/api/wallets/cross-chain/estimate-fees')
                    .send({
                        sourceNetwork: 'ethereum',
                        targetNetwork: 'solana',
                        amount: '1.0'
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('feeEstimate');
                expect(response.body.data).toHaveProperty('isEVMCompatible');
                expect(response.body.data).toHaveProperty('bridgeInfo');
                expect(response.body.data).toHaveProperty('requiresBridge');
                
                expect(crossChainService.estimateTransactionFees).toHaveBeenCalledWith(
                    'ethereum',
                    'solana',
                    '1.0'
                );
            });

            it('should return 400 for missing parameters', async () => {
                const response = await request(app)
                    .post('/api/wallets/cross-chain/estimate-fees')
                    .send({
                        sourceNetwork: 'ethereum'
                    })
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.message).toBe('Source network, target network, and amount are required');
            });
        });

        describe('POST /cross-chain/prepare', () => {
            it('should prepare cross-chain transaction successfully', async () => {
                const transactionData = {
                    fromAddress: testAddresses.ethereum,
                    toAddress: testAddresses.solana,
                    amount: '1.0',
                    sourceNetwork: 'ethereum',
                    targetNetwork: 'solana',
                    dealId: 'deal_123'
                };

                const response = await request(app)
                    .post('/api/wallets/cross-chain/prepare')
                    .send(transactionData)
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('id');
                expect(response.body.data).toHaveProperty('status');
                
                expect(crossChainService.prepareCrossChainTransaction).toHaveBeenCalledWith(
                    expect.objectContaining({
                        ...transactionData,
                        userId: 'anonymous'
                    })
                );
            });

            it('should return 400 for missing parameters', async () => {
                const response = await request(app)
                    .post('/api/wallets/cross-chain/prepare')
                    .send({
                        fromAddress: testAddresses.ethereum
                    })
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.message).toBe('All transaction parameters are required');
            });
        });

        describe('POST /cross-chain/:transactionId/execute-step', () => {
            it('should execute cross-chain step successfully', async () => {
                const response = await request(app)
                    .post('/api/wallets/cross-chain/tx_test_123/execute-step')
                    .send({
                        stepNumber: 1,
                        txHash: '0xabcdef123456'
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('success');
                expect(response.body.data).toHaveProperty('nextStep');
                
                expect(crossChainService.executeCrossChainStep).toHaveBeenCalledWith(
                    'tx_test_123',
                    1,
                    '0xabcdef123456'
                );
            });

            it('should return 400 for missing step number', async () => {
                const response = await request(app)
                    .post('/api/wallets/cross-chain/tx_test_123/execute-step')
                    .send({
                        txHash: '0xabcdef123456'
                    })
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.message).toBe('Step number is required');
            });
        });

        describe('GET /cross-chain/:transactionId/status', () => {
            it('should get cross-chain transaction status successfully', async () => {
                const response = await request(app)
                    .get('/api/wallets/cross-chain/tx_test_123/status')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('id');
                expect(response.body.data).toHaveProperty('status');
                
                expect(crossChainService.getCrossChainTransactionStatus).toHaveBeenCalledWith('tx_test_123');
            });
        });

        describe('GET /cross-chain/networks', () => {
            it('should return supported networks successfully', async () => {
                const response = await request(app)
                    .get('/api/wallets/cross-chain/networks')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.data.networks).toHaveProperty('ethereum');
                expect(response.body.data.networks).toHaveProperty('polygon');
                expect(response.body.data.networks).toHaveProperty('solana');
                expect(response.body.data.networks).toHaveProperty('bitcoin');
                
                expect(response.body.data.networks.ethereum).toEqual({
                    name: 'Ethereum',
                    symbol: 'ETH',
                    isEVM: true
                });
            });
        });
    });

    describe('Error handling', () => {
        it('should handle internal server errors gracefully', async () => {
            // Create a scenario that would cause an internal error
            // by corrupting the user document temporarily
            await adminFirestore.collection('users').doc(testUser.uid).delete();

            const response = await request(app)
                .get('/api/wallets')
                .set('Authorization', `Bearer ${testUser.token}`)
                .expect(404);

            expect(response.body.error).toBe('User profile not found');
        });

        it('should handle cross-chain service errors', async () => {
            crossChainService.estimateTransactionFees.mockRejectedValue(new Error('Service unavailable'));

            const response = await request(app)
                .post('/api/wallets/cross-chain/estimate-fees')
                .send({
                    sourceNetwork: 'ethereum',
                    targetNetwork: 'solana',
                    amount: '1.0'
                })
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Failed to estimate fees');
        });
    });
});

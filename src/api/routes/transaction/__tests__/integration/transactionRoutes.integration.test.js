// src/api/routes/transaction/__tests__/transactionRoutes.test.js
import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';

// Mock the 'ethers' module using unstable mocking for ESM
const mockIsAddress = jest.fn();
const mockGetAddress = jest.fn();
const mockParseUnits = jest.fn();
const mockJsonRpcProvider = jest.fn();
const mockWallet = jest.fn();
const mockContractFactory = jest.fn();
const mockContract = jest.fn();

jest.unstable_mockModule('ethers', () => ({
    __esModule: true,
    isAddress: mockIsAddress,
    getAddress: mockGetAddress,
    parseUnits: mockParseUnits,
    JsonRpcProvider: mockJsonRpcProvider,
    Wallet: mockWallet,
    ContractFactory: mockContractFactory,
    Contract: mockContract,
    ethers: {
        isAddress: mockIsAddress,
        getAddress: mockGetAddress,
        parseUnits: mockParseUnits,
        JsonRpcProvider: mockJsonRpcProvider,
        Wallet: mockWallet,
        ContractFactory: mockContractFactory,
        Contract: mockContract,
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
const { default: transactionRoutes } = await import('../../transactionRoutes.js');

jest.setTimeout(60000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const app = express();
app.use(express.json());
app.use('/api/transactions', transactionRoutes);

let buyer, seller, otherUser;

// MODIFIED: Generate all-lowercase addresses
const generateTestAddress = (prefix = '00') => {
    let randomHex = Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    // Ensure the output is all lowercase
    return `0x${prefix}${randomHex.substring(prefix.length)}`.toLowerCase();
};

// Generate non-EVM addresses for cross-chain testing
const generateSolanaAddress = () => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return Array(44).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const generateBitcoinAddress = () => {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return 'bc1' + Array(39).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
};

beforeAll(async () => {
    console.log(`[TEST SETUP] Starting Transaction tests with Project ID: ${PROJECT_ID}`);
    await cleanUp();
}, 60000);

afterAll(async () => {
    console.log('[TEST TEARDOWN] Cleaning up after all transaction tests.');
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

    // Reset and configure mocks for each test.
    // This should now control the behavior of the 'isAddress' imported by transactionRoutes.js
    mockIsAddress.mockReset().mockReturnValue(true);
    mockGetAddress.mockReset().mockImplementation(addr => addr);
    mockParseUnits.mockReset().mockImplementation((value, decimals) => {
        const numValue = parseFloat(String(value));
        if (isNaN(numValue) || !isFinite(numValue)) {
            throw new Error(`Mock parseUnits: Invalid number value "${value}"`);
        }
        
        // Handle 'ether' and other string units
        let decimalPlaces = 18; // Default for 'ether'
        if (typeof decimals === 'number') {
            decimalPlaces = decimals;
        } else if (decimals === 'ether') {
            decimalPlaces = 18;
        } else if (decimals === 'gwei') {
            decimalPlaces = 9;
        } else if (decimals === 'wei') {
            decimalPlaces = 0;
        }
        
        // Use string arithmetic to avoid precision issues with large numbers
        const multiplier = '1' + '0'.repeat(decimalPlaces);
        const intValue = Math.floor(numValue * Math.pow(10, Math.min(decimalPlaces, 15))); // Limit precision
        
        if (decimalPlaces <= 15) {
            return BigInt(intValue);
        } else {
            // For larger decimal places like ether (18), multiply by remaining power of 10
            const remaining = decimalPlaces - 15;
            return BigInt(intValue) * BigInt('1' + '0'.repeat(remaining));
        }
    });
    
    // Reset other ethers mocks
    mockJsonRpcProvider.mockReset();
    mockWallet.mockReset();
    mockContractFactory.mockReset();
    mockContract.mockReset();

    // Reset cross-chain service mocks
    crossChainService.areNetworksEVMCompatible.mockReset();
    crossChainService.getBridgeInfo.mockReset();
    crossChainService.estimateTransactionFees.mockReset();
    crossChainService.prepareCrossChainTransaction.mockReset();
    crossChainService.executeCrossChainStep.mockReset();
    crossChainService.getCrossChainTransactionStatus.mockReset();

    try {
        const timestamp = Date.now();
        buyer = await createTestUser(`buyer.tx.${timestamp}@example.com`, {
            first_name: 'BuyerTx',
            wallets: [generateTestAddress('aa')] // Use lowercase prefix too
        });
        seller = await createTestUser(`seller.tx.${timestamp}@example.com`, {
            first_name: 'SellerTx',
            wallets: [generateTestAddress('bb')]
        });
        otherUser = await createTestUser(`other.tx.${timestamp}@example.com`, {
            first_name: 'OtherTx',
            wallets: [generateTestAddress('cc')]
        });

        if (!buyer || !buyer.token || !buyer.wallets || buyer.wallets.length === 0) {
            throw new Error('TEST SETUP FAIL: Buyer creation/token fetch failed or buyer has no wallet.');
        }
        if (!seller || !seller.token || !seller.wallets || seller.wallets.length === 0) {
            throw new Error('TEST SETUP FAIL: Seller creation/token fetch failed or seller has no wallet.');
        }
    } catch (error) {
        console.error("CRITICAL FAILURE in beforeEach (Transaction Tests):", error.message, error.stack);
        throw error;
    }
});

describe('Transaction Routes API (/api/transactions)', () => {
    describe('POST /create', () => {
        const validDealDataBase = {
            propertyAddress: '123 Main St, Anytown, USA',
            amount: 1.5,
            initialConditions: [{ id: 'inspection', type: 'INSPECTION', description: 'Property inspection contingency' }]
        };

        it('should create a new transaction successfully (initiated by BUYER, no contract deployment)', async () => {
            const oldDeployerKey = process.env.DEPLOYER_PRIVATE_KEY;
            const oldRpcUrl = process.env.RPC_URL;
            delete process.env.DEPLOYER_PRIVATE_KEY;
            delete process.env.RPC_URL;

            const dealData = {
                ...validDealDataBase,
                initiatedBy: 'BUYER',
                otherPartyEmail: seller.email,
                buyerWalletAddress: buyer.wallets[0],
                sellerWalletAddress: seller.wallets[0]
            };

            // Mock cross-chain service to indicate EVM-to-EVM (no cross-chain)
            crossChainService.areNetworksEVMCompatible.mockReturnValue(true);

            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${buyer.token}`)
                .send(dealData);
            
            if (response.status !== 201) {
                console.log('[TEST FAILURE DIAGNOSIS] Buyer-initiated create - Response Status:', response.status);
                console.log('[TEST FAILURE DIAGNOSIS] Buyer-initiated create - Response Body:', JSON.stringify(response.body, null, 2));
            }

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message', 'Transaction initiated successfully.');
            expect(response.body.status).toBe('PENDING_SELLER_REVIEW');
            expect(response.body.smartContractAddress).toBeNull();
            expect(response.body.isCrossChain).toBe(false);

            if (oldDeployerKey !== undefined) process.env.DEPLOYER_PRIVATE_KEY = oldDeployerKey;
            if (oldRpcUrl !== undefined) process.env.RPC_URL = oldRpcUrl;
        });

        it('should create a cross-chain transaction successfully (ETH to Solana)', async () => {
            const oldDeployerKey = process.env.DEPLOYER_PRIVATE_KEY;
            const oldRpcUrl = process.env.RPC_URL;
            delete process.env.DEPLOYER_PRIVATE_KEY;
            delete process.env.RPC_URL;

            const solanaAddress = generateSolanaAddress();
            
            const crossChainDealData = {
                ...validDealDataBase,
                initiatedBy: 'BUYER',
                otherPartyEmail: seller.email,
                buyerWalletAddress: buyer.wallets[0], // ETH address
                sellerWalletAddress: solanaAddress   // Solana address
            };

            // Mock cross-chain service responses
            crossChainService.areNetworksEVMCompatible.mockReturnValue(false);
            crossChainService.getBridgeInfo.mockReturnValue({
                bridge: 'wormhole',
                estimatedTime: '15-45 minutes',
                fees: '0.005-0.05 ETH'
            });
            crossChainService.prepareCrossChainTransaction.mockResolvedValue({
                id: 'cross_chain_tx_123',
                needsBridge: true,
                steps: [
                    { step: 1, action: 'lock_funds_source', status: 'pending' },
                    { step: 2, action: 'bridge_transfer', status: 'pending' },
                    { step: 3, action: 'release_funds_target', status: 'pending' }
                ]
            });

            // Mock custom validation for cross-chain addresses
            mockIsAddress.mockImplementation(addr => {
                // Return true for ETH addresses, false for Solana (but route should handle this)
                return addr.startsWith('0x');
            });

            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${buyer.token}`)
                .send(crossChainDealData);

            if (response.status !== 201) {
                console.log('[TEST FAILURE DIAGNOSIS] Cross-chain create - Response Status:', response.status);
                console.log('[TEST FAILURE DIAGNOSIS] Cross-chain create - Response Body:', JSON.stringify(response.body, null, 2));
            }

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message', 'Transaction initiated successfully.');
            expect(response.body.isCrossChain).toBe(true);
            expect(response.body.crossChainInfo).toMatchObject({
                buyerNetwork: 'ethereum',
                sellerNetwork: 'solana',
                bridgeInfo: expect.objectContaining({
                    bridge: 'wormhole'
                })
            });

            // Verify cross-chain conditions were automatically added
            const dealId = response.body.transactionId;
            const dealDoc = await adminFirestore.collection('deals').doc(dealId).get();
            const dealDocData = dealDoc.data();
            
            const crossChainConditions = dealDocData.conditions.filter(c => c.type === 'CROSS_CHAIN');
            expect(crossChainConditions.length).toBeGreaterThan(0);
            expect(crossChainConditions).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    id: 'cross_chain_network_validation',
                    type: 'CROSS_CHAIN'
                }),
                expect.objectContaining({
                    id: 'cross_chain_bridge_setup',
                    type: 'CROSS_CHAIN'
                })
            ]));

            if (oldDeployerKey !== undefined) process.env.DEPLOYER_PRIVATE_KEY = oldDeployerKey;
            if (oldRpcUrl !== undefined) process.env.RPC_URL = oldRpcUrl;
        });

        it('should create a cross-chain transaction successfully (ETH to Bitcoin)', async () => {
            const bitcoinAddress = generateBitcoinAddress();
            
            const dealData = {
                ...validDealDataBase,
                initiatedBy: 'SELLER',
                otherPartyEmail: buyer.email,
                buyerWalletAddress: buyer.wallets[0], // ETH address
                sellerWalletAddress: bitcoinAddress   // Bitcoin address
            };

            // Mock cross-chain service responses
            crossChainService.areNetworksEVMCompatible.mockReturnValue(false);
            crossChainService.getBridgeInfo.mockReturnValue({
                bridge: 'multichain',
                estimatedTime: '30-60 minutes',
                fees: '0.01-0.1 ETH'
            });
            crossChainService.prepareCrossChainTransaction.mockResolvedValue({
                id: 'cross_chain_tx_456',
                needsBridge: true
            });

            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${seller.token}`)
                .send(dealData);

            expect(response.status).toBe(201);
            expect(response.body.isCrossChain).toBe(true);
            expect(response.body.crossChainInfo).toMatchObject({
                buyerNetwork: 'ethereum',
                sellerNetwork: 'bitcoin',
                bridgeInfo: expect.objectContaining({
                    bridge: 'multichain'
                })
            });
        });

        it('should handle EVM-to-EVM transactions as standard (not cross-chain)', async () => {
            const polygonAddress = generateTestAddress('99'); // Different EVM address
            
            const dealData = {
                ...validDealDataBase,
                initiatedBy: 'BUYER',
                otherPartyEmail: seller.email,
                buyerWalletAddress: buyer.wallets[0], // ETH address
                sellerWalletAddress: polygonAddress   // Different EVM address
            };

            // Mock that both are EVM compatible
            crossChainService.areNetworksEVMCompatible.mockReturnValue(true);
            crossChainService.getBridgeInfo.mockReturnValue(null);

            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${buyer.token}`)
                .send(dealData);

            expect(response.status).toBe(201);
            expect(response.body.isCrossChain).toBe(false); // EVM-to-EVM is not considered cross-chain
            expect(response.body.crossChainInfo).toBeNull();
        });

        it('should create a new transaction successfully (initiated by SELLER, no contract deployment)', async () => {
            const oldDeployerKey = process.env.DEPLOYER_PRIVATE_KEY;
            const oldRpcUrl = process.env.RPC_URL;
            delete process.env.DEPLOYER_PRIVATE_KEY;
            delete process.env.RPC_URL;

            const dealData = {
                ...validDealDataBase,
                initiatedBy: 'SELLER',
                otherPartyEmail: buyer.email,
                buyerWalletAddress: buyer.wallets[0],
                sellerWalletAddress: seller.wallets[0]
            };

            // Mock EVM-to-EVM
            crossChainService.areNetworksEVMCompatible.mockReturnValue(true);

            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${seller.token}`)
                .send(dealData);

            if (response.status !== 201) {
                console.log('[TEST FAILURE DIAGNOSIS] Seller-initiated create - Response Status:', response.status);
                console.log('[TEST FAILURE DIAGNOSIS] Seller-initiated create - Response Body:', JSON.stringify(response.body, null, 2));
            }

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('PENDING_BUYER_REVIEW');
            expect(response.body.smartContractAddress).toBeNull();

            if (oldDeployerKey !== undefined) process.env.DEPLOYER_PRIVATE_KEY = oldDeployerKey;
            if (oldRpcUrl !== undefined) process.env.RPC_URL = oldRpcUrl;
        });

        it('should return 400 for invalid "initiatedBy"', async () => {
            const dealData = { ...validDealDataBase, initiatedBy: 'INVALID_ROLE', otherPartyEmail: seller.email, buyerWalletAddress: buyer.wallets[0], sellerWalletAddress: seller.wallets[0] };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid "initiatedBy"');
        });

        it('should return 400 if buyer and seller wallet addresses are the same', async () => {
            const sameWallet = buyer.wallets[0];

            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', buyerWalletAddress: sameWallet, sellerWalletAddress: sameWallet, otherPartyEmail: seller.email };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            
            if (response.status !== 400 || !response.body.error.includes('Buyer and Seller wallet addresses cannot be the same')) {
                 console.log('[TEST FAILURE DIAGNOSIS] Same Wallet - Response Status:', response.status);
                 console.log('[TEST FAILURE DIAGNOSIS] Same Wallet - Response Body:', JSON.stringify(response.body, null, 2));
            }
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Buyer and Seller wallet addresses cannot be the same');
        });

        it('should return 400 for missing propertyAddress', async () => {
            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', otherPartyEmail: seller.email, buyerWalletAddress: buyer.wallets[0], sellerWalletAddress: seller.wallets[0] };
            delete dealData.propertyAddress;
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Property address is required');
        });

        it('should return 400 for invalid amount (negative)', async () => {
            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', amount: -100, otherPartyEmail: seller.email, buyerWalletAddress: buyer.wallets[0], sellerWalletAddress: seller.wallets[0] };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Amount must be a positive finite number');
        });

        it('should return 400 for invalid amount (zero)', async () => {
            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', amount: 0, otherPartyEmail: seller.email, buyerWalletAddress: buyer.wallets[0], sellerWalletAddress: seller.wallets[0] };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Amount must be a positive finite number');
        });

        it('should return 400 for invalid buyerWalletAddress', async () => {
            const invalidWalletFormat = '0x123notanaddress';
            
            // Specific mock setup for this test case
            mockIsAddress.mockImplementation(addr => {
                if (addr === invalidWalletFormat) return false;
                return true;
            });

            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', buyerWalletAddress: invalidWalletFormat, otherPartyEmail: seller.email, sellerWalletAddress: seller.wallets[0] };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Valid buyer wallet address is required');
        });

        it('should return 404 if otherPartyEmail not found', async () => {
            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', otherPartyEmail: 'nonexistent.tx.user@example.com', buyerWalletAddress: buyer.wallets[0], sellerWalletAddress: seller.wallets[0] };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);

            if (response.status !== 404) {
                console.log('[TEST FAILURE DIAGNOSIS] OtherPartyEmail Not Found - Response Status:', response.status);
                console.log('[TEST FAILURE DIAGNOSIS] OtherPartyEmail Not Found - Response Body:', JSON.stringify(response.body, null, 2));
            }
            expect(response.status).toBe(404);
            expect(response.body.error).toContain('User with email nonexistent.tx.user@example.com not found');
        });

        it('should return 401 if not authenticated', async () => {
            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', otherPartyEmail: seller.email, buyerWalletAddress: buyer.wallets[0], sellerWalletAddress: seller.wallets[0] };
            const response = await request(app).post('/api/transactions/create').send(dealData);
            expect(response.status).toBe(401);
        });
    });

    // Cross-chain transaction management tests
    describe('Cross-Chain Transaction Management', () => {
        let crossChainDealId;

        beforeEach(async () => {
            // Create a cross-chain deal for testing
            const dealData = {
                propertyAddress: 'Cross-Chain Property',
                amount: 2.5,
                sellerId: seller.uid,
                buyerId: buyer.uid,
                participants: [seller.uid, buyer.uid],
                status: 'AWAITING_CONDITION_FULFILLMENT',
                isCrossChain: true,
                crossChainTransactionId: 'cross_chain_tx_test',
                buyerNetwork: 'ethereum',
                sellerNetwork: 'solana',
                crossChainInfo: {
                    bridge: 'wormhole',
                    estimatedTime: '15-45 minutes'
                },
                conditions: [
                    {
                        id: 'cross_chain_network_validation',
                        type: 'CROSS_CHAIN',
                        description: 'Network compatibility validated (ethereum to solana)',
                        status: 'PENDING_BUYER_ACTION',
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    },
                    {
                        id: 'cross_chain_funds_locked',
                        type: 'CROSS_CHAIN',
                        description: 'Funds locked on source network (ethereum)',
                        status: 'PENDING_BUYER_ACTION',
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    },
                    {
                        id: 'inspection',
                        type: 'CUSTOM',
                        description: 'Property inspection',
                        status: 'PENDING_BUYER_ACTION',
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    }
                ],
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                timeline: [
                    { event: 'Cross-chain transaction created', timestamp: Timestamp.now() }
                ]
            };

            const dealRef = await adminFirestore.collection('deals').add(dealData);
            crossChainDealId = dealRef.id;
        });

        it('should execute cross-chain transaction step and auto-fulfill conditions', async () => {
            // Mock cross-chain service response
            crossChainService.executeCrossChainStep.mockResolvedValue({
                success: true,
                status: 'in_progress',
                stepCompleted: {
                    step: 1,
                    action: 'lock_funds_source',
                    status: 'completed',
                    conditionMapping: 'cross_chain_funds_locked'
                },
                allStepsCompleted: false
            });

            const response = await request(app)
                .post(`/api/transactions/cross-chain/${crossChainDealId}/execute-step`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({
                    stepNumber: 1,
                    txHash: '0xabc123def456'
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                message: 'Cross-chain step 1 executed successfully',
                status: 'in_progress',
                txHash: '0xabc123def456'
            });

            // Verify the cross-chain service was called
            expect(crossChainService.executeCrossChainStep).toHaveBeenCalledWith(
                'cross_chain_tx_test',
                1,
                '0xabc123def456'
            );
        });

        it('should get cross-chain transaction status with deal integration', async () => {
            // Mock cross-chain service response
            crossChainService.getCrossChainTransactionStatus.mockResolvedValue({
                id: 'cross_chain_tx_test',
                status: 'in_progress',
                progressPercentage: 66,
                nextAction: 'Next: Bridge transfer via wormhole',
                steps: [
                    { step: 1, status: 'completed' },
                    { step: 2, status: 'pending' },
                    { step: 3, status: 'pending' }
                ],
                dealStatus: {
                    dealId: crossChainDealId,
                    dealStatus: 'AWAITING_CONDITION_FULFILLMENT',
                    crossChainConditions: expect.any(Array),
                    allConditionsFulfilled: false
                }
            });

            const response = await request(app)
                .get(`/api/transactions/cross-chain/${crossChainDealId}/status`)
                .set('Authorization', `Bearer ${buyer.token}`);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                dealId: crossChainDealId,
                crossChainTransaction: expect.objectContaining({
                    id: 'cross_chain_tx_test',
                    status: 'in_progress',
                    progressPercentage: 66
                }),
                buyerNetwork: 'ethereum',
                sellerNetwork: 'solana',
                bridgeInfo: expect.objectContaining({
                    bridge: 'wormhole'
                })
            });
        });

        it('should handle cross-chain fund transfer for completed conditions', async () => {
            // First, mark all conditions as fulfilled
            const updatedConditions = [
                {
                    id: 'cross_chain_network_validation',
                    type: 'CROSS_CHAIN',
                    status: 'FULFILLED_BY_BUYER',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                },
                {
                    id: 'cross_chain_funds_locked',
                    type: 'CROSS_CHAIN',
                    status: 'FULFILLED_BY_BUYER',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                },
                {
                    id: 'inspection',
                    type: 'CUSTOM',
                    status: 'FULFILLED_BY_BUYER',
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now()
                }
            ];

            await adminFirestore.collection('deals').doc(crossChainDealId).update({
                conditions: updatedConditions
            });

            // Mock cross-chain service response
            crossChainService.getCrossChainTransactionStatus.mockResolvedValue({
                id: 'cross_chain_tx_test',
                status: 'completed',
                needsBridge: true,
                steps: [
                    { step: 1, status: 'completed', txHash: '0x123' },
                    { step: 2, status: 'completed', txHash: '0x456' },
                    { step: 3, status: 'completed', txHash: '0x789' }
                ]
            });

            const response = await request(app)
                .post(`/api/transactions/cross-chain/${crossChainDealId}/transfer`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({
                    fromTxHash: '0x123abc',
                    bridgeTxHash: '0x456def'
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                message: 'Cross-chain transfer initiated successfully',
                dealId: crossChainDealId,
                fromTxHash: '0x123abc',
                bridgeTxHash: '0x456def',
                requiresBridge: true
            });
        });

        it('should estimate cross-chain transaction fees', async () => {
            // Mock cross-chain service responses
            crossChainService.estimateTransactionFees.mockResolvedValue({
                sourceNetworkFee: '0.002',
                targetNetworkFee: '0.001',
                bridgeFee: '0.01',
                totalEstimatedFee: '0.013'
            });
            crossChainService.getBridgeInfo.mockReturnValue({
                bridge: 'wormhole',
                estimatedTime: '15-45 minutes',
                fees: '0.005-0.05 ETH'
            });
            crossChainService.areNetworksEVMCompatible.mockReturnValue(false);

            const response = await request(app)
                .get('/api/transactions/cross-chain/estimate-fees')
                .set('Authorization', `Bearer ${buyer.token}`)
                .query({
                    sourceNetwork: 'ethereum',
                    targetNetwork: 'solana',
                    amount: '1.5'
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                sourceNetwork: 'ethereum',
                targetNetwork: 'solana',
                amount: '1.5',
                isEVMCompatible: false,
                bridgeInfo: expect.objectContaining({
                    bridge: 'wormhole'
                }),
                feeEstimate: expect.objectContaining({
                    totalEstimatedFee: '0.013'
                })
            });
        });

        it('should update cross-chain conditions with transaction hash integration', async () => {
            // Mock cross-chain service
            crossChainService.executeCrossChainStep.mockResolvedValue({
                success: true,
                status: 'completed'
            });

            const response = await request(app)
                .patch(`/api/transactions/conditions/cross_chain_funds_locked/buyer-review`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({
                    dealId: crossChainDealId,
                    status: 'FULFILLED_BY_BUYER',
                    notes: 'Funds locked on Ethereum',
                    crossChainTxHash: '0xethereumtxhash123',
                    crossChainStepNumber: 1
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                message: 'Condition updated successfully',
                conditionId: 'cross_chain_funds_locked',
                status: 'FULFILLED_BY_BUYER',
                isCrossChain: true
            });

            // Verify cross-chain step was executed
            expect(crossChainService.executeCrossChainStep).toHaveBeenCalledWith(
                'cross_chain_tx_test',
                1,
                '0xethereumtxhash123'
            );
        });
    });

    describe('GET /:transactionId', () => {
        let transactionId;
        beforeEach(async () => {
            const dealRef = await adminFirestore.collection('deals').add({
                propertyAddress: 'Test Prop GetByID', amount: 1.23,
                sellerId: seller.uid, buyerId: buyer.uid,
                participants: [seller.uid, buyer.uid], status: 'PENDING_SELLER_REVIEW',
                createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                timeline: [{ event: 'Created', timestamp: Timestamp.now() }],
                conditions: [{ id: 'c1', description: 'Condition 1', status: 'PENDING_BUYER_ACTION', type: 'CUSTOM' }],
                buyerWalletAddress: buyer.wallets[0],
                sellerWalletAddress: seller.wallets[0],
            });
            transactionId = dealRef.id;
        });

        it('should fetch a transaction successfully if user is a participant (buyer)', async () => {
            const response = await request(app).get(`/api/transactions/${transactionId}`).set('Authorization', `Bearer ${buyer.token}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(transactionId);
        });
        it('should fetch a transaction successfully if user is a participant (seller)', async () => {
            const response = await request(app).get(`/api/transactions/${transactionId}`).set('Authorization', `Bearer ${seller.token}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(transactionId);
        });
        it('should return 403 if user is not a participant', async () => {
            const response = await request(app).get(`/api/transactions/${transactionId}`).set('Authorization', `Bearer ${otherUser.token}`);
            expect(response.status).toBe(403);
        });
        it('should return 404 if transaction not found', async () => {
            const response = await request(app).get(`/api/transactions/nonexistentdealid`).set('Authorization', `Bearer ${buyer.token}`);
            expect(response.status).toBe(404);
        });
        it('should return 401 if not authenticated', async () => {
            const response = await request(app).get(`/api/transactions/${transactionId}`);
            expect(response.status).toBe(401);
        });
    });

    describe('POST /:transactionId/sc/raise-dispute', () => {
        let dealId;
        const disputeDeadlineISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const conditionIdForDispute = 'cond_for_dispute';

        beforeEach(async () => {
            const dealData = {
                buyerId: buyer.uid, sellerId: seller.uid, participants: [buyer.uid, seller.uid],
                status: 'IN_FINAL_APPROVAL',
                conditions: [{ id: conditionIdForDispute, description: 'Disputed condition', status: 'FULFILLED_BY_BUYER', type: 'CUSTOM', createdAt: Timestamp.now(), updatedAt: Timestamp.now() }],
                timeline: [], createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                buyerWalletAddress: buyer.wallets[0], sellerWalletAddress: seller.wallets[0],
            };
            const dealRef = await adminFirestore.collection('deals').add(dealData);
            dealId = dealRef.id;
        });

        it('should sync dispute raised by buyer successfully', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ disputeResolutionDeadlineISO: disputeDeadlineISO, conditionId: conditionIdForDispute });
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Backend synced: Dispute raised.");
            const dealDoc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(dealDoc.data().status).toBe('IN_DISPUTE');
        });

        it('should return 403 if non-buyer tries to raise dispute via this sync', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${seller.token}`) 
                .send({ disputeResolutionDeadlineISO: disputeDeadlineISO, conditionId: conditionIdForDispute });
            expect(response.status).toBe(403);
            expect(response.body.error).toBe("Only the buyer can raise a dispute via this sync endpoint.");
        });

        it('should return 400 if deal is already IN_DISPUTE', async () => {
            await adminFirestore.collection('deals').doc(dealId).update({ status: 'IN_DISPUTE' });
            await delay(200); 
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ disputeResolutionDeadlineISO: disputeDeadlineISO, conditionId: conditionIdForDispute });
            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/Deal is not in a state where a dispute can be raised \(current status: IN_DISPUTE\)/);
        });

        it('should return 400 if deal is COMPLETED', async () => {
            await adminFirestore.collection('deals').doc(dealId).update({ status: 'COMPLETED' });
            await delay(200); 
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ disputeResolutionDeadlineISO: disputeDeadlineISO, conditionId: conditionIdForDispute });
            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/Deal is not in a state where a dispute can be raised \(current status: COMPLETED\)/);
        });

        it('should return 400 if disputeResolutionDeadlineISO is missing', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ conditionId: conditionIdForDispute }); 
            expect(response.status).toBe(400);
            expect(response.body.error).toBe("disputeResolutionDeadlineISO is required (ISO string format).");
        });
    });
});

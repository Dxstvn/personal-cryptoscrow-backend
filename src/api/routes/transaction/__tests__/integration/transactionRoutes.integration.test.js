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

// Now import everything else after setting up the mock
const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { Timestamp } = await import('firebase-admin/firestore');
const { adminFirestore, PROJECT_ID } = await import('../../../../../../jest.emulator.setup.js');
const { deleteAdminApp } = await import('../../../auth/admin.js');
const { createTestUser, cleanUp } = await import('../../../../../helperFunctions.js');

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

            // console.log(`[TEST LOG] Buyer Create - Buyer Wallet: ${buyer.wallets[0]}, Seller Wallet: ${seller.wallets[0]}`);
            // console.log(`[TEST LOG] Buyer Create - Is mockIsAddress the same? ${jest.isMockFunction(mockIsAddress)}`);


            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${buyer.token}`)
                .send(dealData);
            
            if (response.status !== 201) {
                console.log('[TEST FAILURE DIAGNOSIS] Buyer-initiated create - Response Status:', response.status);
                console.log('[TEST FAILURE DIAGNOSIS] Buyer-initiated create - Response Body:', JSON.stringify(response.body, null, 2));
                // console.log('[TEST FAILURE DIAGNOSIS] mockIsAddress call count:', mockIsAddress.mock.calls.length);
                // console.log('[TEST FAILURE DIAGNOSIS] mockIsAddress calls:', mockIsAddress.mock.calls);
            }

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message', 'Transaction initiated successfully.');
            expect(response.body.status).toBe('PENDING_SELLER_REVIEW');
            expect(response.body.smartContractAddress).toBeNull();

            if (oldDeployerKey !== undefined) process.env.DEPLOYER_PRIVATE_KEY = oldDeployerKey;
            if (oldRpcUrl !== undefined) process.env.RPC_URL = oldRpcUrl;
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
            // mockIsAddress is already set to return true by default in beforeEach

            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', buyerWalletAddress: sameWallet, sellerWalletAddress: sameWallet, otherPartyEmail: seller.email };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            
            if (response.status !== 400 || !response.body.error.includes('Buyer and Seller wallet addresses cannot be the same')) {
                 console.log('[TEST FAILURE DIAGNOSIS] Same Wallet - Response Status:', response.status);
                 console.log('[TEST FAILURE DIAGNOSIS] Same Wallet - Response Body:', JSON.stringify(response.body, null, 2));
                //  console.log('[TEST FAILURE DIAGNOSIS] mockIsAddress call count for same wallet:', mockIsAddress.mock.calls.length);
                //  console.log('[TEST FAILURE DIAGNOSIS] mockIsAddress calls for same wallet:', mockIsAddress.mock.calls);

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
            const invalidWalletFormat = '0x123notanaddress'; // all lowercase but clearly invalid
            
            // Specific mock setup for this test case
            mockIsAddress.mockImplementation(addr => {
                if (addr === invalidWalletFormat) return false; // Explicitly false for this one
                return true; // True for any other address (like the seller's)
            });

            const dealData = { ...validDealDataBase, initiatedBy: 'BUYER', buyerWalletAddress: invalidWalletFormat, otherPartyEmail: seller.email, sellerWalletAddress: seller.wallets[0] };
            const response = await request(app).post('/api/transactions/create').set('Authorization', `Bearer ${buyer.token}`).send(dealData);
            
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Valid buyer wallet address is required');
        });

        it('should return 404 if otherPartyEmail not found', async () => {
            // Default mockIsAddress.mockReturnValue(true) from beforeEach should apply
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

    // --- GET /:transactionId ---
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

    // --- POST /:transactionId/sc/raise-dispute ---
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

// src/api/routes/transaction/__tests__/transactionRoutes.test.js
import request from 'supertest';
import express from 'express';
import { isAddress, getAddress, parseUnits } from 'ethers';
import transactionRoutes from '../transactionRoutes.js';
import { jest, describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import fetch from 'node-fetch';

// --- Emulator Setup Imports ---
import {
    adminAuth,
    adminFirestore,
    PROJECT_ID,
    adminApp as testAdminApp
} from '../../../../../jest.emulator.setup.js';

// Import the deleteAdminApp function from your actual admin.js
import { deleteAdminApp } from '../../auth/admin.js';

// Create mock functions
const mockIsAddress = jest.fn();
const mockGetAddress = jest.fn();
const mockParseUnits = jest.fn();

// Mock ethers module
jest.mock('ethers', () => ({
    isAddress: mockIsAddress,
    getAddress: mockGetAddress,
    parseUnits: mockParseUnits
}));

// --- Express App Setup ---
const app = express();
app.use(express.json());
app.use('/api/transactions', transactionRoutes);

// --- Constants for Test Helpers ---
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const DUMMY_API_KEY = 'demo-api-key';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:5004';

// --- Test Helper Functions ---
async function createTestUser(email, profileData = {}) {
    if (DUMMY_API_KEY === 'demo-api-key' || DUMMY_API_KEY === 'your-firebase-project-web-api-key') {
        console.warn("DUMMY_API_KEY is using a generic placeholder. Ensure this is a valid Web API Key for your Firebase project for the Auth emulator REST API to work reliably.");
    }
    const userRecord = await adminAuth.createUser({ email, password: 'testpass' });
    await adminFirestore.collection('users').doc(userRecord.uid).set({
        email: email.toLowerCase(),
        first_name: profileData.first_name || 'Test',
        last_name: profileData.last_name || 'User',
        phone_number: profileData.phone_number || '1234567890',
        wallets: profileData.wallets || ['wallet1', 'wallet2'],
        createdAt: adminFirestore.FieldValue.serverTimestamp(),
    });

    const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${DUMMY_API_KEY}`;
    let response;
    try {
        response = await fetch(signInUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'testpass', returnSecureToken: true }),
        });
        const data = await response.json();
        if (!response.ok || !data.idToken) {
            console.error('Failed Test User Sign-In:', { status: response.status, body: data, signInUrl });
            throw new Error(`Failed to get token for ${email}. Status: ${response.status}. Ensure DUMMY_API_KEY is correct and Auth emulator is running.`);
        }
        return { uid: userRecord.uid, token: data.idToken, email: email.toLowerCase() };
    } catch (error) {
        console.error(`Error creating test user ${email}:`, error);
        await adminAuth.deleteUser(userRecord.uid).catch(delErr => console.error("Cleanup error after failed token fetch:", delErr));
        if (!response) throw new Error(`Network error fetching token at ${signInUrl}. Is the Auth emulator running at ${AUTH_EMULATOR_HOST}?`);
        throw error;
    }
}

async function cleanUp() {
    try {
        const usersList = await adminAuth.listUsers(1000);
        if (usersList.users.length > 0) {
            const deleteUserPromises = usersList.users.map(user => adminAuth.deleteUser(user.uid));
            await Promise.all(deleteUserPromises);
        }
    } catch (error) {
        if (error.code !== 'auth/internal-error' && !error.message?.includes('find a running emulator')) {
            console.warn("Cleanup warning (Auth):", error.message);
        }
    }

    try {
        const collectionsToClear = ['deals', 'users', 'contactInvitations'];
        for (const collectionName of collectionsToClear) {
            const snapshot = await adminFirestore.collection(collectionName).limit(500).get();
            if (!snapshot.empty) {
                const batch = adminFirestore.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        }
    } catch (error) {
        if (!error.message?.includes('find a running emulator')) {
            console.warn("Cleanup warning (Firestore):", error.message);
        }
    }
}

// Mock contractDeployer
const mockDeployPropertyEscrowContract = jest.fn();
jest.mock('../../deployContract/contractDeployer.js', () => ({
    deployPropertyEscrowContract: mockDeployPropertyEscrowContract,
}));

// --- Global Test Hooks ---
beforeAll(async () => {
    jest.resetModules(); // Clear module cache
    if (DUMMY_API_KEY === 'demo-api-key' || DUMMY_API_KEY === 'your-firebase-project-web-api-key') {
        console.error("WARNING: DUMMY_API_KEY is using a generic placeholder. Tests involving user creation/sign-in might fail if this is not a valid Web API Key for your Firebase project (even when using emulators).");
    }
});

afterAll(async () => {
    await cleanUp();
    await deleteAdminApp();
});

beforeEach(async () => {
    await cleanUp();
    jest.clearAllMocks();

    // Configure mock implementations
    mockIsAddress.mockImplementation((addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42);
    mockGetAddress.mockImplementation(addr => addr);
    mockParseUnits.mockImplementation((value, decimals = 18) => {
        const numDecimals = typeof decimals === 'string' ? (decimals === 'ether' ? 18 : parseInt(decimals, 10)) : decimals;
        const parts = String(value).split('.');
        const integerPart = parts[0];
        const fractionalPart = parts[1] || '';
        const scaledFractional = fractionalPart.substring(0, numDecimals).padEnd(numDecimals, '0');
        return BigInt(integerPart + scaledFractional);
    });

    mockDeployPropertyEscrowContract.mockResolvedValue('0xMockDeployedContractAddress12345');
});

// --- Tests ---
describe('Transaction Routes (Emulator Integrated)', () => {
    describe('POST /api/transactions/create', () => {
        let initiatorUser, otherPartyUser;

        beforeEach(async () => {
            initiatorUser = await createTestUser('initiator@example.com', { first_name: 'Initiator', wallets: ['0xInitiatorWallet'] });
            otherPartyUser = await createTestUser('otherparty@example.com', { first_name: 'OtherParty', wallets: ['0xOtherPartyWallet'] });
        });

        const getValidTransactionData = () => ({
            initiatedBy: 'BUYER',
            propertyAddress: '123 Test St, Anytown, USA',
            amount: 1.5,
            otherPartyEmail: otherPartyUser.email,
            buyerWalletAddress: '0xBuyer000000000000000000000000000000000001',
            sellerWalletAddress: '0xSeller00000000000000000000000000000000002',
            initialConditions: [{ id: 'cond1', description: 'Home inspection passes', type: 'INSPECTION' }],
        });

        it('should create a transaction with valid data and deploy contract', async () => {
            const transactionData = getValidTransactionData();
            const expectedWei = BigInt('1500000000000000000');
            parseUnits.mockReturnValue(expectedWei);

            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send(transactionData);

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Transaction initiated successfully.');
            expect(response.body.transactionId).toBeDefined();
            expect(response.body.smartContractAddress).toBe('0xMockDeployedContractAddress12345');

            const dealDoc = await adminFirestore.collection('deals').doc(response.body.transactionId).get();
            expect(dealDoc.exists).toBe(true);
            const dealData = dealDoc.data();
            expect(dealData.buyerId).toBe(initiatorUser.uid);
            expect(dealData.sellerId).toBe(otherPartyUser.uid);
            expect(dealData.escrowAmountWei).toBe(expectedWei.toString());
            expect(dealData.status).toBe('AWAITING_CONDITION_SETUP');

            expect(mockDeployPropertyEscrowContract).toHaveBeenCalledWith(
                transactionData.sellerWalletAddress,
                transactionData.buyerWalletAddress,
                expectedWei.toString(),
                process.env.DEPLOYER_PRIVATE_KEY,
                process.env.RPC_URL
            );
            expect(isAddress).toHaveBeenCalledWith(transactionData.buyerWalletAddress);
            expect(isAddress).toHaveBeenCalledWith(transactionData.sellerWalletAddress);
            expect(getAddress).toHaveBeenCalledWith(transactionData.buyerWalletAddress);
            expect(getAddress).toHaveBeenCalledWith(transactionData.sellerWalletAddress);
            expect(parseUnits).toHaveBeenCalledWith(String(transactionData.amount), 'ether');
        });

        it('should return 400 for invalid initiatedBy', async () => {
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send({ ...getValidTransactionData(), initiatedBy: 'INVALID' });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid "initiatedBy"');
        });

        it('should return 400 for missing propertyAddress', async () => {
            const data = getValidTransactionData();
            delete data.propertyAddress;
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send(data);
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Property address');
        });

        it('should return 400 for invalid amount', async () => {
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send({ ...getValidTransactionData(), amount: -1 });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Amount must be');
        });

        it('should return 400 for invalid wallet addresses', async () => {
            isAddress.mockReturnValue(false);
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send({ ...getValidTransactionData(), buyerWalletAddress: 'invalid' });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Valid buyer wallet');
        });

        it('should return 400 if buyer and seller wallets are the same', async () => {
            const sameWallet = '0xSameWallet00000000000000000000000000000001';
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send({ ...getValidTransactionData(), buyerWalletAddress: sameWallet, sellerWalletAddress: sameWallet });
            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Buyer and Seller wallet addresses cannot be the same.');
        });

        it('should return 400 for malformed initialConditions', async () => {
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send({ ...getValidTransactionData(), initialConditions: [{ id: 'cond1', description: 123 }] });
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Initial conditions');
        });

        it('should return 404 if other party not found', async () => {
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send({ ...getValidTransactionData(), otherPartyEmail: 'unknown@example.com' });
            expect(response.status).toBe(404);
        });

        it('should skip contract deployment if env vars missing', async () => {
            delete process.env.DEPLOYER_PRIVATE_KEY;
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send(getValidTransactionData());
            expect(response.status).toBe(201);
            expect(response.body.smartContractAddress).toBeNull();
            expect(mockDeployPropertyEscrowContract).not.toHaveBeenCalled();
        });

        it('should return 500 if contract deployment fails', async () => {
            mockDeployPropertyEscrowContract.mockRejectedValue(new Error('RPC Failure'));
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', `Bearer ${initiatorUser.token}`)
                .send(getValidTransactionData());
            expect(response.status).toBe(500);
            expect(response.body.error).toContain('RPC Failure');
        });

        it('should return 401 if no token provided', async () => {
            const response = await request(app)
                .post('/api/transactions/create')
                .send(getValidTransactionData());
            expect(response.status).toBe(401);
        });

        it('should return 403 if token is invalid', async () => {
            const response = await request(app)
                .post('/api/transactions/create')
                .set('Authorization', 'Bearer invalidToken')
                .send(getValidTransactionData());
            expect(response.status).toBe(403);
        });
    });

    describe('GET /api/transactions/:transactionId', () => {
        let user1, dealId;

        beforeEach(async () => {
            user1 = await createTestUser('user1@example.com');
            const user2 = await createTestUser('user2@example.com');
            const dealRef = await adminFirestore.collection('deals').add({
                propertyAddress: '456 Oak Ave',
                amount: 2.0,
                escrowAmountWei: parseUnits('2.0', 'ether').toString(),
                participants: [user1.uid, user2.uid],
                buyerId: user1.uid,
                sellerId: user2.uid,
                status: 'AWAITING_DEPOSIT',
                createdAt: adminFirestore.FieldValue.serverTimestamp(),
                updatedAt: adminFirestore.FieldValue.serverTimestamp(),
                timeline: [{ event: 'Created', timestamp: adminFirestore.FieldValue.serverTimestamp(), userId: user1.uid }],
                conditions: [],
            });
            dealId = dealRef.id;
        });

        it('should retrieve transaction for participant', async () => {
            const response = await request(app)
                .get(`/api/transactions/${dealId}`)
                .set('Authorization', `Bearer ${user1.token}`);
            expect(response.status).toBe(200);
            expect(response.body.id).toBe(dealId);
        });

        it('should return 404 if transaction not found', async () => {
            const response = await request(app)
                .get('/api/transactions/nonexistent')
                .set('Authorization', `Bearer ${user1.token}`);
            expect(response.status).toBe(404);
        });

        it('should return 403 if user is not a participant', async () => {
            const user3 = await createTestUser('user3@example.com');
            const response = await request(app)
                .get(`/api/transactions/${dealId}`)
                .set('Authorization', `Bearer ${user3.token}`);
            expect(response.status).toBe(403);
        });

        it('should return 401 if no token', async () => {
            const response = await request(app).get(`/api/transactions/${dealId}`);
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/transactions/', () => {
        let userA;

        beforeEach(async () => {
            userA = await createTestUser('usera@example.com');
            const userB = await createTestUser('userb@example.com');
            await adminFirestore.collection('deals').add({
                participants: [userA.uid, userB.uid],
                propertyAddress: 'Deal 1',
                createdAt: new Date('2023-01-01'),
                status: 'AWAITING_DEPOSIT',
                amount: 1,
                escrowAmountWei: '1',
                buyerId: userA.uid,
                sellerId: userB.uid,
                timeline: [],
                conditions: [],
            });
            await adminFirestore.collection('deals').add({
                participants: [userA.uid, userB.uid],
                propertyAddress: 'Deal 2',
                createdAt: new Date('2023-01-02'),
                status: 'AWAITING_DEPOSIT',
                amount: 1,
                escrowAmountWei: '1',
                buyerId: userA.uid,
                sellerId: userB.uid,
                timeline: [],
                conditions: [],
            });
        });

        it('should list user transactions', async () => {
            const response = await request(app)
                .get('/api/transactions/')
                .set('Authorization', `Bearer ${userA.token}`);
            expect(response.status).toBe(200);
            expect(response.body.length).toBe(2);
        });

        it('should respect limit and orderBy', async () => {
            const response = await request(app)
                .get('/api/transactions/?limit=1&orderBy=createdAt&orderDirection=desc')
                .set('Authorization', `Bearer ${userA.token}`);
            expect(response.status).toBe(200);
            expect(response.body.length).toBe(1);
            expect(response.body[0].propertyAddress).toBe('Deal 2');
        });

        it('should return 400 for invalid orderBy', async () => {
            const response = await request(app)
                .get('/api/transactions/?orderBy=invalidField')
                .set('Authorization', `Bearer ${userA.token}`);
            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/transactions/:transactionId/conditions/:conditionId/buyer-review', () => {
        let buyer, seller, dealId;

        beforeEach(async () => {
            buyer = await createTestUser('buyer@example.com');
            seller = await createTestUser('seller@example.com');
            const dealRef = await adminFirestore.collection('deals').add({
                propertyAddress: '789 Pine St',
                amount: 1,
                escrowAmountWei: '1000000000000000000',
                participants: [buyer.uid, seller.uid],
                buyerId: buyer.uid,
                sellerId: seller.uid,
                status: 'AWAITING_FULFILLMENT',
                createdAt: adminFirestore.FieldValue.serverTimestamp(),
                updatedAt: adminFirestore.FieldValue.serverTimestamp(),
                timeline: [],
                conditions: [{ id: 'cond1', type: 'INSPECTION', description: 'Inspect', status: 'PENDING_BUYER_ACTION', createdBy: seller.uid, createdAt: adminFirestore.FieldValue.serverTimestamp(), updatedAt: adminFirestore.FieldValue.serverTimestamp() }],
            });
            dealId = dealRef.id;
        });

        it('should update condition status as buyer', async () => {
            const response = await request(app)
                .put(`/api/transactions/${dealId}/conditions/cond1/buyer-review`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ newBackendStatus: 'FULFILLED_BY_BUYER', reviewComment: 'Looks good' });
            expect(response.status).toBe(200);
            expect(response.body.message).toContain('FULFILLED_BY_BUYER');

            const dealDoc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(dealDoc.data().conditions[0].status).toBe('FULFILLED_BY_BUYER');
            expect(dealDoc.data().conditions[0].reviewComment).toBe('Looks good');
        });

        it('should return 400 for invalid status', async () => {
            const response = await request(app)
                .put(`/api/transactions/${dealId}/conditions/cond1/buyer-review`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ newBackendStatus: 'INVALID' });
            expect(response.status).toBe(400);
        });

        it('should return 403 if not buyer', async () => {
            const response = await request(app)
                .put(`/api/transactions/${dealId}/conditions/cond1/buyer-review`)
                .set('Authorization', `Bearer ${seller.token}`)
                .send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
            expect(response.status).toBe(403);
        });

        it('should return 404 if condition not found', async () => {
            const response = await request(app)
                .put(`/api/transactions/${dealId}/conditions/cond2/buyer-review`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
            expect(response.status).toBe(404);
        });
    });

    describe('PUT /api/transactions/:transactionId/sync-status', () => {
        let buyer, seller, dealId;

        beforeEach(async () => {
            buyer = await createTestUser('buyer@example.com');
            seller = await createTestUser('seller@example.com');
            const dealRef = await adminFirestore.collection('deals').add({
                propertyAddress: '101 Maple St',
                amount: 1,
                escrowAmountWei: '1000000000000000000',
                participants: [buyer.uid, seller.uid],
                buyerId: buyer.uid,
                sellerId: seller.uid,
                status: 'AWAITING_DEPOSIT',
                createdAt: adminFirestore.FieldValue.serverTimestamp(),
                updatedAt: adminFirestore.FieldValue.serverTimestamp(),
                timeline: [],
                conditions: [],
            });
            dealId = dealRef.id;
        });

        it('should sync status with valid data', async () => {
            const response = await request(app)
                .put(`/api/transactions/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({
                    newSCStatus: 'AWAITING_FULFILLMENT',
                    eventMessage: 'Funds deposited',
                    finalApprovalDeadlineISO: '2024-01-01T00:00:00Z',
                });
            expect(response.status).toBe(200);
            expect(response.body.message).toContain('AWAITING_FULFILLMENT');

            const dealDoc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(dealDoc.data().status).toBe('AWAITING_FULFILLMENT');
        });

        it('should return 400 for invalid status', async () => {
            const response = await request(app)
                .put(`/api/transactions/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ newSCStatus: 'INVALID' });
            expect(response.status).toBe(400);
        });

        it('should return 403 if not participant', async () => {
            const user3 = await createTestUser('user3@example.com');
            const response = await request(app)
                .put(`/api/transactions/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${user3.token}`)
                .send({ newSCStatus: 'AWAITING_FULFILLMENT' });
            expect(response.status).toBe(403);
        });
    });

    describe('POST /api/transactions/:transactionId/sc/start-final-approval', () => {
        let buyer, seller, dealId;

        beforeEach(async () => {
            buyer = await createTestUser('buyer@example.com');
            seller = await createTestUser('seller@example.com');
            const dealRef = await adminFirestore.collection('deals').add({
                propertyAddress: '202 Elm St',
                amount: 1,
                escrowAmountWei: '1000000000000000000',
                participants: [buyer.uid, seller.uid],
                buyerId: buyer.uid,
                sellerId: seller.uid,
                status: 'READY_FOR_FINAL_APPROVAL',
                createdAt: adminFirestore.FieldValue.serverTimestamp(),
                updatedAt: adminFirestore.FieldValue.serverTimestamp(),
                timeline: [],
                conditions: [],
            });
            dealId = dealRef.id;
        });

        it('should start final approval', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/start-final-approval`)
                .set('Authorization', `Bearer ${seller.token}`)
                .send({ finalApprovalDeadlineISO: '2024-01-01T00:00:00Z' });
            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Final approval period started');

            const dealDoc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(dealDoc.data().status).toBe('IN_FINAL_APPROVAL');
        });

        it('should return 400 for invalid deadline', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/start-final-approval`)
                .set('Authorization', `Bearer ${seller.token}`)
                .send({ finalApprovalDeadlineISO: 'invalid' });
            expect(response.status).toBe(400);
        });

        it('should return 403 if not participant', async () => {
            const user3 = await createTestUser('user3@example.com');
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/start-final-approval`)
                .set('Authorization', `Bearer ${user3.token}`)
                .send({ finalApprovalDeadlineISO: '2024-01-01T00:00:00Z' });
            expect(response.status).toBe(403);
        });
    });

    describe('POST /api/transactions/:transactionId/sc/raise-dispute', () => {
        let buyer, seller, dealId;

        beforeEach(async () => {
            buyer = await createTestUser('buyer@example.com');
            seller = await createTestUser('seller@example.com');
            const dealRef = await adminFirestore.collection('deals').add({
                propertyAddress: '303 Birch St',
                amount: 1,
                escrowAmountWei: '1000000000000000000',
                participants: [buyer.uid, seller.uid],
                buyerId: buyer.uid,
                sellerId: seller.uid,
                status: 'IN_FINAL_APPROVAL',
                createdAt: adminFirestore.FieldValue.serverTimestamp(),
                updatedAt: adminFirestore.FieldValue.serverTimestamp(),
                timeline: [],
                conditions: [{ id: 'cond1', status: 'FULFILLED_BY_BUYER', description: 'Test', type: 'CUSTOM', createdAt: adminFirestore.FieldValue.serverTimestamp(), updatedAt: adminFirestore.FieldValue.serverTimestamp() }],
            });
            dealId = dealRef.id;
        });

        it('should raise dispute as buyer', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ disputeResolutionDeadlineISO: '2024-01-01T00:00:00Z', conditionId: 'cond1' });
            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Dispute raised');

            const dealDoc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(dealDoc.data().status).toBe('IN_DISPUTE');
            expect(dealDoc.data().conditions[0].status).toBe('ACTION_WITHDRAWN_BY_BUYER');
        });

        it('should return 400 for invalid deadline', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyer.token}`)
                .send({ disputeResolutionDeadlineISO: 'invalid' });
            expect(response.status).toBe(400);
        });

        it('should return 403 if not buyer', async () => {
            const response = await request(app)
                .post(`/api/transactions/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${seller.token}`)
                .send({ disputeResolutionDeadlineISO: '2024-01-01T00:00:00Z' });
            expect(response.status).toBe(403);
        });
    });
});
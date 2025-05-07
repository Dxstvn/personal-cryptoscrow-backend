// src/api/routes/transaction/__tests__/transactionRoutes.test.js
import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals'; // Use Jest's ESM support
import transactionRouter from '../transactionRoutes.js'; // Adjust path if needed
import { adminAuth, adminFirestore, adminApp as testAdminApp, PROJECT_ID } from '../../../../../jest.emulator.setup.js';
import { deleteAdminApp } from '../../../../../src/api/routes/auth/admin.js';
import { Timestamp } from 'firebase-admin/firestore';
import { ethers } from 'ethers'; // For wallet address validation and amount conversion (optional here, but good practice)
import fetch from 'node-fetch';

// --- Mock the Contract Deployer ---
// Use jest.unstable_mockModule for ESM mocking
jest.unstable_mockModule('../../deployContract/contractDeployer.js', () => ({
  deployPropertyEscrowContract: jest.fn(),
}));

// Dynamically import the mocked module *after* setting up the mock
const { deployPropertyEscrowContract } = await import('../../deployContract/contractDeployer.js');


// --- Test Setup ---
const app = express();
app.use(express.json());
// Mount the router under a base path, e.g., /deals
app.use('/deals', transactionRouter);

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const DUMMY_API_KEY = 'demo-api-key';

// --- Helper Functions (reuse from contact tests if possible) ---
async function createTestUser(email, profileData = {}) {
    // Check if user exists first to avoid errors during cleanup/re-runs
    let userRecord;
    try {
        userRecord = await adminAuth.getUserByEmail(email);
        // If user exists, ensure profile data is set/updated
        await adminFirestore.collection('users').doc(userRecord.uid).set({
            email: email.toLowerCase(),
            first_name: profileData.first_name || 'Test',
            last_name: profileData.last_name || 'User',
            phone_number: profileData.phone_number || '1234567890',
            wallets: profileData.wallets || [], // Add default wallets if needed
        }, { merge: true }); // Use merge to avoid overwriting existing data unnecessarily
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            userRecord = await adminAuth.createUser({ email, password: 'testpassword' });
            await adminFirestore.collection('users').doc(userRecord.uid).set({
                email: email.toLowerCase(),
                first_name: profileData.first_name || 'Test',
                last_name: profileData.last_name || 'User',
                phone_number: profileData.phone_number || '1234567890',
                wallets: profileData.wallets || [],
            });
        } else {
            console.error(`Error checking/creating user ${email}:`, error);
            throw error;
        }
    }


    // Get ID token
    const signInUrl = `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${DUMMY_API_KEY}`;
    const response = await fetch(signInUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'testpassword', returnSecureToken: true }),
    });
    const data = await response.json();
    if (!response.ok || !data.idToken) {
        console.error('Failed Test User Sign-In:', { status: response.status, body: data });
        throw new Error(`Failed to get token for ${email}. Status: ${response.status}`);
    }
    return { uid: userRecord.uid, token: data.idToken, email: email.toLowerCase() };
}

async function cleanUpFirestore() {
    try {
        const collections = ['deals', 'users', 'contactInvitations']; // Add other collections if needed
        for (const collectionName of collections) {
            const snapshot = await adminFirestore.collection(collectionName).limit(500).get(); // Limit batch size
            if (snapshot.empty) continue;
            const batch = adminFirestore.batch();
            snapshot.docs.forEach(doc => {
                // Handle subcollections if necessary (e.g., files within deals)
                 if (collectionName === 'deals') {
                    // Simple deletion of subcollection docs first (adjust if deeper nesting)
                     const filesSub = adminFirestore.collection('deals').doc(doc.id).collection('files');
                    // Consider batching subcollection deletes if large
                     filesSub.limit(500).get().then(subSnap => {
                         subSnap.docs.forEach(subDoc => batch.delete(subDoc.ref));
                     });
                 }
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
         console.log('Firestore cleaned up.');
    } catch (error) {
        console.warn("Firestore cleanup warning:", error.message);
    }
}

async function cleanUpAuth() {
     try {
        const listUsersResult = await adminAuth.listUsers(1000);
        const deletePromises = listUsersResult.users.map(user => adminAuth.deleteUser(user.uid));
        await Promise.all(deletePromises);
        console.log('Auth cleaned up.');
    } catch (error) {
        console.warn("Auth cleanup warning:", error.message);
    }
}


// --- Test Suite ---
describe('Transaction Routes (/deals)', () => {
    let buyerUser, sellerUser, otherUser;
    let buyerWallet = ethers.Wallet.createRandom().address;
    let sellerWallet = ethers.Wallet.createRandom().address;

    beforeAll(async () => {
        // Ensure emulators are running and accessible
        // Optional: Add a check here
    });

    afterAll(async () => {
        await cleanUpFirestore();
        await cleanUpAuth();
        await deleteAdminApp();
    });

    beforeEach(async () => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Clean up data
        await cleanUpFirestore();
        await cleanUpAuth();

        // Create fresh users for each test
        buyerUser = await createTestUser('buyer@test.com');
        sellerUser = await createTestUser('seller@test.com');
        otherUser = await createTestUser('other@test.com');

         // Default mock for successful deployment
        deployPropertyEscrowContract.mockResolvedValue('0xMockContractAddress123');
    });

    // --- POST /deals/create ---
    describe('POST /deals/create', () => {
        const dealData = {
            propertyAddress: "1 Test Lane",
            amount: 1.0, // e.g., ETH
            otherPartyEmail: 'seller@test.com',
            buyerWalletAddress: buyerWallet,
            sellerWalletAddress: sellerWallet,
            initialConditions: [
                { id: "cond-1", type: "INSPECTION", description: "Pass inspection" }
            ]
        };

        it('should create a deal initiated by buyer and attempt deployment', async () => {
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER' });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('transactionId');
            expect(response.body).toHaveProperty('smartContractAddress', '0xMockContractAddress123');
            expect(response.body).toHaveProperty('status', 'AWAITING_CONDITION_SETUP'); // Initial SC state
            expect(response.body.transactionDetails.buyerId).toBe(buyerUser.uid);
            expect(response.body.transactionDetails.sellerId).toBe(sellerUser.uid);
            expect(response.body.transactionDetails.initiatedBy).toBe('BUYER');
            expect(response.body.transactionDetails.conditions).toHaveLength(1);
            expect(response.body.transactionDetails.conditions[0].id).toBe('cond-1');
            expect(response.body.transactionDetails.conditions[0].status).toBe('PENDING_BUYER_ACTION');
            expect(response.body.transactionDetails.escrowAmountWei).toBe(ethers.utils.parseEther("1.0").toString());

            // Verify deployment mock was called
            expect(deployPropertyEscrowContract).toHaveBeenCalledTimes(1);
            expect(deployPropertyEscrowContract).toHaveBeenCalledWith(
                sellerWallet, // SC seller address
                buyerWallet,  // SC buyer address
                ethers.utils.parseEther("1.0").toString(), // Wei amount
                process.env.DEPLOYER_PRIVATE_KEY,
                process.env.RPC_URL
            );

            // Verify Firestore document
            const doc = await adminFirestore.collection('deals').doc(response.body.transactionId).get();
            expect(doc.exists).toBe(true);
            expect(doc.data().smartContractAddress).toBe('0xMockContractAddress123');
            expect(doc.data().status).toBe('AWAITING_CONDITION_SETUP');
        });

        it('should create a deal initiated by seller and attempt deployment', async () => {
             const sellerDealData = {
                ...dealData,
                otherPartyEmail: 'buyer@test.com', // Seller initiates with buyer's email
                initiatedBy: 'SELLER'
            };
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${sellerUser.token}`) // Seller's token
                .send(sellerDealData);

            expect(response.status).toBe(201);
            expect(response.body.transactionDetails.sellerId).toBe(sellerUser.uid);
            expect(response.body.transactionDetails.buyerId).toBe(buyerUser.uid);
            expect(response.body.transactionDetails.initiatedBy).toBe('SELLER');
            expect(response.body).toHaveProperty('smartContractAddress', '0xMockContractAddress123');
            expect(response.body).toHaveProperty('status', 'AWAITING_CONDITION_SETUP');
            expect(deployPropertyEscrowContract).toHaveBeenCalledTimes(1);
        });

        it('should handle deployment failure', async () => {
            const deploymentError = new Error("RPC Timeout");
            deployPropertyEscrowContract.mockRejectedValue(deploymentError);

            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER' });

            // Expecting failure because deployment is critical in this setup
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error', `Failed to deploy escrow contract: ${deploymentError.message}`);
            expect(deployPropertyEscrowContract).toHaveBeenCalledTimes(1);

            // Verify no deal document was created (or handle partial creation if needed)
             // Depending on implementation, you might check that the collection is empty
             const deals = await adminFirestore.collection('deals').get();
             expect(deals.empty).toBe(true);
        });

         it('should fail if wallet addresses are missing', async () => {
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER', buyerWalletAddress: null }); // Missing buyer wallet

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Buyer and Seller wallet addresses are required for escrow contract.');
        });

        // Add more validation tests: missing amount, invalid initiator, self-transaction etc.
        it('should fail if amount is invalid', async () => {
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER', amount: -5 });
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Amount must be a positive number.');
        });

    });

    // --- GET /deals/:transactionId ---
    describe('GET /deals/:transactionId', () => {
        let testDealId;
        let testDealData;

        beforeEach(async () => {
             testDealData = {
                // ... (data similar to creation, including SC address and status)
                propertyAddress: "Get Deal Test St",
                amount: 2.5,
                escrowAmountWei: ethers.utils.parseEther("2.5").toString(),
                sellerId: sellerUser.uid,
                buyerId: buyerUser.uid,
                buyerWalletAddress: buyerWallet,
                sellerWalletAddress: sellerWallet,
                participants: [sellerUser.uid, buyerUser.uid],
                status: 'AWAITING_FULFILLMENT', // Example status
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                initiatedBy: 'BUYER',
                conditions: [{ id: 'get-cond', type: 'TEST', description: 'Test condition', status: 'PENDING_BUYER_ACTION', createdAt: Timestamp.now(), updatedAt: Timestamp.now() }],
                timeline: [{ event: 'Created', timestamp: Timestamp.now(), userId: buyerUser.uid }],
                smartContractAddress: '0xGetDealContractAddress',
                fundsDepositedByBuyer: true,
                fundsReleasedToSeller: false,
                finalApprovalDeadlineBackend: null,
                disputeResolutionDeadlineBackend: null,
            };
            const docRef = await adminFirestore.collection('deals').add(testDealData);
            testDealId = docRef.id;
        });

        it('should retrieve a deal successfully for a participant (buyer)', async () => {
            const response = await request(app)
                .get(`/deals/${testDealId}`)
                .set('Authorization', `Bearer ${buyerUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testDealId);
            expect(response.body.propertyAddress).toBe(testDealData.propertyAddress);
            expect(response.body.smartContractAddress).toBe(testDealData.smartContractAddress);
            expect(response.body.status).toBe(testDealData.status);
            expect(response.body.conditions[0].id).toBe('get-cond');
        });

        it('should retrieve a deal successfully for a participant (seller)', async () => {
            const response = await request(app)
                .get(`/deals/${testDealId}`)
                .set('Authorization', `Bearer ${sellerUser.token}`); // Seller token

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testDealId);
        });

        it('should return 403 if user is not a participant', async () => {
            const response = await request(app)
                .get(`/deals/${testDealId}`)
                .set('Authorization', `Bearer ${otherUser.token}`); // Non-participant token

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Access denied.');
        });

        it('should return 404 if deal ID does not exist', async () => {
            const response = await request(app)
                .get(`/deals/nonexistentDealId`)
                .set('Authorization', `Bearer ${buyerUser.token}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Transaction not found.');
        });
    });

     // --- GET /deals (List) ---
    describe('GET /deals', () => {
        beforeEach(async () => {
            // Create some deals for testing listing/pagination
            await adminFirestore.collection('deals').add({ participants: [buyerUser.uid, sellerUser.uid], createdAt: Timestamp.fromDate(new Date('2025-01-01')), status: 'COMPLETED' });
            await adminFirestore.collection('deals').add({ participants: [buyerUser.uid, otherUser.uid], createdAt: Timestamp.fromDate(new Date('2025-01-05')), status: 'AWAITING_FULFILLMENT' });
            await adminFirestore.collection('deals').add({ participants: [sellerUser.uid, otherUser.uid], createdAt: Timestamp.fromDate(new Date('2025-01-10')), status: 'IN_DISPUTE' }); // Not buyer's deal
        });

        it('should retrieve deals for the authenticated user (buyer)', async () => {
            const response = await request(app)
                .get('/deals')
                .set('Authorization', `Bearer ${buyerUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Array);
            expect(response.body).toHaveLength(2); // Buyer is in 2 deals
            // Check if deals are sorted by createdAt desc by default
            expect(new Date(response.body[0].createdAt)).toEqual(new Date('2025-01-05'));
            expect(new Date(response.body[1].createdAt)).toEqual(new Date('2025-01-01'));
        });

         it('should retrieve deals for the authenticated user (seller)', async () => {
            const response = await request(app)
                .get('/deals')
                .set('Authorization', `Bearer ${sellerUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2); // Seller is in 2 deals
            expect(new Date(response.body[0].createdAt)).toEqual(new Date('2025-01-10'));
            expect(new Date(response.body[1].createdAt)).toEqual(new Date('2025-01-01'));
        });

        it('should return empty array if user has no deals', async () => {
             const newUser = await createTestUser('nodeals@test.com');
             const response = await request(app)
                .get('/deals')
                .set('Authorization', `Bearer ${newUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

         // Add tests for pagination (limit, startAfter) if needed
    });


    // --- PUT /deals/:transactionId/conditions/:conditionId/buyer-review ---
    describe('PUT /deals/:transactionId/conditions/:conditionId/buyer-review', () => {
        let dealId;
        const conditionId = 'cond-review';

        beforeEach(async () => {
            const dealRef = await adminFirestore.collection('deals').add({
                participants: [buyerUser.uid, sellerUser.uid],
                buyerId: buyerUser.uid,
                sellerId: sellerUser.uid,
                conditions: [
                    { id: conditionId, description: 'Review Me', status: 'PENDING_BUYER_ACTION', createdAt: Timestamp.now(), updatedAt: Timestamp.now() }
                ],
                status: 'AWAITING_FULFILLMENT',
                 createdAt: Timestamp.now(),
                 updatedAt: Timestamp.now(),
            });
            dealId = dealRef.id;
        });

        it('should allow buyer to update condition status in backend', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/conditions/${conditionId}/buyer-review`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ newBackendStatus: 'FULFILLED_BY_BUYER', reviewComment: 'Looks good!' });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('FULFILLED_BY_BUYER');

            // Verify Firestore update
            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            const condition = doc.data().conditions.find(c => c.id === conditionId);
            expect(condition.status).toBe('FULFILLED_BY_BUYER');
            expect(condition.reviewComment).toBe('Looks good!');
        });

        it('should fail if caller is not the buyer', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/conditions/${conditionId}/buyer-review`)
                .set('Authorization', `Bearer ${sellerUser.token}`) // Seller trying to call
                .send({ newBackendStatus: 'FULFILLED_BY_BUYER' });

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Only the buyer can update condition status.');
        });

        it('should fail if condition ID does not exist', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/conditions/nonexistent-cond/buyer-review`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ newBackendStatus: 'FULFILLED_BY_BUYER' });

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Condition not found.');
        });

         it('should fail if newBackendStatus is invalid', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/conditions/${conditionId}/buyer-review`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ newBackendStatus: 'INVALID_STATUS' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Invalid newBackendStatus for condition.');
        });
    });

    // --- PUT /deals/:transactionId/sync-status ---
    describe('PUT /deals/:transactionId/sync-status', () => {
         let dealId;
         const deadlineISO = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

         beforeEach(async () => {
            const dealRef = await adminFirestore.collection('deals').add({
                participants: [buyerUser.uid, sellerUser.uid],
                status: 'READY_FOR_FINAL_APPROVAL', // Example starting status
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                fundsDepositedByBuyer: true, // Assume funds are deposited for this test
            });
            dealId = dealRef.id;
        });

        it('should sync backend status and deadlines correctly', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({
                    newSCStatus: 'IN_FINAL_APPROVAL',
                    eventMessage: 'SC entered final approval',
                    finalApprovalDeadlineISO: deadlineISO
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('IN_FINAL_APPROVAL');

            // Verify Firestore update
            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('IN_FINAL_APPROVAL');
            expect(doc.data().finalApprovalDeadlineBackend.toDate().toISOString()).toBe(deadlineISO);
            expect(doc.data().timeline.some(e => e.event === 'SC entered final approval')).toBe(true);
        });

         it('should update fundsReleasedToSeller when synced to COMPLETED', async () => {
            await adminFirestore.collection('deals').doc(dealId).update({ fundsReleasedToSeller: false }); // Ensure it's false initially

            const response = await request(app)
                .put(`/deals/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${sellerUser.token}`)
                .send({ newSCStatus: 'COMPLETED' });

            expect(response.status).toBe(200);

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('COMPLETED');
            expect(doc.data().fundsReleasedToSeller).toBe(true); // Should be updated
            expect(doc.data().timeline.some(e => e.event.includes('Funds confirmed released'))).toBe(true);
        });

        it('should fail if newSCStatus is invalid', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ newSCStatus: 'SOME_INVALID_STATE' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Invalid smart contract status value: SOME_INVALID_STATE.');
        });

        it('should fail if user is not a participant', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${otherUser.token}`) // Non-participant
                .send({ newSCStatus: 'COMPLETED' });

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Access denied. Not a participant.');
        });
    });

     // --- Conceptual Sync Endpoints ---
     // These test that the backend updates correctly when notified about an SC event
     describe('Conceptual Sync Endpoints', () => {
        let dealId;
        const conditionId = 'cond-sync';
        const finalDeadlineISO = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
        const disputeDeadlineISO = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();


        beforeEach(async () => {
            const dealRef = await adminFirestore.collection('deals').add({
                participants: [buyerUser.uid, sellerUser.uid],
                buyerId: buyerUser.uid,
                status: 'READY_FOR_FINAL_APPROVAL',
                conditions: [{ id: conditionId, description: 'Sync Me', status: 'FULFILLED_BY_BUYER', createdAt: Timestamp.now(), updatedAt: Timestamp.now() }],
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
            dealId = dealRef.id;
        });

        it('POST /sc/start-final-approval should update backend status and deadline', async () => {
            const response = await request(app)
                .post(`/deals/${dealId}/sc/start-final-approval`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ finalApprovalDeadlineISO });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Final approval period started');

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('IN_FINAL_APPROVAL');
            expect(doc.data().finalApprovalDeadlineBackend.toDate().toISOString()).toBe(finalDeadlineISO);
        });

        it('POST /sc/raise-dispute should update backend status, condition status, and deadline', async () => {
             // First, move to IN_FINAL_APPROVAL
             await adminFirestore.collection('deals').doc(dealId).update({ status: 'IN_FINAL_APPROVAL' });

             const response = await request(app)
                .post(`/deals/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ conditionId, disputeResolutionDeadlineISO });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Dispute raised');

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('IN_DISPUTE');
            expect(doc.data().disputeResolutionDeadlineBackend.toDate().toISOString()).toBe(disputeDeadlineISO);
            const condition = doc.data().conditions.find(c => c.id === conditionId);
            expect(condition.status).toBe('ACTION_WITHDRAWN_BY_BUYER'); // Or DISPUTED_BY_BUYER if you prefer
        });
     });

});

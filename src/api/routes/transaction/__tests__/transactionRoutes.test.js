// src/api/routes/transaction/__tests__/transactionRoutes.test.js
import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import transactionRouter from '../transactionRoutes.js';
import { adminAuth, adminFirestore, adminApp as testAdminApp, PROJECT_ID } from '../../../../../jest.emulator.setup.js';
import { deleteAdminApp } from '../../auth/admin.js';
import { Timestamp } from 'firebase-admin/firestore';
import { ethers } from 'ethers'; // Ensure ethers is imported
import fetch from 'node-fetch';

// --- Mock the Contract Deployer ---
// Path relative to this test file
jest.unstable_mockModule('../../deployContract/contractDeployer.js', () => ({
  deployPropertyEscrowContract: jest.fn(),
}));

// Dynamically import the mocked module *after* setting up the mock
const { deployPropertyEscrowContract } = await import('../../deployContract/contractDeployer.js');


// --- Test Setup ---
const app = express();
app.use(express.json());
app.use('/deals', transactionRouter);

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const DUMMY_API_KEY = 'demo-api-key';

// --- Helper Functions ---
async function createTestUser(email, profileData = {}) {
    let userRecord;
    try {
        userRecord = await adminAuth.getUserByEmail(email);
        await adminFirestore.collection('users').doc(userRecord.uid).set({
            email: email.toLowerCase(),
            first_name: profileData.first_name || 'Test',
            last_name: profileData.last_name || 'User',
            phone_number: profileData.phone_number || '1234567890',
            wallets: profileData.wallets || [],
        }, { merge: true });
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
        const collections = ['deals', 'users', 'contactInvitations'];
        for (const collectionName of collections) {
            const snapshot = await adminFirestore.collection(collectionName).limit(500).get();
            if (snapshot.empty) continue;
            const batch = adminFirestore.batch();
            const subcollectionPromises = [];

            snapshot.docs.forEach(doc => {
                 if (collectionName === 'deals') {
                     const filesSub = adminFirestore.collection('deals').doc(doc.id).collection('files');
                     subcollectionPromises.push(
                         filesSub.limit(500).get().then(subSnap => {
                             subSnap.docs.forEach(subDoc => batch.delete(subDoc.ref));
                         }).catch(err => console.warn(`Warning: Could not clean subcollection for deal ${doc.id}`, err.message)) // Add catch for subcollection get
                     );
                 }
                batch.delete(doc.ref);
            });
            await Promise.all(subcollectionPromises).catch(err => console.warn("Warning: Error during subcollection cleanup", err.message)); // Wait for subcollection deletes
            await batch.commit();
        }
         // console.log('Firestore cleaned up.');
    } catch (error) {
        // Ignore common emulator errors during cleanup
        if (!error.message?.includes('RESOURCE_EXHAUSTED') && !error.message?.includes('UNAVAILABLE')) {
            console.warn("Firestore cleanup warning:", error.code, error.message);
        }
    }
}

async function cleanUpAuth() {
     try {
        const listUsersResult = await adminAuth.listUsers(1000);
        if (listUsersResult.users.length > 0) {
            const deletePromises = listUsersResult.users.map(user => adminAuth.deleteUser(user.uid).catch(err => {
                 // Ignore "user not found" during cleanup, might happen with parallel deletes
                 if (err.code !== 'auth/user-not-found') {
                     console.warn(`Auth cleanup warning for user ${user.uid}:`, err.message);
                 }
            }));
            await Promise.all(deletePromises);
            // console.log('Auth cleaned up.');
        }
    } catch (error) {
         if (!error.message?.includes('find a running emulator')) { // Ignore emulator not running error
            console.warn("Auth cleanup warning:", error.code, error.message);
         }
    }
}


// --- Test Suite ---
describe('Transaction Routes (/deals)', () => {
    let buyerUser, sellerUser, otherUser;
    let buyerWallet = ethers.Wallet.createRandom().address;
    let sellerWallet = ethers.Wallet.createRandom().address;
    let server;

     beforeAll((done) => {
        server = app.listen(0, done);
    });

    afterAll(async () => {
        await cleanUpFirestore();
        await cleanUpAuth();
        // await deleteAdminApp(); // Let Jest handle process exit
        await new Promise(resolve => server.close(resolve));
    });


    beforeEach(async () => {
        jest.clearAllMocks();
        // Ensure cleanup finishes before creating new users
        await cleanUpFirestore();
        await cleanUpAuth();
        try {
            buyerUser = await createTestUser('buyer@test.com');
            sellerUser = await createTestUser('seller@test.com');
            otherUser = await createTestUser('other@test.com');
        } catch (error) {
            console.error("ERROR IN BEFORE EACH USER CREATION:", error);
            // Optionally re-throw or handle to prevent tests from running with bad state
            throw error;
        }
        deployPropertyEscrowContract.mockResolvedValue('0xMockContractAddress123');
    });

    // --- POST /deals/create ---
    describe('POST /deals/create', () => {
        const dealData = {
            propertyAddress: "1 Test Lane",
            amount: 1.0,
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
            expect(response.body).toHaveProperty('status', 'AWAITING_CONDITION_SETUP');
            expect(response.body.transactionDetails).toBeDefined();
            expect(response.body.transactionDetails.buyerId).toBe(buyerUser.uid);
            expect(response.body.transactionDetails.sellerId).toBe(sellerUser.uid);
            expect(response.body.transactionDetails.initiatedBy).toBe('BUYER');
            expect(response.body.transactionDetails.conditions).toHaveLength(1);
            expect(response.body.transactionDetails.conditions[0].id).toBe('cond-1');
            expect(response.body.transactionDetails.conditions[0].status).toBe('PENDING_BUYER_ACTION');
            // Use parseUnits for consistency in tests
            expect(response.body.transactionDetails.escrowAmountWei).toBe(ethers.utils.parseUnits("1.0", 'ether').toString());

            expect(deployPropertyEscrowContract).toHaveBeenCalledTimes(1);
            expect(deployPropertyEscrowContract).toHaveBeenCalledWith(
                ethers.utils.getAddress(sellerWallet),
                ethers.utils.getAddress(buyerWallet),
                ethers.utils.parseUnits("1.0", 'ether').toString(),
                process.env.DEPLOYER_PRIVATE_KEY,
                process.env.RPC_URL
            );

            const doc = await adminFirestore.collection('deals').doc(response.body.transactionId).get();
            expect(doc.exists).toBe(true);
            expect(doc.data().smartContractAddress).toBe('0xMockContractAddress123');
            expect(doc.data().status).toBe('AWAITING_CONDITION_SETUP');
        });

        it('should create a deal initiated by seller and attempt deployment', async () => {
             const sellerDealData = {
                ...dealData,
                otherPartyEmail: 'buyer@test.com',
                initiatedBy: 'SELLER'
            };
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${sellerUser.token}`)
                .send(sellerDealData);

            expect(response.status).toBe(201);
            expect(response.body.transactionDetails).toBeDefined();
            expect(response.body.transactionDetails.sellerId).toBe(sellerUser.uid);
            expect(response.body.transactionDetails.buyerId).toBe(buyerUser.uid);
            expect(response.body.transactionDetails.initiatedBy).toBe('SELLER');
            expect(response.body).toHaveProperty('smartContractAddress', '0xMockContractAddress123');
            expect(response.body).toHaveProperty('status', 'AWAITING_CONDITION_SETUP');
            expect(deployPropertyEscrowContract).toHaveBeenCalledTimes(1);
        });

        it('should handle deployment failure and return specific error', async () => {
            const deploymentError = new Error("RPC Timeout");
            deployPropertyEscrowContract.mockRejectedValue(deploymentError);

            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER' });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error', `Failed to deploy escrow contract: ${deploymentError.message}`);
            expect(deployPropertyEscrowContract).toHaveBeenCalledTimes(1);

             const deals = await adminFirestore.collection('deals').get();
             expect(deals.empty).toBe(true);
        });

         it('should fail if buyer wallet address is invalid', async () => {
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER', buyerWalletAddress: 'invalid-address' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Valid buyer wallet address is required.');
        });

         it('should fail if seller wallet address is invalid', async () => {
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER', sellerWalletAddress: 'invalid-address' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Valid seller wallet address is required.');
        });


        it('should fail if amount is invalid', async () => {
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER', amount: -5 });
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Amount must be a positive finite number.');
        });

         it('should fail if amount cannot be parsed', async () => {
            const response = await request(app)
                .post('/deals/create')
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ ...dealData, initiatedBy: 'BUYER', amount: "not-a-number" });
            expect(response.status).toBe(400);
             expect(response.body).toHaveProperty('error', 'Amount must be a positive finite number.');
        });

    });

    // --- GET /deals/:transactionId ---
    describe('GET /deals/:transactionId', () => {
        let testDealId;
        let testDealData;

        beforeEach(async () => {
             // Define testDealData *inside* beforeEach to ensure ethers is available
             testDealData = {
                propertyAddress: "Get Deal Test St",
                amount: 2.5,
                escrowAmountWei: ethers.utils.parseUnits("2.5", 'ether').toString(), // Calculate here
                sellerId: sellerUser.uid,
                buyerId: buyerUser.uid,
                buyerWalletAddress: buyerWallet,
                sellerWalletAddress: sellerWallet,
                participants: [sellerUser.uid, buyerUser.uid],
                status: 'AWAITING_FULFILLMENT',
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
             // Add null check for conditions
            expect(response.body.conditions?.[0]?.id).toBe('get-cond');
        });

        it('should retrieve a deal successfully for a participant (seller)', async () => {
            const response = await request(app)
                .get(`/deals/${testDealId}`)
                .set('Authorization', `Bearer ${sellerUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testDealId);
        });

        it('should return 403 if user is not a participant', async () => {
            const response = await request(app)
                .get(`/deals/${testDealId}`)
                .set('Authorization', `Bearer ${otherUser.token}`);

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
            await adminFirestore.collection('deals').add({ participants: [buyerUser.uid, sellerUser.uid], createdAt: Timestamp.fromDate(new Date('2025-01-01T10:00:00Z')), status: 'COMPLETED' });
            await adminFirestore.collection('deals').add({ participants: [buyerUser.uid, otherUser.uid], createdAt: Timestamp.fromDate(new Date('2025-01-05T12:00:00Z')), status: 'AWAITING_FULFILLMENT' });
            await adminFirestore.collection('deals').add({ participants: [sellerUser.uid, otherUser.uid], createdAt: Timestamp.fromDate(new Date('2025-01-10T14:00:00Z')), status: 'IN_DISPUTE' });
        });

        it('should retrieve deals for the authenticated user (buyer)', async () => {
            const response = await request(app)
                .get('/deals')
                .set('Authorization', `Bearer ${buyerUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Array);
            expect(response.body).toHaveLength(2);
            expect(response.body[0].createdAt).toBe(new Date('2025-01-05T12:00:00Z').toISOString());
            expect(response.body[1].createdAt).toBe(new Date('2025-01-01T10:00:00Z').toISOString());
        });

         it('should retrieve deals for the authenticated user (seller)', async () => {
            const response = await request(app)
                .get('/deals')
                .set('Authorization', `Bearer ${sellerUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            expect(response.body[0].createdAt).toBe(new Date('2025-01-10T14:00:00Z').toISOString());
            expect(response.body[1].createdAt).toBe(new Date('2025-01-01T10:00:00Z').toISOString());
        });

        it('should return empty array if user has no deals', async () => {
             const newUser = await createTestUser('nodeals@test.com');
             const response = await request(app)
                .get('/deals')
                .set('Authorization', `Bearer ${newUser.token}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });
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

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            const condition = doc.data().conditions.find(c => c.id === conditionId);
            expect(condition.status).toBe('FULFILLED_BY_BUYER');
            expect(condition.reviewComment).toBe('Looks good!');
        });

        it('should fail if caller is not the buyer', async () => {
            const response = await request(app)
                .put(`/deals/${dealId}/conditions/${conditionId}/buyer-review`)
                .set('Authorization', `Bearer ${sellerUser.token}`)
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

         beforeEach(async () => {
            const dealRef = await adminFirestore.collection('deals').add({
                participants: [buyerUser.uid, sellerUser.uid],
                status: 'READY_FOR_FINAL_APPROVAL',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                fundsDepositedByBuyer: true,
                fundsReleasedToSeller: false, // Explicitly set for test
                timeline: [], // Initialize timeline
            });
            dealId = dealRef.id;
        });

        it('should sync backend status and deadlines correctly', async () => {
             const deadlineISO = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
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

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('IN_FINAL_APPROVAL');
            expect(doc.data().finalApprovalDeadlineBackend.toDate().toISOString()).toBe(deadlineISO);
            expect(doc.data().timeline.some(e => e.event === 'SC entered final approval')).toBe(true);
        });

         it('should update fundsReleasedToSeller when synced to COMPLETED', async () => {
            await adminFirestore.collection('deals').doc(dealId).update({ fundsReleasedToSeller: false });

            const response = await request(app)
                .put(`/deals/${dealId}/sync-status`)
                .set('Authorization', `Bearer ${sellerUser.token}`)
                .send({ newSCStatus: 'COMPLETED' });

            expect(response.status).toBe(200);

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('COMPLETED');
            expect(doc.data().fundsReleasedToSeller).toBe(true);
            // Check the specific timeline event added in the route
            expect(doc.data().timeline.some(e => e.event === 'Funds confirmed released to seller on-chain.')).toBe(true);
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
                .set('Authorization', `Bearer ${otherUser.token}`)
                .send({ newSCStatus: 'COMPLETED' });

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Access denied. Not a participant.');
        });
    });

     // --- Conceptual Sync Endpoints ---
     describe('Conceptual Sync Endpoints', () => {
        let dealId;
        const conditionId = 'cond-sync';

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
             const finalApprovalDeadlineISO = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
             const response = await request(app)
                .post(`/deals/${dealId}/sc/start-final-approval`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ finalApprovalDeadlineISO });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Final approval period started');

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('IN_FINAL_APPROVAL');
            expect(doc.data().finalApprovalDeadlineBackend.toDate().toISOString()).toBe(finalApprovalDeadlineISO);
        });

        it('POST /sc/raise-dispute should update backend status, condition status, and deadline', async () => {
             const disputeResolutionDeadlineISO = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
             await adminFirestore.collection('deals').doc(dealId).update({ status: 'IN_FINAL_APPROVAL' }); // Prerequisite state

             const response = await request(app)
                .post(`/deals/${dealId}/sc/raise-dispute`)
                .set('Authorization', `Bearer ${buyerUser.token}`)
                .send({ conditionId, disputeResolutionDeadlineISO });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('Dispute raised');

            const doc = await adminFirestore.collection('deals').doc(dealId).get();
            expect(doc.data().status).toBe('IN_DISPUTE');
            expect(doc.data().disputeResolutionDeadlineBackend.toDate().toISOString()).toBe(disputeResolutionDeadlineISO);
            const condition = doc.data().conditions.find(c => c.id === conditionId);
            expect(condition.status).toBe('ACTION_WITHDRAWN_BY_BUYER');
        });
     });

});

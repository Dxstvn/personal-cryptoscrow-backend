import { jest } from '@jest/globals';
import express from 'express';
import router from '../../transactionRoutes.js'; // Path to the router

// --- Mock Firebase Admin SDK & Firestore/Auth related --- 
const mockVerifyIdToken = jest.fn();
const mockGetAdminAuth = jest.fn(() => ({ verifyIdToken: mockVerifyIdToken }));

const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGet = jest.fn();
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockStartAfter = jest.fn();
const mockRunTransaction = jest.fn();
const mockFieldValueArrayUnion = jest.fn();
const mockTimestampNow = jest.fn();
const mockTimestampFromDate = jest.fn();

const mockGetFirestore = jest.fn(() => ({
  collection: mockCollection,
  runTransaction: mockRunTransaction,
}));

const mockFieldValue = {
    serverTimestamp: jest.fn(() => 'mock_server_timestamp'),
    arrayUnion: mockFieldValueArrayUnion,
};
const mockTimestamp = {
    now: mockTimestampNow,
    fromDate: mockTimestampFromDate,
}

jest.mock('firebase-admin/auth', () => ({ getAuth: mockGetAdminAuth }));
jest.mock('firebase-admin/firestore', () => ({
    getFirestore: mockGetFirestore,
    FieldValue: mockFieldValue,
    Timestamp: mockTimestamp,
}));
jest.mock('../../auth/admin.js', () => ({ adminApp: {} }));

// --- Mock Ethers.js --- 
const mockIsAddress = jest.fn();
const mockGetAddress = jest.fn();
const mockParseUnits = jest.fn();
jest.mock('ethers', () => ({
    isAddress: mockIsAddress,
    getAddress: mockGetAddress,
    parseUnits: mockParseUnits,
}));

// --- Mock Contract Deployer --- 
const mockDeployPropertyEscrowContract = jest.fn();
jest.mock('../../deployContract/contractDeployer.js', () => ({
    deployPropertyEscrowContract: mockDeployPropertyEscrowContract,
}));

// Helper to create a mock Express app with the router
const setupApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/', router); // Mount router at root for these tests
  return app;
};

// Mock Express request and response objects
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Unit Tests for transactionRoutes.js', () => {
  let app;
  const testUserId = 'testUserId';
  const testUserEmail = 'user@example.com';

  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp();

    // Default mock implementations
    mockVerifyIdToken.mockResolvedValue({ uid: testUserId, email: testUserEmail });
    mockTimestampNow.mockReturnValue({ toDate: () => new Date(), seconds: Date.now()/1000, nanoseconds: 0 });
    mockTimestampFromDate.mockImplementation(d => ({ toDate: () => d, seconds: d.getTime()/1000, nanoseconds: (d.getTime()%1000)*1e6 }));

    // Firestore collection/doc chaining
    mockCollection.mockReturnValue({
        doc: mockDoc,
        where: mockWhere,
        orderBy: mockOrderBy,
        limit: mockLimit,
        add: mockAdd,
        get: mockGet, // for collection().get()
    });
    mockDoc.mockReturnValue({
        get: mockGet,
        update: mockUpdate,
        collection: mockCollection, // for doc().collection()
    });
    mockWhere.mockReturnValue({ where: mockWhere, limit: mockLimit, get: mockGet, orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit, startAfter: mockStartAfter, get: mockGet });
    mockLimit.mockReturnValue({ startAfter: mockStartAfter, get: mockGet });
    mockStartAfter.mockReturnValue({ get: mockGet });

    // Ethers defaults
    mockIsAddress.mockReturnValue(true);
    mockGetAddress.mockImplementation(addr => addr); // Pass through
    mockParseUnits.mockImplementation((val) => BigInt(String(val).replace('.', '') + '0000000000000000')); // Simplified mock

    // Contract deployer default
    mockDeployPropertyEscrowContract.mockResolvedValue('0xDeployedContractAddress');
    
    // runTransaction mock
    mockRunTransaction.mockImplementation(async (callback) => {
        const mockTransaction = { get: mockGet, update: mockUpdate, set: jest.fn(), delete: jest.fn() };
        return callback(mockTransaction);
    });
  });

  // --- Middleware: authenticateToken (implicitly tested in routes) ---
  describe('authenticateToken Middleware', () => {
    it('should return 401 if no token provided', async () => {
        const response = await app.post('/create').send({}); // Any authenticated route
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Authentication token is required.');
    });
    it('should return 403 if token is invalid', async () => {
        mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
        const response = await app.post('/create').set('Authorization', 'Bearer invalid').send({});
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Authentication failed. Invalid or expired token.');
    });
  });

  // --- POST /create ---
  describe('POST /create', () => {
    const basicPayload = {
        initiatedBy: 'BUYER',
        propertyAddress: '123 Test Lane',
        amount: 100,
        otherPartyEmail: 'otherparty@example.com',
        buyerWalletAddress: '0xBuyerWallet',
        sellerWalletAddress: '0xSellerWallet',
        initialConditions: [{ id: 'c1', description: 'Condition 1', type: 'CUSTOM' }]
    };

    it('should create a transaction successfully (BUYER initiated)', async () => {
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] }); // otherParty query
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' }); // db.collection('deals').add()

        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(response.status).toBe(201);
        expect(response.body.message).toBe('Transaction initiated successfully.');
        expect(response.body.transactionId).toBe('newTransactionId');
        expect(response.body.status).toBe('PENDING_SELLER_REVIEW');
        expect(mockDeployPropertyEscrowContract).toHaveBeenCalled();
        expect(response.body.smartContractAddress).toBe('0xDeployedContractAddress');
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
            buyerId: testUserId,
            sellerId: 'otherPartyUid',
            status: 'PENDING_SELLER_REVIEW'
        }));
    });
    
    it('should create a transaction successfully (SELLER initiated)', async () => {
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' });
        const payload = { ...basicPayload, initiatedBy: 'SELLER' };
        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(201);
        expect(response.body.status).toBe('PENDING_BUYER_REVIEW');
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
            sellerId: testUserId,
            buyerId: 'otherPartyUid',
            status: 'PENDING_BUYER_REVIEW'
        }));
    });

    it('should skip contract deployment if env vars missing', async () => {
        const originalPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
        delete process.env.DEPLOYER_PRIVATE_KEY;
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' });

        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(response.status).toBe(201);
        expect(response.body.smartContractAddress).toBeNull();
        expect(mockDeployPropertyEscrowContract).not.toHaveBeenCalled();
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ smartContractAddress: null }));
        process.env.DEPLOYER_PRIVATE_KEY = originalPrivateKey; // Restore
    });
    
    it('should handle contract deployment failure', async () => {
        mockDeployPropertyEscrowContract.mockRejectedValueOnce(new Error('Deployment failed badly'));
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' });

        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(response.status).toBe(201);
        expect(response.body.smartContractAddress).toBeNull();
        expect(response.body.deploymentWarning).toContain('deployment was attempted but failed');
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ smartContractAddress: null }));
    });

    // Input validation tests
    const requiredFields = ['initiatedBy', 'propertyAddress', 'amount', 'otherPartyEmail', 'buyerWalletAddress', 'sellerWalletAddress'];
    for (const field of requiredFields) {
        it(`should return 400 if ${field} is missing or invalid`, async () => {
            const payload = { ...basicPayload };
            if (field === 'amount') payload[field] = -5; // Invalid amount
            else if (field.includes('WalletAddress')) {
                mockIsAddress.mockImplementationOnce(addr => addr !== 'invalid'); // make one invalid
                payload[field] = 'invalid';
            } else {
                 delete payload[field];
            }
            const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
            expect(response.status).toBe(400);
            // Specific error messages can be checked here if desired
        });
    }

    it('should return 400 if buyer and seller wallet addresses are the same', async () => {
        const sameWallet = '0xSameWallet';
        const payload = { ...basicPayload, buyerWalletAddress: sameWallet, sellerWalletAddress: sameWallet };
        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Buyer and Seller wallet addresses cannot be the same.');
    });

    it('should return 400 if initialConditions are malformed', async () => {
        const payload = { ...basicPayload, initialConditions: [{ id: 'c1' /* missing description */ }] };
        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Initial conditions must be an array of objects');
    });
    
    it('should return 404 if otherPartyEmail not found in DB', async () => {
        mockGet.mockResolvedValueOnce({ empty: true }); // Simulate user not found
        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(response.status).toBe(404);
        expect(response.body.error).toContain(`User with email ${basicPayload.otherPartyEmail} not found.`);
    });

    it('should return 400 if initiator tries to create transaction with self', async () => {
        const payload = { ...basicPayload, otherPartyEmail: testUserEmail }; // Initiator's email
        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Cannot create a transaction with yourself.');
    });

    it('should return 500 on Firestore error during creation', async () => {
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockRejectedValueOnce(new Error('Firestore failed to add'));
        const response = await app.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Internal server error during transaction creation.');
    });
  });

  // --- GET /:transactionId ---
  describe('GET /:transactionId', () => {
    const transactionId = 'tx123';
    const mockTxData = {
        participants: [testUserId, 'otherUser'],
        propertyAddress: 'Test Prop', amount: 100,
        createdAt: mockTimestamp.now(), updatedAt: mockTimestamp.now(),
        timeline: [{ event: 'Created', timestamp: mockTimestamp.now() }],
        conditions: [{ id: 'c1', description: 'C1', createdAt: mockTimestamp.now(), updatedAt: mockTimestamp.now() }]
    };

    it('should fetch a transaction successfully if user is participant', async () => {
        mockGet.mockResolvedValueOnce({ exists: true, data: () => mockTxData, id: transactionId });
        const response = await app.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(transactionId);
        expect(response.body.propertyAddress).toBe('Test Prop');
    });

    it('should return 404 if transaction not found', async () => {
        mockGet.mockResolvedValueOnce({ exists: false });
        const response = await app.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Transaction not found.');
    });

    it('should return 403 if user is not a participant', async () => {
        mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...mockTxData, participants: ['anotherUser1', 'anotherUser2'] }) });
        const response = await app.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Access denied.');
    });
  });

  // --- GET / (List Transactions) ---
  describe('GET /', () => {
    it('should list transactions for the user', async () => {
        const mockTxList = [{ id: 'tx1', data: () => ({ participants: [testUserId], createdAt: mockTimestamp.now() }) }];
        mockGet.mockResolvedValueOnce({ empty: false, docs: mockTxList });
        const response = await app.get('/').set('Authorization', 'Bearer validtoken');
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].id).toBe('tx1');
    });
    it('should return empty array if no transactions found', async () => {
        mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
        const response = await app.get('/').set('Authorization', 'Bearer validtoken');
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });
    // Add tests for pagination (startAfter), orderBy, limit if needed
  });

  // --- PUT /:transactionId/conditions/:conditionId/buyer-review ---
  describe('PUT /:transactionId/conditions/:conditionId/buyer-review', () => {
    const transactionId = 'txConditionReview';
    const conditionId = 'condToReview';
    const mockTxData = {
        buyerId: testUserId,
        participants: [testUserId],
        conditions: [{ id: conditionId, description: 'Test condition', status: 'PENDING_BUYER_ACTION' }]
    };
    it('should update condition status successfully by buyer', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData }); // For transaction.get(doc)
        const payload = { newBackendStatus: 'FULFILLED_BY_BUYER', reviewComment: 'Looks good!' };
        const response = await app.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
                            .set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(200);
        expect(response.body.message).toContain('Backend condition status updated');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            conditions: expect.arrayContaining([expect.objectContaining({ id: conditionId, status: 'FULFILLED_BY_BUYER', reviewComment: 'Looks good!' })])
        }));
    });

    it('should return 400 for invalid newBackendStatus', async () => {
        const response = await app.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
                            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'INVALID_STATUS' });
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid newBackendStatus');
    });
    
    it('should return 403 if updater is not the buyer', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, buyerId: 'anotherBuyerUid' }) });
        const response = await app.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
                            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Only the buyer can update this condition status.');
    });

    it('should return 404 if transaction not found', async () => {
        mockGet.mockResolvedValue({ exists: false }); // Transaction not found
        const response = await app.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Transaction not found.');
    });

    it('should return 404 if condition not found in transaction', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, conditions: [{id: 'otherCond'}] }) }); // Condition not there
        const response = await app.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Condition not found within the transaction.');
    });
  });

  // --- PUT /:transactionId/sync-status ---
  describe('PUT /:transactionId/sync-status', () => {
    const transactionId = 'txSyncStatus';
    const mockTxData = { participants: [testUserId], status: 'OLD_STATUS', fundsDepositedByBuyer: false, fundsReleasedToSeller: false };

    it('should sync status successfully', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const payload = { newSCStatus: 'AWAITING_FULFILLMENT', eventMessage: 'Synced from SC' };
        const response = await app.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(200);
        expect(response.body.message).toContain('Transaction backend status synced/updated');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'AWAITING_FULFILLMENT', fundsDepositedByBuyer: true }));
    });
    
    it('should update fundsReleasedToSeller if status is COMPLETED', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const payload = { newSCStatus: 'COMPLETED' };
        const response = await app.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(200);
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'COMPLETED', fundsReleasedToSeller: true, fundsDepositedByBuyer: true }));
    });

    it('should set deadlines if provided for IN_FINAL_APPROVAL or IN_DISPUTE', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const deadline = new Date(Date.now() + 86400000).toISOString();
        const payload = { newSCStatus: 'IN_FINAL_APPROVAL', finalApprovalDeadlineISO: deadline };
        await app.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ 
            status: 'IN_FINAL_APPROVAL', 
            finalApprovalDeadlineBackend: mockTimestamp.fromDate(new Date(deadline))
        }));
    });
    
    it('should return 400 for invalid newSCStatus', async () => {
        const response = await app.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send({ newSCStatus: 'BAD_STATUS' });
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid smart contract status value');
    });
  });

  // --- POST /:transactionId/sc/start-final-approval ---
  describe('POST /:transactionId/sc/start-final-approval', () => {
    const transactionId = 'txStartFinal';
    const mockTxData = { participants: [testUserId] };
    const deadlineISO = new Date(Date.now() + 3 * 86400000).toISOString();

    it('should sync start of final approval successfully', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const response = await app.post(`/${transactionId}/sc/start-final-approval`)
            .set('Authorization', 'Bearer validtoken')
            .send({ finalApprovalDeadlineISO: deadlineISO });
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Backend synced: Final approval period started.');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            status: 'IN_FINAL_APPROVAL',
            finalApprovalDeadlineBackend: mockTimestamp.fromDate(new Date(deadlineISO))
        }));
    });

    it('should return 400 if deadline is missing or in the past', async () => {
        let response = await app.post(`/${transactionId}/sc/start-final-approval`)
            .set('Authorization', 'Bearer validtoken')
            .send({ }); // Missing deadline
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('finalApprovalDeadlineISO is required');

        const pastDeadline = new Date(Date.now() - 86400000).toISOString();
        response = await app.post(`/${transactionId}/sc/start-final-approval`)
            .set('Authorization', 'Bearer validtoken')
            .send({ finalApprovalDeadlineISO: pastDeadline });
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Final approval deadline must be in the future');
    });
  });

  // --- POST /:transactionId/sc/raise-dispute ---
  describe('POST /:transactionId/sc/raise-dispute', () => {
    const transactionId = 'txRaiseDispute';
    const conditionId = 'condInDispute';
    const mockTxData = {
        participants: [testUserId],
        buyerId: testUserId,
        status: 'AWAITING_FULFILLMENT',
        conditions: [{ id: conditionId, description: 'A condition', status: 'PENDING_BUYER_ACTION' }]
    };
    const deadlineISO = new Date(Date.now() + 7 * 86400000).toISOString();

    it('should sync dispute raised successfully', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const payload = { disputeResolutionDeadlineISO: deadlineISO, conditionId: conditionId };
        const response = await app.post(`/${transactionId}/sc/raise-dispute`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Backend synced: Dispute raised.');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            status: 'IN_DISPUTE',
            disputeResolutionDeadlineBackend: mockTimestamp.fromDate(new Date(deadlineISO)),
            conditions: expect.arrayContaining([expect.objectContaining({ id: conditionId, status: 'ACTION_WITHDRAWN_BY_BUYER' })])
        }));
    });

    it('should return 403 if non-buyer tries to sync dispute raise', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, buyerId: 'anotherBuyer' }) });
        const response = await app.post(`/${transactionId}/sc/raise-dispute`)
            .set('Authorization', 'Bearer validtoken').send({ disputeResolutionDeadlineISO: deadlineISO });
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Only the buyer can raise a dispute via this sync endpoint.');
    });

    it('should return 400 if deal is already in terminal state (e.g., COMPLETED)', async () => {
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, status: 'COMPLETED' }) });
        const response = await app.post(`/${transactionId}/sc/raise-dispute`)
            .set('Authorization', 'Bearer validtoken').send({ disputeResolutionDeadlineISO: deadlineISO });
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Deal is not in a state where a dispute can be raised');
    });
  });
}); 
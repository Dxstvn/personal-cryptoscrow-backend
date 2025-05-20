import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest'; // Import supertest
// import router from '../../transactionRoutes.js'; // Path to the router - Will be dynamically imported

console.log('[TEST FILE SCOPE V4] Top of test file.');

// Variables to hold the mock function instances.
// effectiveMockGetAdminAuth will be assigned by the factory.
let effectiveMockGetAdminAuth;
// effectiveMockVerifyIdToken is defined here and used by effectiveMockGetAdminAuth's implementation.
const effectiveMockVerifyIdToken = jest.fn();

console.log('[TEST FILE SCOPE V4] effectiveMockVerifyIdToken created.');

// --- Mock Firebase Admin SDK & Firestore/Auth related ---
// Factory for firebase-admin/auth
jest.unstable_mockModule('firebase-admin/auth', () => {
  console.log('[MOCK FACTORY V4] jest.unstable_mockModule for "firebase-admin/auth" - FACTORY EXECUTED.');
  // Create the mockGetAdminAuth function *inside* this factory's scope
  const mockGetAdminAuthInFactory = jest.fn();
  // Assign it to the higher-scoped variable so tests/beforeEach can access THIS instance
  effectiveMockGetAdminAuth = mockGetAdminAuthInFactory;
  console.log('[MOCK FACTORY V4] effectiveMockGetAdminAuth INSTANCE ASSIGNED via factory.');

  return {
    // This 'getAuth' is what 'transactionRoutes.js' will import and use.
    getAuth: (...args) => {
      console.log('[MOCK FACTORY getAuth PROXY V4] "getAuth" from factory proxy CALLED.');
      // It now calls the mockGetAdminAuthInFactory instance created within this factory's closure.
      const authResult = mockGetAdminAuthInFactory(...args);
      console.log('[MOCK FACTORY getAuth PROXY V4] mockGetAdminAuthInFactory returned:', authResult ? 'object' : authResult);
      return authResult;
    }
  };
});
console.log('[TEST FILE SCOPE V4] jest.unstable_mockModule for "firebase-admin/auth" REGISTERED.');

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

// jest.unstable_mockModule('firebase-admin/auth', () => ({ getAuth: mockGetAdminAuth })); // Old way

jest.unstable_mockModule('firebase-admin/firestore', () => {
  console.log('[MOCK FACTORY V4] jest.unstable_mockModule for "firebase-admin/firestore" - FACTORY EXECUTED.');
  return {
    getFirestore: mockGetFirestore,
    FieldValue: mockFieldValue,
    Timestamp: mockTimestamp,
  };
});
console.log('[TEST FILE SCOPE V4] jest.unstable_mockModule for "firebase-admin/firestore" REGISTERED.');

jest.unstable_mockModule('../../../auth/admin.js', () => {
  console.log('[MOCK FACTORY V4] jest.unstable_mockModule for "../../../auth/admin.js" - FACTORY EXECUTED.');
  return { adminApp: {} };
});
console.log('[TEST FILE SCOPE V4] jest.unstable_mockModule for "../../../auth/admin.js" REGISTERED.');

// --- Mock Ethers.js ---
const mockIsAddress = jest.fn();
const mockGetAddress = jest.fn();
const mockParseUnits = jest.fn();
jest.unstable_mockModule('ethers', () => {
  console.log('[MOCK FACTORY V4] jest.unstable_mockModule for "ethers" - FACTORY EXECUTED.');
  return {
    isAddress: mockIsAddress,
    getAddress: mockGetAddress,
    parseUnits: mockParseUnits,
  };
});
console.log('[TEST FILE SCOPE V4] jest.unstable_mockModule for "ethers" REGISTERED.');

// --- Mock Contract Deployer ---
const mockDeployPropertyEscrowContract = jest.fn();
jest.unstable_mockModule('../../../../../services/contractDeployer.js', () => {
  console.log('[MOCK FACTORY V4] jest.unstable_mockModule for "../../../../../services/contractDeployer.js" - FACTORY EXECUTED.');
  return {
    deployPropertyEscrowContract: mockDeployPropertyEscrowContract,
  };
});
console.log('[TEST FILE SCOPE V4] jest.unstable_mockModule for contractDeployer REGISTERED.');

// Helper to create a mock Express app with the router
// const setupApp = () => { // Will be handled in beforeEach
//   const app = express();
//   app.use(express.json());
//   app.use('/', router); // Mount router at root for these tests
//   return app;
// };

// Mock Express request and response objects
// ... existing code ...
describe('Unit Tests for transactionRoutes.js', () => {
  let app;
  let testAgent; // Declare testAgent
  let router; // To hold the dynamically imported router
  const testUserId = 'testUserId';
  const testUserEmail = 'user@example.com';

  beforeEach(async () => { // Make beforeEach async
    console.log('[TEST beforeEach V4] Clearing all mocks, resetting modules.');
    jest.resetModules(); // Reset modules before each test
    jest.clearAllMocks(); // Important to clear call counts, etc.

    // Dynamically import the router *after* mocks are set up and modules reset
    // This ensures it picks up the fresh mocks for "firebase-admin/auth" etc.
    const routerModule = await import('../../transactionRoutes.js');
    router = routerModule.default;
    console.log('[TEST beforeEach V4] Router dynamically imported.');

    app = express();
    app.use(express.json());
    app.use('/', router); // Use the dynamically imported router
    testAgent = request(app); // Create supertest agent
    console.log('[TEST beforeEach V4] Express app and supertest agent configured.');

    // Ensure effectiveMockGetAdminAuth has been initialized by the factory
    // This check should now pass because the factory for 'firebase-admin/auth'
    // will re-run due to jest.resetModules() and dynamic import of SUT.
    if (!effectiveMockGetAdminAuth) {
        throw new Error("[TEST SETUP ERROR V4] effectiveMockGetAdminAuth was not initialized by the mock factory prior to beforeEach!");
    }
    if (!effectiveMockVerifyIdToken) { // Should always be true as it's const jest.fn()
        throw new Error("[TEST SETUP ERROR V4] effectiveMockVerifyIdToken is not initialized prior to beforeEach!");
    }

    // Configure the main mock implementation for effectiveMockVerifyIdToken
    effectiveMockVerifyIdToken.mockImplementation(async (token) => {
      console.log(`[MOCK beforeEach effectiveMockVerifyIdToken V4] CALLED with token: '${token}'`);
      if (token === 'validtoken') {
        console.log(`[MOCK beforeEach effectiveMockVerifyIdToken V4] Recognized 'validtoken'`);
        return { uid: testUserId, email: testUserEmail };
      } else if (token === 'invalid') {
        console.log(`[MOCK beforeEach effectiveMockVerifyIdToken V4] Recognized 'invalid'`);
        const err = new Error('V4 Invalid token for effectiveMockVerifyIdToken');
        err.code = 'auth/invalid-id-token';
        throw err;
      } else {
        console.log(`[MOCK beforeEach effectiveMockVerifyIdToken V4] Recognized OTHER token: ${token}`);
        const err = new Error(`V4 Unexpected token in effectiveMockVerifyIdToken: ${token}`);
        err.code = 'auth/argument-error-v4';
        throw err;
      }
    });

    // Configure the main mock implementation for effectiveMockGetAdminAuth
    effectiveMockGetAdminAuth.mockImplementation((appArg) => {
      console.log('[MOCK beforeEach effectiveMockGetAdminAuth V4] CALLED.');
      // Optionally log appArg if needed: console.log(appArg);
      const authObject = { verifyIdToken: effectiveMockVerifyIdToken };
      console.log('[MOCK beforeEach effectiveMockGetAdminAuth V4] Returning auth object with verifyIdToken mock.');
      return authObject; // Crucially, this returns the effectiveMockVerifyIdToken
    });

    console.log('[TEST beforeEach V4] effectiveMockGetAdminAuth and effectiveMockVerifyIdToken implementations SET.');

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
    
    mockFieldValueArrayUnion.mockReturnValue('---mocked arrayUnion output---'); // Consistent mock value

    // runTransaction mock
    mockRunTransaction.mockImplementation(async (callback) => {
        const mockTransaction = { get: mockGet, update: mockUpdate, set: jest.fn(), delete: jest.fn() };
        return callback(mockTransaction);
    });
    console.log('[TEST beforeEach V4] All other mocks configured.');
  });

  // --- Middleware: authenticateToken (implicitly tested in routes) ---
  describe('authenticateToken Middleware', () => {
    it('should return 401 if no token provided', async () => {
        console.log('[TEST RUN V4] authenticateToken Middleware - 401 no token');
        const response = await testAgent.post('/create').send({}); // Any authenticated route
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Authentication token is required.');
    });
    it('should return 403 if token is invalid', async () => {
        console.log('[TEST RUN V4] authenticateToken Middleware - 403 invalid token');
        const response = await testAgent.post('/create').set('Authorization', 'Bearer invalid').send({});
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Authentication failed. Invalid or expired token.');
        expect(effectiveMockGetAdminAuth).toHaveBeenCalled(); // Check if getAuth was called
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('invalid'); // Verify it was called with 'invalid'
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
        console.log('[TEST RUN V4] POST /create - success BUYER initiated');

        const originalPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
        const originalRpcUrl = process.env.RPC_URL;
        process.env.DEPLOYER_PRIVATE_KEY = 'test_key_for_deployment';
        process.env.RPC_URL = 'test_rpc_for_deployment';

        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] }); // otherParty query
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' }); // db.collection('deals').add()

        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
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
        process.env.DEPLOYER_PRIVATE_KEY = originalPrivateKey;
        process.env.RPC_URL = originalRpcUrl;
    });
    
    it('should create a transaction successfully (SELLER initiated)', async () => {
        console.log('[TEST RUN V4] POST /create - success SELLER initiated');
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' });
        const payload = { ...basicPayload, initiatedBy: 'SELLER' };
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(201);
        expect(response.body.status).toBe('PENDING_BUYER_REVIEW');
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
            sellerId: testUserId,
            buyerId: 'otherPartyUid',
            status: 'PENDING_BUYER_REVIEW'
        }));
    });

    it('should skip contract deployment if env vars missing', async () => {
        console.log('[TEST RUN V4] POST /create - skip contract deployment');
        const originalPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
        const originalRpcUrl = process.env.RPC_URL; // Also check/restore RPC_URL
        delete process.env.DEPLOYER_PRIVATE_KEY;
        delete process.env.RPC_URL; // Ensure RPC_URL is also undefined for this test

        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' });

        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(201);
        expect(response.body.smartContractAddress).toBeNull();
        expect(mockDeployPropertyEscrowContract).not.toHaveBeenCalled();
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ smartContractAddress: null }));
        process.env.DEPLOYER_PRIVATE_KEY = originalPrivateKey; // Restore
        process.env.RPC_URL = originalRpcUrl; // Restore RPC_URL
    });
    
    it('should handle contract deployment failure', async () => {
        console.log('[TEST RUN V4] POST /create - handle contract deployment failure');

        const originalPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
        const originalRpcUrl = process.env.RPC_URL;
        process.env.DEPLOYER_PRIVATE_KEY = 'test_key_for_deployment_failure';
        process.env.RPC_URL = 'test_rpc_for_deployment_failure';

        mockDeployPropertyEscrowContract.mockRejectedValueOnce(new Error('Deployment failed badly'));
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockResolvedValueOnce({ id: 'newTransactionId' });

        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(201);
        expect(response.body.smartContractAddress).toBeNull();
        expect(response.body.deploymentWarning).toContain('deployment was attempted but failed');
        expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ smartContractAddress: null }));

        process.env.DEPLOYER_PRIVATE_KEY = originalPrivateKey;
        process.env.RPC_URL = originalRpcUrl;
    });

    // Input validation tests
    const requiredFields = ['initiatedBy', 'propertyAddress', 'amount', 'otherPartyEmail', 'buyerWalletAddress', 'sellerWalletAddress'];
    for (const field of requiredFields) {
        it(`should return 400 if ${field} is missing or invalid`, async () => {
            console.log(`[TEST RUN V4] POST /create - 400 invalid field: ${field}`);
            const payload = { ...basicPayload };

            // Reset mocks for this specific iteration to ensure isolation
            mockIsAddress.mockReset().mockReturnValue(true); // Default to true for valid addresses
            mockGet.mockReset();
             // Provide a default mock for otherPartyQuery to prevent 500s if validation fails earlier than expected by test
            mockGet.mockResolvedValue({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });


            if (field === 'amount') {
                payload[field] = -5; // Invalid amount
            } else if (field.includes('WalletAddress')) {
                payload[field] = 'TEST_INVALID_ADDRESS'; // Specific invalid string
                // This mock ensures that any call to isAddress with 'TEST_INVALID_ADDRESS' returns false for this iteration
                // and true for other addresses.
                mockIsAddress.mockImplementation(addr => {
                    // console.log(`[MOCK isAddress Test Loop Iter] checking ${addr}, is it TEST_INVALID_ADDRESS? ${addr === 'TEST_INVALID_ADDRESS'}`);
                    return addr !== 'TEST_INVALID_ADDRESS';
                });
            } else {
                 delete payload[field]; // For other missing required fields
            }

            const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
            expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
            
            if (field.includes('WalletAddress')) {
                expect(response.body.error).toMatch(/Valid (buyer|seller) wallet address is required/);
            } else if (field === 'initiatedBy') {
                expect(response.body.error).toBe('Invalid "initiatedBy". Must be "BUYER" or "SELLER".');
            } else if (field === 'propertyAddress'){
                expect(response.body.error).toBe('Property address is required.');
            } else if (field === 'amount'){
                expect(response.body.error).toBe('Amount must be a positive finite number.');
            } else if (field === 'otherPartyEmail'){
                expect(response.body.error).toBe('Valid other party email is required.');
            }
            expect(response.status).toBe(400);
        });
    }

    it('should return 400 if buyer and seller wallet addresses are the same', async () => {
        console.log('[TEST RUN V4] POST /create - 400 same wallet addresses');
        const sameWallet = '0xSameWalletIsValidFormatButSame';
        const payload = { ...basicPayload, buyerWalletAddress: sameWallet, sellerWalletAddress: sameWallet };
        
        // Ensure isAddress returns true for this formatted address
        mockIsAddress.mockImplementation(addr => addr === sameWallet);
        // Mock Firestore for otherPartyEmail lookup in case the primary validation fails silently or is bypassed
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });

        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Buyer and Seller wallet addresses cannot be the same.');
    });

    it('should return 400 if initialConditions are malformed', async () => {
        console.log('[TEST RUN V4] POST /create - 400 malformed initialConditions');
        const payload = { ...basicPayload, initialConditions: [{ id: 'c1' /* missing description */ }] };
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Initial conditions must be an array of objects');
    });
    
    it('should return 404 if otherPartyEmail not found in DB', async () => {
        console.log('[TEST RUN V4] POST /create - 404 otherPartyEmail not found');
        mockGet.mockResolvedValueOnce({ empty: true }); // Simulate user not found
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(404);
        expect(response.body.error).toContain(`User with email ${basicPayload.otherPartyEmail} not found.`);
    });

    it('should return 400 if initiator tries to create transaction with self', async () => {
        console.log('[TEST RUN V4] POST /create - 400 create with self');
        const payload = { ...basicPayload, otherPartyEmail: testUserEmail }; // Initiator's email
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Cannot create a transaction with yourself.');
    });

    it('should return 500 on Firestore error during creation', async () => {
        console.log('[TEST RUN V4] POST /create - 500 Firestore error');
        mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'otherPartyUid', data: () => ({ email: 'otherparty@example.com' }) }] });
        mockAdd.mockRejectedValueOnce(new Error('Firestore failed to add'));
        const response = await testAgent.post('/create').set('Authorization', 'Bearer validtoken').send(basicPayload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
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
        console.log('[TEST RUN V4] GET /:transactionId - success participant');
        mockGet.mockResolvedValueOnce({ exists: true, data: () => mockTxData, id: transactionId });
        const response = await testAgent.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(200);
        expect(response.body.id).toBe(transactionId);
        expect(response.body.propertyAddress).toBe('Test Prop');
    });

    it('should return 404 if transaction not found', async () => {
        console.log('[TEST RUN V4] GET /:transactionId - 404 not found');
        mockGet.mockResolvedValueOnce({ exists: false });
        const response = await testAgent.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Transaction not found.');
    });

    it('should return 403 if user is not a participant', async () => {
        console.log('[TEST RUN V4] GET /:transactionId - 403 not participant');
        mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...mockTxData, participants: ['anotherUser1', 'anotherUser2'] }) });
        const response = await testAgent.get(`/${transactionId}`).set('Authorization', 'Bearer validtoken');
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Access denied.');
    });
  });

  // --- GET / (List Transactions) ---
  describe('GET /', () => {
    it('should list transactions for the user', async () => {
        console.log('[TEST RUN V4] GET / - list transactions');
        const mockTxList = [{ id: 'tx1', data: () => ({ participants: [testUserId], createdAt: mockTimestamp.now() }) }];
        mockGet.mockResolvedValueOnce({ empty: false, docs: mockTxList });
        const response = await testAgent.get('/').set('Authorization', 'Bearer validtoken');
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].id).toBe('tx1');
    });
    it('should return empty array if no transactions found', async () => {
        console.log('[TEST RUN V4] GET / - empty list');
        mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
        const response = await testAgent.get('/').set('Authorization', 'Bearer validtoken');
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
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
        console.log('[TEST RUN V4] PUT /conditions/buyer-review - success');
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData }); // For transaction.get(doc)
        const payload = { newBackendStatus: 'FULFILLED_BY_BUYER', reviewComment: 'Looks good!' };
        const response = await testAgent.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
                            .set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(200);
        expect(response.body.message).toContain('Backend condition status updated');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            conditions: expect.arrayContaining([expect.objectContaining({ id: conditionId, status: 'FULFILLED_BY_BUYER', reviewComment: 'Looks good!' })])
        }));
    });

    it('should return 400 for invalid newBackendStatus', async () => {
        console.log('[TEST RUN V4] PUT /conditions/buyer-review - 400 invalid status');
        const response = await testAgent.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
                            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'INVALID_STATUS' });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid newBackendStatus');
    });
    
    it('should return 403 if updater is not the buyer', async () => {
        console.log('[TEST RUN V4] PUT /conditions/buyer-review - 403 not buyer');
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, buyerId: 'anotherBuyerUid' }) });
        const response = await testAgent.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
                            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Only the buyer can update this condition status.');
    });

    it('should return 404 if transaction not found', async () => {
        console.log('[TEST RUN V4] PUT /conditions/buyer-review - 404 tx not found');
        mockGet.mockResolvedValue({ exists: false }); // Transaction not found
        const response = await testAgent.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Transaction not found.');
    });

    it('should return 404 if condition not found in transaction', async () => {
        console.log('[TEST RUN V4] PUT /conditions/buyer-review - 404 condition not found');
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, conditions: [{id: 'otherCond'}] }) }); // Condition not there
        const response = await testAgent.put(`/${transactionId}/conditions/${conditionId}/buyer-review`)
            .set('Authorization', 'Bearer validtoken').send({ newBackendStatus: 'FULFILLED_BY_BUYER' });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Condition not found within the transaction.');
    });
  });

  // --- PUT /:transactionId/sync-status ---
  describe('PUT /:transactionId/sync-status', () => {
    const transactionId = 'txSyncStatus';
    const mockTxData = { participants: [testUserId], status: 'OLD_STATUS', fundsDepositedByBuyer: false, fundsReleasedToSeller: false };

    it('should sync status successfully', async () => {
        console.log('[TEST RUN V4] PUT /sync-status - success');
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const payload = { newSCStatus: 'AWAITING_FULFILLMENT', eventMessage: 'Synced from SC' };
        const response = await testAgent.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(200);
        expect(response.body.message).toContain('Transaction backend status synced/updated');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'AWAITING_FULFILLMENT', fundsDepositedByBuyer: true }));
    });
    
    it('should update fundsReleasedToSeller if status is COMPLETED', async () => {
        console.log('[TEST RUN V4] PUT /sync-status - funds released on COMPLETED');
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const payload = { newSCStatus: 'COMPLETED' };
        const response = await testAgent.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'COMPLETED', fundsReleasedToSeller: true, fundsDepositedByBuyer: true }));
    });

    it('should set deadlines if provided for IN_FINAL_APPROVAL or IN_DISPUTE', async () => {
        console.log('[TEST RUN V4] PUT /sync-status - set deadlines');
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const deadline = new Date(Date.now() + 86400000).toISOString();
        const payload = { newSCStatus: 'IN_FINAL_APPROVAL', finalApprovalDeadlineISO: deadline };
        await testAgent.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ 
            status: 'IN_FINAL_APPROVAL', 
            finalApprovalDeadlineBackend: mockTimestamp.fromDate(new Date(deadline)),
            fundsDepositedByBuyer: true, // ensure this is checked if applicable based on logs
            timeline: '---mocked arrayUnion output---',
            updatedAt: expect.any(Object)
        }));
    });
    
    it('should return 400 for invalid newSCStatus', async () => {
        console.log('[TEST RUN V4] PUT /sync-status - 400 invalid SC status');
        const response = await testAgent.put(`/${transactionId}/sync-status`).set('Authorization', 'Bearer validtoken').send({ newSCStatus: 'BAD_STATUS' });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
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
        console.log('[TEST RUN V4] POST /sc/start-final-approval - success');
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const response = await testAgent.post(`/${transactionId}/sc/start-final-approval`)
            .set('Authorization', 'Bearer validtoken')
            .send({ finalApprovalDeadlineISO: deadlineISO });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Backend synced: Final approval period started.');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            status: 'IN_FINAL_APPROVAL',
            finalApprovalDeadlineBackend: mockTimestamp.fromDate(new Date(deadlineISO)),
            timeline: '---mocked arrayUnion output---',
            updatedAt: expect.any(Object)
        }));
    });

    it('should return 400 if deadline is missing or in the past', async () => {
        console.log('[TEST RUN V4] POST /sc/start-final-approval - 400 bad deadline');
        let response = await testAgent.post(`/${transactionId}/sc/start-final-approval`)
            .set('Authorization', 'Bearer validtoken')
            .send({ }); // Missing deadline
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('finalApprovalDeadlineISO is required');

        const pastDeadline = new Date(Date.now() - 86400000).toISOString();
        response = await testAgent.post(`/${transactionId}/sc/start-final-approval`)
            .set('Authorization', 'Bearer validtoken')
            .send({ finalApprovalDeadlineISO: pastDeadline });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
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
        console.log('[TEST RUN V4] POST /sc/raise-dispute - success');
        mockGet.mockResolvedValue({ exists: true, data: () => mockTxData });
        const payload = { disputeResolutionDeadlineISO: deadlineISO, conditionId: conditionId };
        const response = await testAgent.post(`/${transactionId}/sc/raise-dispute`).set('Authorization', 'Bearer validtoken').send(payload);
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Backend synced: Dispute raised.');
        expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            status: 'IN_DISPUTE',
            disputeResolutionDeadlineBackend: mockTimestamp.fromDate(new Date(deadlineISO)),
            conditions: expect.arrayContaining([expect.objectContaining({ id: conditionId, status: 'ACTION_WITHDRAWN_BY_BUYER' })]),
            timeline: '---mocked arrayUnion output---',
            updatedAt: expect.any(Object)
        }));
    });

    it('should return 403 if non-buyer tries to sync dispute raise', async () => {
        console.log('[TEST RUN V4] POST /sc/raise-dispute - 403 non-buyer');
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, buyerId: 'anotherBuyer' }) });
        const response = await testAgent.post(`/${transactionId}/sc/raise-dispute`)
            .set('Authorization', 'Bearer validtoken').send({ disputeResolutionDeadlineISO: deadlineISO });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Only the buyer can raise a dispute via this sync endpoint.');
    });

    it('should return 400 if deal is already in terminal state (e.g., COMPLETED)', async () => {
        console.log('[TEST RUN V4] POST /sc/raise-dispute - 400 terminal state');
        mockGet.mockResolvedValue({ exists: true, data: () => ({ ...mockTxData, status: 'COMPLETED' }) });
        const response = await testAgent.post(`/${transactionId}/sc/raise-dispute`)
            .set('Authorization', 'Bearer validtoken').send({ disputeResolutionDeadlineISO: deadlineISO });
        expect(effectiveMockVerifyIdToken).toHaveBeenCalledWith('validtoken');
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Deal is not in a state where a dispute can be raised');
    });
  });
}); 
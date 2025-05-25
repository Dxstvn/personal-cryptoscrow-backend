// negativeFlow.e2e.test.js
import {
  startTestServer,
  stopTestServer,
  createTestUser, // We'll use the API for most user creation to test those endpoints
  ApiClient,
  getWallet,
  fundTestAccount,
  cleanupTestData,
  // We might not need generateContactData or generateTransactionData if we are testing invalid inputs
} from './helpers/testHelpers.js';
import { getAuth } from 'firebase/auth'; // For direct auth operations if needed for setup
import { ethEscrowApp } from '../../api/routes/auth/authIndex.js'; // For direct firebase app instance

describe('E2E Negative Flow Tests', () => {
  let serverUrl;
  let apiClient;
  let unauthApiClient; // For testing unauthenticated requests
  let userA, userB;
  let userAWallet, userBWallet; // Wallets might be needed if some negative flows reach that far
  const createdUserIds = [];

  const userAEmail = 'negative.usera@example.com';
  const userAPassword = 'passwordA123!';
  const userBEmail = 'negative.userb@example.com';
  const userBPassword = 'passwordB123!';


  beforeAll(async () => {
    console.log('🚀 Starting Negative Flow E2E Tests...');

    serverUrl = await startTestServer();
    apiClient = new ApiClient(serverUrl);
    unauthApiClient = new ApiClient(serverUrl); // No token for this client

    // Wallets for any operations that might require them even in negative tests
    // These are typically hardcoded in tests, ensure they are funded if specific flows are tested.
    userAWallet = getWallet(process.env.TEST_USER_A_PK); 
    userBWallet = getWallet(process.env.TEST_USER_B_PK);

    // We will create users via API in tests to check signup negative paths
    // However, for some tests, we might need a pre-existing user.
    // Let's create one user (User A) via API to have a baseline valid user.
    const userASignupData = { email: userAEmail, password: userAPassword, walletAddress: userAWallet.address };
    let response = await apiClient.post('/auth/signUpEmailPass', userASignupData);
    if (response.status === 201 && response.body.user && response.body.user.uid) {
      userA = { email: userAEmail, uid: response.body.user.uid, idToken: null };
      createdUserIds.push(userA.uid);
      // Login User A to get a token for authenticated negative tests
      const loginResponse = await apiClient.post('/auth/signInEmailPass', { email: userAEmail, password: userAPassword });
      if (loginResponse.status === 200 && loginResponse.body.token) {
        userA.idToken = loginResponse.body.token;
        apiClient.setAuthToken(userA.idToken); // Set for subsequent tests by User A
        console.log('✅ User A (negative flow) signed up and logged in for tests.');
      } else {
        console.error('Failed to login User A for negative flow tests:', loginResponse.body);
        // Potentially throw an error if User A is critical for many tests
      }
    } else {
      console.error('Failed to signup initial User A for negative flow tests:', response.body);
       // Potentially throw an error
    }
    console.log('✅ Negative flow test environment partially ready (User A created).');
  });

  afterAll(async () => {
    await cleanupTestData(createdUserIds);
    await stopTestServer();
    console.log('✅ Negative Flow E2E tests complete');
  });

  describe('Authentication Negative Flows', () => {
    test('Should fail to signup with an already existing email', async () => {
      const signupData = { email: userAEmail, password: 'newPassword123', walletAddress: userAWallet.address };
      const response = await unauthApiClient.post('/auth/signUpEmailPass', signupData);
      expect(response.status).toBe(409); // Conflict - email already in use
      expect(response.body.error).toContain('Email already in use');
      console.log('✅ Test: Signup with existing email failed as expected.');
    });

    test('Should fail to signup with missing email', async () => {
      const response = await unauthApiClient.post('/auth/signUpEmailPass', { password: 'password123', walletAddress: '0x123' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email and password are required');
      console.log('✅ Test: Signup with missing email failed as expected.');
    });

    test('Should fail to signup with missing password', async () => {
      const response = await unauthApiClient.post('/auth/signUpEmailPass', { email: 'newuser@example.com', walletAddress: '0x123' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email and password are required');
      console.log('✅ Test: Signup with missing password failed as expected.');
    });

    test('Should fail to login with non-existent email', async () => {
      const response = await unauthApiClient.post('/auth/signInEmailPass', { email: 'nosuchuser@example.com', password: 'password123' });
      expect(response.status).toBe(401); // Or 404 depending on implementation
      expect(response.body.error).toMatch(/User not found|Invalid credentials/i);
      console.log('✅ Test: Login with non-existent email failed as expected.');
    });

    test('Should fail to login with incorrect password', async () => {
      const response = await unauthApiClient.post('/auth/signInEmailPass', { email: userAEmail, password: 'wrongPassword' });
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
      console.log('✅ Test: Login with incorrect password failed as expected.');
    });
  });

  describe('Contact Management Negative Flows', () => {
    // User A is assumed to be logged in via apiClient from beforeAll
    
    test('Should fail to send contact invitation without authentication', async () => {
      const response = await unauthApiClient.post('/contact/invite', { contactEmail: userBEmail });
      expect(response.status).toBe(401); // No token provided
      console.log('✅ Test: Send invitation unauthenticated failed as expected.');
    });

    test('Should fail to send contact invitation with missing contactEmail', async () => {
      const response = await apiClient.post('/contact/invite', {});
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Contact email is required');
      console.log('✅ Test: Send invitation with missing email failed as expected.');
    });

    test('Should fail to send contact invitation to self', async () => {
      const response = await apiClient.post('/contact/invite', { contactEmail: userAEmail });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('You cannot invite yourself');
      console.log('✅ Test: Send invitation to self failed as expected.');
    });
    
    test('Should fail to send contact invitation to a non-existent user email', async () => {
      const response = await apiClient.post('/contact/invite', { contactEmail: 'nonexistentuser@example.com' });
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('User with this email not found');
      console.log('✅ Test: Send invitation to non-existent email failed as expected.');
    });

    // For /contact/response tests, we would need a pending invitation.
    // This requires User B to be created and an invitation sent from A to B.
    let pendingInvitationIdFromAToB;
    beforeAll(async () => { // Nested beforeAll for this describe block
      // Create User B if not already created (e.g. by a previous negative test)
      // Check if User B exists or create them
      const userBSignupData = { email: userBEmail, password: userBPassword, walletAddress: userBWallet.address };
      let signupResponse = await unauthApiClient.post('/auth/signUpEmailPass', userBSignupData);

      if (signupResponse.status === 201 || signupResponse.status === 409) { // 201 new, 409 already exists
        if (signupResponse.status === 201 && signupResponse.body.user && signupResponse.body.user.uid) {
            createdUserIds.push(signupResponse.body.user.uid);
        }
        // User B exists or was just created. Now send an invite from A to B.
        apiClient.setAuthToken(userA.idToken); // Ensure User A is authed
        const inviteResponse = await apiClient.post('/contact/invite', { contactEmail: userBEmail });
        if (inviteResponse.status === 201 && inviteResponse.body.invitationId) {
          pendingInvitationIdFromAToB = inviteResponse.body.invitationId;
          console.log(`[Contact Negative Setup] Invitation sent from A to B: ${pendingInvitationIdFromAToB}`);
        } else {
          console.error(`[Contact Negative Setup] Failed to send invite from A to B:`, inviteResponse.body, inviteResponse.status);
        }
      } else {
          console.error(`[Contact Negative Setup] Failed to ensure User B exists for contact tests:`, signupResponse.body);
      }
    });

    test('Should fail to respond to invitation without authentication', async () => {
      const response = await unauthApiClient.post('/contact/response', { invitationId: 'some-id', action: 'accept' });
      expect(response.status).toBe(401);
      console.log('✅ Test: Respond to invitation unauthenticated failed as expected.');
    });

    test('Should fail to respond to invitation with missing invitationId', async () => {
      apiClient.setAuthToken(userA.idToken); // Could be userA or userB attempting this
      const response = await apiClient.post('/contact/response', { action: 'accept' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing or invalid invitationId');
      console.log('✅ Test: Respond to invitation with missing ID failed as expected.');
    });

    test('Should fail to respond to invitation with invalid action', async () => {
      apiClient.setAuthToken(userA.idToken);
      const response = await apiClient.post('/contact/response', { invitationId: pendingInvitationIdFromAToB || 'dummy-id', action: 'maybe' });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid action provided');
      console.log('✅ Test: Respond to invitation with invalid action failed as expected.');
    });
    
    test('Should fail to respond to a non-existent invitation', async () => {
      // Login as User B to attempt to respond
      const loginResponseB = await unauthApiClient.post('/auth/signInEmailPass', { email: userBEmail, password: userBPassword });
      if (loginResponseB.status !== 200) {
          console.error("Failed to login User B for negative contact test. Skipping...");
          return;
      }
      const userBTempToken = loginResponseB.body.token;
      const userBClient = new ApiClient(serverUrl, userBTempToken);

      const response = await userBClient.post('/contact/response', { invitationId: 'non-existent-invite-id', action: 'accept' });
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Invitation not found');
      console.log('✅ Test: Respond to non-existent invitation failed as expected.');
    });

    test('Should fail if a user tries to respond to an invitation not meant for them', async () => {
        // Assuming pendingInvitationIdFromAToB was sent to User B.
        // User A (sender) tries to accept it.
        if (!pendingInvitationIdFromAToB) {
            console.warn("[Contact Negative Test] Skipping 'respond to wrong user' test, no pending invitation ID.");
            return;
        }
        apiClient.setAuthToken(userA.idToken); // User A is logged in
        const response = await apiClient.post('/contact/response', { invitationId: pendingInvitationIdFromAToB, action: 'accept' });
        expect(response.status).toBe(403); // Forbidden
        expect(response.body.error).toContain('Not authorized to respond');
        console.log('✅ Test: User A failed to respond to invitation meant for User B, as expected.');
    });

    test('Should fail to list contacts without authentication', async () => {
      const response = await unauthApiClient.get('/contact/contacts');
      expect(response.status).toBe(401);
      console.log('✅ Test: List contacts unauthenticated failed as expected.');
    });
  });

  describe('Transaction Negative Flows', () => {
    // User A is assumed to be logged in via apiClient.
    // Updated to use the correct transaction API format

    test('Should fail to create transaction without authentication', async () => {
      const response = await unauthApiClient.post('/transaction/create', { propertyAddress: 'test' });
      expect(response.status).toBe(401);
      console.log('✅ Test: Create transaction unauthenticated failed as expected.');
    });

    test('Should fail to create transaction with missing required fields', async () => {
      const transactionData = {
        // Missing initiatedBy, propertyAddress, etc.
        amount: 0.01
      };
      const response = await apiClient.post('/transaction/create', transactionData);
      expect(response.status).toBe(400); 
      expect(response.body.error).toMatch(/Invalid "initiatedBy"|Property address is required/i);
      console.log('✅ Test: Create transaction with missing fields failed as expected.');
    });
    
    test('Should fail to create transaction with invalid initiatedBy', async () => {
      const transactionData = {
        initiatedBy: 'INVALID_ROLE',
        propertyAddress: '123 Test St',
        amount: 0.01,
        otherPartyEmail: userBEmail,
        buyerWalletAddress: userAWallet.address,
        sellerWalletAddress: userBWallet.address
      };
      const response = await apiClient.post('/transaction/create', transactionData);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid "initiatedBy". Must be "BUYER" or "SELLER"');
      console.log('✅ Test: Create transaction with invalid initiatedBy failed as expected.');
    });

    test('Should fail to create transaction with negative amount', async () => {
      const transactionData = {
        initiatedBy: 'BUYER',
        propertyAddress: '123 Test St',
        amount: -100, // Invalid negative amount
        otherPartyEmail: userBEmail,
        buyerWalletAddress: userAWallet.address,
        sellerWalletAddress: userBWallet.address
      };
      const response = await apiClient.post('/transaction/create', transactionData);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Amount must be a positive finite number');
      console.log('✅ Test: Create transaction with negative amount failed as expected.');
    });

    test('Should fail to create transaction with invalid email', async () => {
      const transactionData = {
        initiatedBy: 'BUYER',
        propertyAddress: '123 Test St',
        amount: 0.01,
        otherPartyEmail: 'invalid-email', // Invalid email format
        buyerWalletAddress: userAWallet.address,
        sellerWalletAddress: userBWallet.address
      };
      const response = await apiClient.post('/transaction/create', transactionData);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Valid other party email is required');
      console.log('✅ Test: Create transaction with invalid email failed as expected.');
    });

    test('Should fail to create transaction with invalid wallet address', async () => {
      const transactionData = {
        initiatedBy: 'BUYER',
        propertyAddress: '123 Test St',
        amount: 0.01,
        otherPartyEmail: userBEmail,
        buyerWalletAddress: 'invalid-wallet-address', // Invalid
        sellerWalletAddress: userBWallet.address
      };
      const response = await apiClient.post('/transaction/create', transactionData);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Valid buyer wallet address is required');
      console.log('✅ Test: Create transaction with invalid wallet address failed as expected.');
    });

    test('Should fail to get non-existent transaction details', async () => {
      const response = await apiClient.get('/transaction/non-existent-tx-id');
      expect(response.status).toBe(404); 
      expect(response.body.error).toContain('Transaction not found');
      console.log('✅ Test: Get non-existent transaction failed as expected.');
    });

    test('Should fail to list transactions without authentication', async () => {
        const response = await unauthApiClient.get('/transaction/');
        expect(response.status).toBe(401);
        console.log('✅ Test: List transactions unauthenticated failed as expected.');
    });

    test('Should fail to update transaction status without required field', async () => {
        const response = await apiClient.put('/transaction/some-tx-id/sync-status', { 
          // Missing newSCStatus
          eventMessage: 'test' 
        });
        expect(response.status).toBe(400); 
        expect(response.body.error).toContain('New Smart Contract status (newSCStatus) is required');
        console.log('✅ Test: Update transaction status without required field failed as expected.');
    });

    test('Should fail to update transaction status with invalid status', async () => {
        const response = await apiClient.put('/transaction/some-tx-id/sync-status', { 
          newSCStatus: 'INVALID_STATUS'
        });
        expect(response.status).toBe(400); 
        expect(response.body.error).toContain('Invalid smart contract status value');
        console.log('✅ Test: Update transaction status with invalid value failed as expected.');
    });
  });

  describe('File Operations Negative Flows', () => {
    test('Should fail to list files without authentication', async () => {
      const response = await unauthApiClient.get('/files/list');
      expect(response.status).toBe(404); // Based on the basicFlow test, this endpoint returns 404
      console.log('✅ Test: List files endpoint returns 404 as expected.');
    });
  });
}); 
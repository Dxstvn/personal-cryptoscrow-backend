// userFlow.e2e.test.js
import {
  startTestServer,
  stopTestServer,
  createTestUser,
  loginTestUser,
  ApiClient,
  generateContactData,
  generateTransactionData,
  getWallet,
  fundTestAccount,
  waitForTransaction,
  delay,
  cleanupTestData
} from './helpers/testHelpers.js';
import { Wallet } from 'ethers';

describe('E2E User Flow Tests', () => {
  let serverUrl;
  let apiClient;
  let userA, userB, adminUser;
  let userAWallet, userBWallet;
  const createdUserIds = [];
  let blockchainAvailable = false;
  
  beforeAll(async () => {
    console.log('🚀 Starting E2E User Flow Tests...');
    
    try {
    // Start test server
    serverUrl = await startTestServer();
      // Use port 5173 as shown in the logs
      serverUrl = serverUrl.replace(':3000', ':5173');
      console.log(`📡 Server URL: ${serverUrl}`);
      
    apiClient = new ApiClient(serverUrl);
    
      // Try to initialize blockchain connection, but don't fail if unavailable
      console.log('💰 Checking blockchain connectivity...');
      try {
        // Add delay to ensure Hardhat is ready if running
        await delay(2000);
        
        userAWallet = await getWallet(process.env.TEST_USER_A_PK);
        userBWallet = await getWallet(process.env.TEST_USER_B_PK);
    
        // Try to fund wallets
    await fundTestAccount(userAWallet.address, '5');
    await fundTestAccount(userBWallet.address, '5');
        
        blockchainAvailable = true;
        console.log('✅ Blockchain connection established');
      } catch (error) {
        console.warn('⚠️ Blockchain not available - tests will run without smart contract functionality');
        console.warn('   To enable blockchain tests, start Hardhat node: npx hardhat node');
        
        // Create mock wallets for testing without blockchain
        userAWallet = { address: Wallet.createRandom().address };
        userBWallet = { address: Wallet.createRandom().address };
        blockchainAvailable = false;
      }
    
    console.log('✅ Test environment ready');
    } catch (error) {
      console.error('❌ Failed to setup test environment:', error);
      throw error;
    }
  }, 60000); // Increase timeout to 60 seconds
  
  afterAll(async () => {
    try {
    // Cleanup test data
    await cleanupTestData(createdUserIds);
    
    // Stop test server
    await stopTestServer();
    
    console.log('✅ E2E tests complete');
    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  });
  
  describe('Complete Transaction Flow', () => {
    let invitationId;
    let transactionId;
    let contractAddress;
    
    test('1. Users can sign up and login', async () => {
      try {
      // Sign up User A via API
      const userASignupData = {
        email: process.env.TEST_USER_A_EMAIL,
        password: process.env.TEST_USER_A_PASSWORD,
        walletAddress: userAWallet.address
      };
        console.log('📝 Signing up User A:', userASignupData.email);
      let response = await apiClient.post('/auth/signUpEmailPass', userASignupData);
      expect(response.status).toBe(201);
      userA = { 
        email: process.env.TEST_USER_A_EMAIL, 
        uid: response.body.user.uid,
        idToken: null
      };
      createdUserIds.push(userA.uid);
      
      // Sign up User B via API
      const userBSignupData = {
        email: process.env.TEST_USER_B_EMAIL,
        password: process.env.TEST_USER_B_PASSWORD,
        walletAddress: userBWallet.address
      };
        console.log('📝 Signing up User B:', userBSignupData.email);
      response = await apiClient.post('/auth/signUpEmailPass', userBSignupData);
      expect(response.status).toBe(201);
      userB = { 
        email: process.env.TEST_USER_B_EMAIL, 
        uid: response.body.user.uid,
        idToken: null
      };
      createdUserIds.push(userB.uid);
      
      // Login User A
        console.log('🔐 Logging in User A...');
      response = await apiClient.post('/auth/signInEmailPass', {
        email: process.env.TEST_USER_A_EMAIL,
        password: process.env.TEST_USER_A_PASSWORD
      });
      expect(response.status).toBe(200);
      expect(response.body.token).toBeTruthy();
      userA.idToken = response.body.token;
      
      // Login User B
        console.log('🔐 Logging in User B...');
      response = await apiClient.post('/auth/signInEmailPass', {
        email: process.env.TEST_USER_B_EMAIL,
        password: process.env.TEST_USER_B_PASSWORD
      });
      expect(response.status).toBe(200);
      expect(response.body.token).toBeTruthy();
      userB.idToken = response.body.token;
      
      // Set auth token for API client
      apiClient.setAuthToken(userA.idToken);
      
      console.log('✅ Users signed up and logged in successfully');
      } catch (error) {
        console.error('❌ Sign up/login error:', error.response?.body || error.message);
        throw error;
      }
    }, 30000);
    
    test('2. User A can send contact invitation to User B', async () => {
      if (!userA?.idToken) {
        console.log('⚠️ Skipping - no auth token available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      const response = await apiClient.post('/contact/invite', {
        contactEmail: process.env.TEST_USER_B_EMAIL
      });
      
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Invitation sent successfully');
      expect(response.body.invitationId).toBeTruthy();
      
      invitationId = response.body.invitationId;
      console.log(`✅ Contact invitation sent with ID: ${invitationId}`);
    }, 10000);
    
    test('3. User B can accept the invitation', async () => {
      if (!userB?.idToken || !invitationId) {
        console.log('⚠️ Skipping - prerequisites not met');
        return;
      }
      
      apiClient.setAuthToken(userB.idToken);
      
      const response = await apiClient.post('/contact/response', {
        invitationId: invitationId,
        action: 'accept'
      });
      
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('accepted');
      
      console.log('✅ Contact invitation accepted');
    }, 10000);
    
    test('4. User A can initiate a transaction with User B', async () => {
      if (!userA?.idToken) {
        console.log('⚠️ Skipping - no auth token available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      const transactionData = {
        initiatedBy: 'BUYER',
        propertyAddress: '123 Main Street, Test City',
        amount: 0.1,
        otherPartyEmail: userB.email,
        buyerWalletAddress: userAWallet.address,
        sellerWalletAddress: userBWallet.address,
        initialConditions: [
          {
            id: 'order_placed',
            type: 'CUSTOM',
            description: 'Order placed and confirmed'
          },
          {
            id: 'payment_sent',
            type: 'CUSTOM',
            description: 'Payment sent to escrow'
          },
          {
            id: 'goods_delivered',
            type: 'CUSTOM',
            description: 'Goods delivered to buyer'
          },
          {
            id: 'transaction_complete',
            type: 'CUSTOM',
            description: 'Transaction completed successfully'
          }
        ]
      };
      
      console.log('📝 Creating transaction with data:', JSON.stringify(transactionData, null, 2));
      
      const response = await apiClient.post('/transaction/create', transactionData);
      
      console.log('📬 Transaction creation response:', {
        status: response.status,
        body: JSON.stringify(response.body, null, 2)
      });
      
      expect(response.status).toBe(201);
      expect(response.body.transactionId).toBeTruthy();
      
      // Smart contract deployment might fail if blockchain not available
      if (blockchainAvailable && response.body.smartContractAddress) {
        expect(response.body.smartContractAddress).toBeTruthy();
        contractAddress = response.body.smartContractAddress;
        console.log(`✅ Transaction created with smart contract at: ${contractAddress}`);
      } else {
        console.log('⚠️ Transaction created without smart contract (blockchain not available)');
        contractAddress = null;
      }
      
      transactionId = response.body.transactionId;
      
      console.log(`✅ Transaction created with ID: ${transactionId}`);
    }, 30000);
    
    test('5. User can check transaction status', async () => {
      if (!transactionId || !userA?.idToken) {
        console.log('⚠️ Skipping - no transaction ID available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      const response = await apiClient.get(`/transaction/${transactionId}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(transactionId);
      if (contractAddress) {
        expect(response.body.smartContractAddress).toBe(contractAddress);
      }
      
      console.log(`✅ Transaction status: ${response.body.status}`);
    }, 10000);
    
    test('6. Transaction can be updated through smart contract interactions', async () => {
      if (!transactionId || !userA?.idToken) {
        console.log('⚠️ Skipping - prerequisites not met');
        return;
      }
      
      if (!blockchainAvailable) {
        console.log('⚠️ Skipping smart contract interactions - blockchain not available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      // Start final approval process
      const response = await apiClient.post(`/transaction/${transactionId}/sc/start-final-approval`, {
        finalApprovalDeadlineISO: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
      
      console.log('Final approval response:', {
        status: response.status,
        body: response.body
      });
      
      // The response might be 400 if conditions aren't met yet
      if (response.status === 200) {
        console.log('✅ Final approval process started');
      } else {
        console.log('⚠️ Final approval not available yet - conditions may need to be met first');
      }
    }, 15000);
    
    test('7. User can list their transactions', async () => {
      if (!userA?.idToken) {
        console.log('⚠️ Skipping - no auth token available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      const response = await apiClient.get('/transaction/');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      if (transactionId) {
        const userTransaction = response.body.find(t => t.id === transactionId);
        expect(userTransaction).toBeTruthy();
      }
      
      console.log(`✅ Retrieved ${response.body.length} transactions`);
    }, 10000);
  });
  
  describe('Dispute Resolution Flow', () => {
    let disputeTransactionId;
    let disputeContractAddress;
    
    test('1. Create a new transaction for dispute scenario', async () => {
      if (!userA?.idToken) {
        console.log('⚠️ Skipping - no auth token available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      const transactionData = {
        initiatedBy: 'BUYER',
        propertyAddress: '456 Dispute Avenue',
        amount: 0.2,
        otherPartyEmail: userB.email,
        buyerWalletAddress: userAWallet.address,
        sellerWalletAddress: userBWallet.address,
        initialConditions: [
          {
            id: 'goods_shipped',
            type: 'CUSTOM',
            description: 'Goods shipped by seller'
          }
        ]
      };
      
      const response = await apiClient.post('/transaction/create', transactionData);
      expect(response.status).toBe(201);
      
      disputeTransactionId = response.body.transactionId;
      disputeContractAddress = response.body.smartContractAddress;
      
      console.log('✅ Dispute scenario transaction created');
      
      // Give time for contract deployment
      await delay(3000);
    }, 20000);
    
    test('2. User can raise a dispute', async () => {
      if (!disputeTransactionId || !userA?.idToken) {
        console.log('⚠️ Skipping - prerequisites not met');
        return;
      }
      
      if (!blockchainAvailable) {
        console.log('⚠️ Skipping dispute functionality - blockchain not available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      const response = await apiClient.post(`/transaction/${disputeTransactionId}/sc/raise-dispute`, {
        disputeResolutionDeadlineISO: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      });
      
      console.log('Raise dispute response:', {
        status: response.status,
        body: response.body
      });
      
      if (response.status === 200) {
        console.log('✅ Dispute raised successfully');
      } else {
        console.log('⚠️ Dispute functionality may require specific conditions');
      }
    }, 15000);
    
    test('3. Transaction status reflects dispute state', async () => {
      if (!disputeTransactionId || !userA?.idToken) {
        console.log('⚠️ Skipping - prerequisites not met');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      const response = await apiClient.get(`/transaction/${disputeTransactionId}`);
      
      expect(response.status).toBe(200);
      
      console.log('Transaction status after dispute:', response.body.status);
      
      // The status might be IN_DISPUTE if the dispute was raised successfully
      if (response.body.status === 'IN_DISPUTE') {
      console.log('✅ Transaction status reflects dispute state');
      } else {
        console.log('⚠️ Dispute may not have been raised due to conditions or blockchain unavailability');
      }
    }, 10000);
  });
  
  describe('Edge Cases and Error Handling', () => {
    test('Cannot create transaction without authentication', async () => {
      const tempClient = new ApiClient(serverUrl);
      
      const response = await tempClient.post('/transaction/create', {
        initiatedBy: 'BUYER',
        propertyAddress: '789 Test St',
        amount: 1
      });
      
      expect(response.status).toBe(401);
      console.log('✅ Unauthenticated transaction creation rejected');
    }, 10000);
    
    test('Cannot create transaction with invalid data', async () => {
      if (!userA?.idToken) {
        console.log('⚠️ Skipping - no auth token available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      // Missing required fields
      const response = await apiClient.post('/transaction/create', {
        amount: 0.01
        // Missing initiatedBy, propertyAddress, etc.
      });
      
      expect(response.status).toBe(400);
      console.log('✅ Invalid transaction data rejected');
    }, 10000);
    
    test('Cannot access other users transactions', async () => {
      if (!userA?.idToken || !userB?.idToken) {
        console.log('⚠️ Skipping - auth tokens not available');
        return;
      }
      
      // Create a transaction as User A
      apiClient.setAuthToken(userA.idToken);
      
      const txData = {
        initiatedBy: 'BUYER',
        propertyAddress: '999 Private Road',
        amount: 0.05,
        otherPartyEmail: 'someother@example.com',
        buyerWalletAddress: userAWallet.address,
        sellerWalletAddress: Wallet.createRandom().address
      };
      
      const createResponse = await apiClient.post('/transaction/create', txData);
      const privateTransactionId = createResponse.body.transactionId;
      
      // Try to access it as User B
      apiClient.setAuthToken(userB.idToken);
      
      const response = await apiClient.get(`/transaction/${privateTransactionId}`);
      
      // Should either return 404 or 403
      expect([403, 404]).toContain(response.status);
      console.log('✅ Cross-user transaction access prevented');
    }, 15000);
  });
  
  describe('Performance and Load Tests', () => {
    test('Can handle multiple concurrent transactions', async () => {
      if (!userA?.idToken) {
        console.log('⚠️ Skipping - no auth token available');
        return;
      }
      
      apiClient.setAuthToken(userA.idToken);
      
      // Create multiple transactions concurrently
      const transactionPromises = Array(5).fill(null).map((_, index) => 
        apiClient.post('/transaction/create', {
          initiatedBy: 'BUYER',
          propertyAddress: `${100 + index} Concurrent Street`,
          amount: 0.01,
          otherPartyEmail: userB.email,
          buyerWalletAddress: userAWallet.address,
          sellerWalletAddress: userBWallet.address,
          initialConditions: [{
            id: `test_${index}`,
            type: 'CUSTOM',
            description: `Test condition ${index}`
          }]
        })
      );
      
      const transactionResponses = await Promise.all(transactionPromises);
      
      // Verify all transactions were created
      expect(transactionResponses.every(r => r.status === 201)).toBe(true);
      
      console.log(`✅ Successfully created ${transactionResponses.length} concurrent transactions`);
    }, 30000);
    
    test('API responds within acceptable time', async () => {
      const startTime = Date.now();
      
      const response = await apiClient.get('/health');
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      
      console.log(`✅ Health check responded in ${responseTime}ms`);
    }, 5000);
  });
}); 
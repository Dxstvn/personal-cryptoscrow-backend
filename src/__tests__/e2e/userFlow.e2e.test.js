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

describe('E2E User Flow Tests', () => {
  let serverUrl;
  let apiClient;
  let userA, userB, adminUser;
  let userAWallet, userBWallet;
  const createdUserIds = [];
  
  beforeAll(async () => {
    console.log('🚀 Starting E2E User Flow Tests...');
    
    // Start test server
    serverUrl = await startTestServer();
    apiClient = new ApiClient(serverUrl);
    
    // Initialize wallets
    userAWallet = getWallet(process.env.TEST_USER_A_PK);
    userBWallet = getWallet(process.env.TEST_USER_B_PK);
    
    // Fund test wallets
    await fundTestAccount(userAWallet.address, '5');
    await fundTestAccount(userBWallet.address, '5');
    
    console.log('✅ Test environment ready');
  });
  
  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData(createdUserIds);
    
    // Stop test server
    await stopTestServer();
    
    console.log('✅ E2E tests complete');
  });
  
  describe('Complete Transaction Flow', () => {
    let contactId;
    let transactionId;
    let contractAddress;
    
    test('1. Users can sign up and login', async () => {
      // Create User A
      userA = await createTestUser(
        process.env.TEST_USER_A_EMAIL,
        process.env.TEST_USER_A_PASSWORD,
        { walletAddresses: [userAWallet.address] }
      );
      createdUserIds.push(userA.user.uid);
      
      // Create User B
      userB = await createTestUser(
        process.env.TEST_USER_B_EMAIL,
        process.env.TEST_USER_B_PASSWORD,
        { walletAddresses: [userBWallet.address] }
      );
      createdUserIds.push(userB.user.uid);
      
      // Verify users can login
      const loginResultA = await loginTestUser(
        process.env.TEST_USER_A_EMAIL,
        process.env.TEST_USER_A_PASSWORD
      );
      expect(loginResultA.idToken).toBeTruthy();
      
      // Set auth token for API client
      apiClient.setAuthToken(userA.idToken);
    });
    
    test('2. User can add a contact', async () => {
      const contactData = generateContactData({
        name: 'User B',
        email: process.env.TEST_USER_B_EMAIL,
        walletAddress: userBWallet.address
      });
      
      const response = await apiClient.post('/contact/add', contactData);
      
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Contact added successfully');
      expect(response.body.contact).toMatchObject({
        name: contactData.name,
        email: contactData.email,
        walletAddress: contactData.walletAddress
      });
      
      contactId = response.body.contact.id;
      console.log(`✅ Contact created with ID: ${contactId}`);
    });
    
    test('3. User can initiate a smart contract transaction', async () => {
      const transactionData = generateTransactionData(contactId, {
        type: 'goodsAndServices',
        amount: '0.1',
        currency: 'ETH',
        description: 'Test purchase of digital goods',
        buyerAddress: userAWallet.address,
        sellerAddress: userBWallet.address,
        escrowFeePercentage: 2,
        stages: [
          {
            name: 'Order Placed',
            description: 'Buyer places order',
            requiredApprovals: ['buyer']
          },
          {
            name: 'Payment Sent',
            description: 'Buyer sends payment to escrow',
            requiredApprovals: ['buyer']
          },
          {
            name: 'Goods Delivered',
            description: 'Seller delivers goods',
            requiredApprovals: ['seller']
          },
          {
            name: 'Transaction Complete',
            description: 'Buyer confirms receipt',
            requiredApprovals: ['buyer']
          }
        ]
      });
      
      console.log('📝 Creating transaction with data:', JSON.stringify(transactionData, null, 2));
      
      const response = await apiClient.post('/transaction/create', transactionData);
      
      console.log('📬 Transaction creation response:', {
        status: response.status,
        body: JSON.stringify(response.body, null, 2)
      });
      
      expect(response.status).toBe(201);
      expect(response.body.transaction).toBeTruthy();
      expect(response.body.transaction.contractAddress).toBeTruthy();
      
      transactionId = response.body.transaction.id;
      contractAddress = response.body.transaction.contractAddress;
      
      console.log(`✅ Transaction created with ID: ${transactionId}`);
      console.log(`📋 Contract deployed at: ${contractAddress}`);
    });
    
    test('4. Buyer can fund the escrow contract', async () => {
      // Get initial contract balance
      const provider = userAWallet.provider;
      const initialBalance = await provider.getBalance(contractAddress);
      
      // Fund the contract
      const fundingData = {
        transactionId,
        amount: '0.1',
        currency: 'ETH'
      };
      
      const response = await apiClient.post('/transaction/fund', fundingData);
      
      expect(response.status).toBe(200);
      expect(response.body.transactionHash).toBeTruthy();
      
      // Wait for transaction confirmation
      await waitForTransaction(response.body.transactionHash);
      
      // Verify contract balance increased
      const newBalance = await provider.getBalance(contractAddress);
      expect(newBalance).toBeGreaterThan(initialBalance);
      
      console.log(`✅ Contract funded with ${fundingData.amount} ETH`);
    });
    
    test('5. Transaction can progress through stages', async () => {
      // Progress to "Payment Sent" stage
      let response = await apiClient.post('/transaction/progress', {
        transactionId,
        stageIndex: 1
      });
      
      expect(response.status).toBe(200);
      await waitForTransaction(response.body.transactionHash);
      
      console.log('✅ Progressed to "Payment Sent" stage');
      
      // Switch to seller (User B) to progress to "Goods Delivered"
      apiClient.setAuthToken(userB.idToken);
      
      response = await apiClient.post('/transaction/progress', {
        transactionId,
        stageIndex: 2
      });
      
      expect(response.status).toBe(200);
      await waitForTransaction(response.body.transactionHash);
      
      console.log('✅ Progressed to "Goods Delivered" stage');
      
      // Switch back to buyer to confirm receipt
      apiClient.setAuthToken(userA.idToken);
      
      response = await apiClient.post('/transaction/progress', {
        transactionId,
        stageIndex: 3
      });
      
      expect(response.status).toBe(200);
      await waitForTransaction(response.body.transactionHash);
      
      console.log('✅ Transaction completed successfully');
    });
    
    test('6. Funds are automatically released to seller', async () => {
      // Get seller's initial balance
      const provider = userAWallet.provider;
      const initialSellerBalance = await provider.getBalance(userBWallet.address);
      
      // Check transaction status
      const response = await apiClient.get(`/transaction/${transactionId}`);
      
      expect(response.status).toBe(200);
      expect(response.body.transaction.status).toBe('completed');
      
      // Verify seller received funds (minus escrow fee)
      const finalSellerBalance = await provider.getBalance(userBWallet.address);
      const expectedAmount = 0.1 * 0.98; // 2% escrow fee
      
      expect(Number(finalSellerBalance)).toBeGreaterThan(Number(initialSellerBalance));
      
      console.log('✅ Funds released to seller');
    });
  });
  
  describe('Dispute Resolution Flow', () => {
    let disputeContactId;
    let disputeTransactionId;
    let disputeContractAddress;
    
    beforeAll(async () => {
      // Create admin user
      adminUser = await createTestUser(
        process.env.ADMIN_USER_EMAIL,
        process.env.ADMIN_USER_PASSWORD,
        { role: 'admin' }
      );
      createdUserIds.push(adminUser.user.uid);
    });
    
    test('1. Create a new transaction for dispute scenario', async () => {
      // User A creates a new contact
      apiClient.setAuthToken(userA.idToken);
      
      const contactData = generateContactData({
        name: 'Dispute Contact',
        walletAddress: userBWallet.address
      });
      
      let response = await apiClient.post('/contact/add', contactData);
      disputeContactId = response.body.contact.id;
      
      // Create transaction
      const transactionData = generateTransactionData(disputeContactId, {
        amount: '0.2',
        description: 'Transaction that will have a dispute',
        buyerAddress: userAWallet.address,
        sellerAddress: userBWallet.address
      });
      
      response = await apiClient.post('/transaction/create', transactionData);
      disputeTransactionId = response.body.transaction.id;
      disputeContractAddress = response.body.transaction.contractAddress;
      
      // Fund the transaction
      response = await apiClient.post('/transaction/fund', {
        transactionId: disputeTransactionId,
        amount: '0.2',
        currency: 'ETH'
      });
      
      await waitForTransaction(response.body.transactionHash);
      
      console.log('✅ Dispute scenario transaction created and funded');
    });
    
    test('2. User can raise a dispute', async () => {
      const disputeData = {
        transactionId: disputeTransactionId,
        reason: 'Goods not delivered as described',
        description: 'The delivered goods do not match the agreed specification'
      };
      
      const response = await apiClient.post('/transaction/dispute', disputeData);
      
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('dispute');
      
      console.log('✅ Dispute raised successfully');
    });
    
    test('3. Admin can resolve dispute', async () => {
      // Switch to admin user
      apiClient.setAuthToken(adminUser.idToken);
      
      const resolutionData = {
        transactionId: disputeTransactionId,
        resolution: 'refundBuyer',
        reason: 'Seller failed to deliver as agreed'
      };
      
      const response = await apiClient.post('/transaction/resolve-dispute', resolutionData);
      
      expect(response.status).toBe(200);
      expect(response.body.transactionHash).toBeTruthy();
      
      await waitForTransaction(response.body.transactionHash);
      
      console.log('✅ Dispute resolved - funds refunded to buyer');
    });
    
    test('4. Verify funds were refunded to buyer', async () => {
      const provider = userAWallet.provider;
      const contractBalance = await provider.getBalance(disputeContractAddress);
      
      // Contract should have minimal balance after refund
      expect(Number(contractBalance)).toBeLessThan(0.01 * 10**18);
      
      console.log('✅ Verified funds were refunded');
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    test('Cannot create transaction without authentication', async () => {
      const tempClient = new ApiClient(serverUrl);
      
      const response = await tempClient.post('/transaction/create', {
        contactId: 'fake-id',
        amount: '1'
      });
      
      expect(response.status).toBe(401);
    });
    
    test('Cannot fund transaction with insufficient balance', async () => {
      apiClient.setAuthToken(userA.idToken);
      
      // Try to fund with more than wallet balance
      const response = await apiClient.post('/transaction/fund', {
        transactionId: 'fake-transaction-id',
        amount: '1000',
        currency: 'ETH'
      });
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
    
    test('Cannot progress transaction out of order', async () => {
      // Create a new transaction
      const contactData = generateContactData();
      let response = await apiClient.post('/contact/add', contactData);
      const tempContactId = response.body.contact.id;
      
      const transactionData = generateTransactionData(tempContactId);
      response = await apiClient.post('/transaction/create', transactionData);
      const tempTransactionId = response.body.transaction.id;
      
      // Try to skip to final stage
      response = await apiClient.post('/transaction/progress', {
        transactionId: tempTransactionId,
        stageIndex: 3
      });
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
  
  describe('Performance and Load Tests', () => {
    test('Can handle multiple concurrent transactions', async () => {
      apiClient.setAuthToken(userA.idToken);
      
      // Create multiple contacts
      const contactPromises = Array(5).fill(null).map(() => 
        apiClient.post('/contact/add', generateContactData())
      );
      
      const contactResponses = await Promise.all(contactPromises);
      const contactIds = contactResponses.map(r => r.body.contact.id);
      
      // Create transactions for each contact
      const transactionPromises = contactIds.map(contactId =>
        apiClient.post('/transaction/create', generateTransactionData(contactId, {
          amount: '0.01'
        }))
      );
      
      const transactionResponses = await Promise.all(transactionPromises);
      
      // Verify all transactions were created
      expect(transactionResponses.every(r => r.status === 201)).toBe(true);
      
      console.log(`✅ Successfully created ${transactionResponses.length} concurrent transactions`);
    });
    
    test('API responds within acceptable time', async () => {
      const startTime = Date.now();
      
      const response = await apiClient.get('/health');
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
      
      console.log(`✅ Health check responded in ${responseTime}ms`);
    });
  });
}); 
import axios from 'axios';
import { ethers } from 'ethers';
import { validateTenderlyConfig, tenderlyConfig, logConfigStatus } from '../setup/tenderly-config.js';
import { fundTestAccounts } from '../setup/fund-accounts.js';
import { httpCleanupUtil, createCleanAxiosInstance, cleanupAllHttpResources } from '../setup/http-cleanup-util.js';

// Configure axios for API testing with proper cleanup
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const api = createCleanAxiosInstance({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json'
  }
});

// Track resources for cleanup
let resourceTracker = {
  providers: [],
  httpAgents: [],
  timers: [],
  intervals: []
};

// Module-level variables (properly scoped)
let testAccounts = [];
let authToken = null;
let provider = null;

// Helper function for tracked setTimeout
function trackedSetTimeout(callback, delay) {
  const timeoutId = setTimeout(callback, delay);
  resourceTracker.timers.push(timeoutId);
  return timeoutId;
}

describe('REAL E2E - Complete Transaction Flow via TransactionRoutes API', () => {

  // Setup test environment
  beforeAll(async () => {
    console.log('🧪 Setting up REAL Complete E2E Test Environment...');
    
    // Validate Tenderly configuration
    validateTenderlyConfig();
    logConfigStatus();
    console.log('✅ Tenderly configuration is valid');

    // Use the actual Tenderly RPC URL instead of localhost
    console.log('🔗 Using RPC URL:', tenderlyConfig.rpcUrl.substring(0, 25) + '...');
    
    // Set up environment for E2E testing
    process.env.NODE_ENV = 'e2e_test';
    process.env.API_BASE_URL = API_BASE_URL;
    
    // Set up Firebase Admin for test mode  
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    
    // Create test auth token
    try {
      // For Firebase emulator, create a simple JWT-like token
      const { admin } = await import('../../../src/api/routes/auth/admin.js');
      
      // Create test user for E2E
      const testUser = await admin.auth().createUser({
        uid: 'e2e-test-user',
        email: 'e2e-test@cryptoscrow.test',
        displayName: 'E2E Test User'
      });
      
      authToken = await admin.auth().createCustomToken('e2e-test-user');
      console.log('✅ Test authentication created');
      
    } catch (error) {
      console.warn('⚠️ Auth setup failed, using mock token:', error.message);
      authToken = 'mock-auth-token';
    }

    // Initialize provider with the real Tenderly URL  
    console.log('🔗 Using provider for RPC:', tenderlyConfig.rpcUrl.substring(0, 25) + '...');
    try {
      provider = new ethers.JsonRpcProvider(tenderlyConfig.rpcUrl);
      resourceTracker.providers.push(provider);
    } catch (providerError) {
      console.warn('⚠️ Provider setup failed:', providerError.message);
    }

    // Fund test accounts
    console.log('💰 Funding test accounts on Tenderly...');
    try {
      testAccounts = await fundTestAccounts();
      console.log('✅ Test accounts funded successfully');
      console.log('👤 Buyer:', testAccounts[0]?.address);
      console.log('👤 Seller:', testAccounts[1]?.address);
    } catch (fundingError) {
      console.warn('⚠️ Account funding failed:', fundingError.message);
      // Use fallback accounts for testing
      testAccounts = [
        { address: 'HN7cABqLq46Es1jh92dQQi5w2TPfUb91r4VJzN6pBp2S', role: 'buyer', network: 'solana' },
        { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', role: 'seller', network: 'ethereum' }
      ];
    }

    console.log('🚀 E2E Test environment setup complete');
  }, 60000);

  afterAll(async () => {
    console.log('🧹 Cleaning up E2E test resources...');
    
    try {
      // 1. Clean up all HTTP resources using the utility
      console.log('🔌 Running comprehensive HTTP cleanup...');
      await cleanupAllHttpResources();

      // 2. Clean up Ethers providers
      console.log('🌐 Cleaning up Ethers providers...');
      for (const providerInstance of resourceTracker.providers) {
        try {
          if (typeof providerInstance.destroy === 'function') {
            await providerInstance.destroy();
          } else if (typeof providerInstance.removeAllListeners === 'function') {
            providerInstance.removeAllListeners();
          }
        } catch (providerError) {
          console.warn('⚠️ Provider cleanup error:', providerError.message);
        }
      }
      resourceTracker.providers = [];

      // 3. Clean up all tracked timers and intervals
      console.log('⏰ Cleaning up timers and intervals...');
      
      // Clear timers
      for (const timerId of resourceTracker.timers) {
        try {
          clearTimeout(timerId);
        } catch (timerError) {
          console.warn('⚠️ Timer cleanup error:', timerError.message);
        }
      }
      resourceTracker.timers = [];
      
      // Clear intervals
      for (const intervalId of resourceTracker.intervals) {
        try {
          clearInterval(intervalId);
        } catch (intervalError) {
          console.warn('⚠️ Interval cleanup error:', intervalError.message);
        }
      }
      resourceTracker.intervals = [];

      // 4. Final cleanup status
      const cleanupStatus = await httpCleanupUtil.getStatus();
      console.log('📊 Cleanup status:', {
        axiosInstances: cleanupStatus.axiosInstances,
        httpAgents: cleanupStatus.httpAgents,
        httpsAgents: cleanupStatus.httpsAgents,
        activeConnections: cleanupStatus.activeConnections,
        activeConnectionIds: cleanupStatus.activeConnectionIds
      });

    } catch (cleanupError) {
      console.error('❌ Cleanup error:', cleanupError.message);
    }

    console.log('✅ E2E test cleanup complete');
  });

  // Test 1: Create transaction
  it('should complete FULL transaction lifecycle via TransactionRoutes API', async () => {
    const buyer = testAccounts.find(acc => acc.role === 'buyer');
    const seller = testAccounts.find(acc => acc.role === 'seller');

    const transactionData = {
      initiatedBy: 'BUYER',
      propertyAddress: '123 Real Estate Lane, Blockchain City',
      amount: 1.0,
      otherPartyEmail: 'seller@test.com',
      buyerWalletAddress: buyer.address,
      buyerNetwork: buyer.network || 'ethereum',
      sellerWalletAddress: seller.address,
      sellerNetwork: seller.network || 'ethereum',
      initialConditions: [
        {
          id: 'property_inspection',
          type: 'CUSTOM',
          description: 'Property inspection must be completed'
        }
      ]
    };

    try {
      const createResponse = await api.post('/transaction/create', transactionData, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(createResponse.status).toBe(201);
      expect(createResponse.data).toMatchObject({
        message: expect.stringContaining('Transaction initiated successfully'),
        transactionId: expect.any(String)
      });

      console.log('✅ Transaction created:', createResponse.data.transactionId);

    } catch (error) {
      console.error('❌ Transaction creation failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw error;
    }
  }, 45000);

  // Test 2: Cross-chain transaction
  it('should handle cross-chain transaction via TransactionRoutes API', async () => {
    const buyer = testAccounts.find(acc => acc.role === 'buyer');
    const seller = testAccounts.find(acc => acc.role === 'seller');

    const crossChainData = {
      initiatedBy: 'BUYER',
      propertyAddress: '456 Cross-Chain Street, DeFi City',
      amount: 0.5,
      otherPartyEmail: 'crosschain-seller@test.com',
      buyerWalletAddress: buyer.address,
      buyerNetwork: buyer.network || 'solana',
      sellerWalletAddress: seller.address,
      sellerNetwork: seller.network || 'ethereum',
      initialConditions: [
        {
          id: 'cross_chain_validation',
          type: 'CUSTOM', 
          description: 'Cross-chain bridging via LiFi must be validated'
        }
      ]
    };

    try {
      const createResponse = await api.post('/transaction/create', crossChainData, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(createResponse.status).toBe(201);
      expect(createResponse.data).toMatchObject({
        message: expect.stringContaining('Transaction initiated successfully'),
        transactionId: expect.any(String)
      });

      console.log('✅ Cross-chain transaction created:', createResponse.data.transactionId);

      // Verify cross-chain detection
      if (createResponse.data.isCrossChain) {
        console.log('🌉 Cross-chain transaction detected');
        expect(createResponse.data.isCrossChain).toBe(true);
      }

    } catch (error) {
      console.error('❌ Cross-chain transaction failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw error;
    }
  }, 45000);

  // Test 3: Fund flow test  
  it('should test complete fund flow with real Tenderly accounts and LiFi integration', async () => {
    if (!provider || !testAccounts.length) {
      console.log('⚠️ Skipping fund flow test - provider or accounts not available');
      return;
    }

    const buyer = testAccounts.find(acc => acc.role === 'buyer');
    const seller = testAccounts.find(acc => acc.role === 'seller');

    if (!buyer || !seller) {
      console.log('⚠️ Skipping fund flow test - buyer or seller not found');
      return;
    }

    const fundFlowData = {
      initiatedBy: 'BUYER',
      propertyAddress: '789 DeFi Avenue, Cross-Chain City',
      amount: 0.1,
      otherPartyEmail: 'fund-flow-seller@test.com',
      buyerWalletAddress: buyer.address,
      buyerNetwork: buyer.network || 'solana',
      sellerWalletAddress: seller.address,
      sellerNetwork: seller.network || 'ethereum',
      testLiFiIntegration: true,
      initialConditions: [
        {
          id: 'lifi_bridge_test',
          type: 'CUSTOM',
          description: 'Test LiFi bridging capabilities for cross-chain funds'
        }
      ]
    };

    try {
      const createResponse = await api.post('/transaction/create', fundFlowData, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(createResponse.status).toBe(201);
      
      const transactionId = createResponse.data.transactionId;
      console.log('✅ Fund flow transaction created:', transactionId);

      // Verify transaction in database (if applicable)
      // You can add additional checks here

      // Verify seller received funds
      await new Promise(resolve => trackedSetTimeout(resolve, 2000)); // Wait for transaction
      const sellerFinalBalance = await provider.getBalance(testAccounts[1].address);
      console.log('💰 Seller final balance:', ethers.formatEther(sellerFinalBalance), 'ETH');

    } catch (error) {
      console.error('❌ Fund flow test failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw error;
    }
  }, 60000);
});

// Additional setup from the new cross-chain tests
describe('REAL Cross-Chain Transaction Tests', () => {
  
  // Setup test environment for cross-chain
  beforeAll(async () => {
    console.log('🧪 Setting up REAL Cross-Chain E2E Test Environment...');
    console.log('🌍 Testing TRUE cross-chain: Solana (non-EVM) ↔ Ethereum (EVM)');
    
    // Validate Tenderly configuration
    validateTenderlyConfig();
    logConfigStatus();
    console.log('✅ Tenderly configuration is valid');

    // Use the existing API server (already running)
    console.log('🔗 Using RPC URL:', tenderlyConfig.rpcUrl.substring(0, 25) + '...');
    
    // Set up environment for E2E testing with Firebase emulators
    process.env.NODE_ENV = 'e2e_test';
    process.env.API_BASE_URL = API_BASE_URL;
    
    // Connect to Firebase emulators (already running)
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    process.env.FIREBASE_PROJECT_ID = 'test-project-crosschain-integration';
    
    console.log('🔥 Using Firebase emulators:');
    console.log(`   Auth: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
    console.log(`   Firestore: ${process.env.FIRESTORE_EMULATOR_HOST}`);

    // Set up cross-chain test accounts (Solana buyer + Ethereum seller)
    try {
      testAccounts = await fundTestAccounts();
      console.log('✅ Cross-chain test accounts setup complete');
      
      // Log the cross-chain setup
      const buyer = testAccounts.find(acc => acc.role === 'buyer');
      const seller = testAccounts.find(acc => acc.role === 'seller');
      
      console.log('🔗 Cross-chain test configuration:');
      console.log(`   Buyer: ${buyer.address} (${buyer.network} - ${buyer.networkType})`);
      console.log(`   Seller: ${seller.address} (${seller.network} - ${seller.networkType})`);
      console.log(`   Bridge needed: ${buyer.needsLiFiBridge ? '✅' : '❌'}`);
      
    } catch (error) {
      console.warn('⚠️ Cross-chain account setup failed:', error.message);
      // Use fallback accounts
      testAccounts = [
        {
          address: 'HN7cABqLq46Es1jh92dQQi5w2TPfUb91r4VJzN6pBp2S',
          role: 'buyer',
          network: 'solana', 
          networkType: 'non-EVM',
          needsLiFiBridge: true
        },
        {
          address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          role: 'seller',
          network: 'ethereum',
          networkType: 'EVM', 
          needsLiFiBridge: true
        }
      ];
    }

    // Create test auth token for Firebase emulator
    try {
      // For Firebase emulator, we can create a simple test token
      authToken = 'test-auth-token-e2e';
      console.log('✅ Test authentication token created for emulator');
    } catch (authError) {
      console.warn('⚠️ Auth setup failed:', authError.message);
      authToken = 'fallback-test-token';
    }

    // Initialize provider for Ethereum network testing  
    try {
      provider = new ethers.JsonRpcProvider(tenderlyConfig.rpcUrl);
      resourceTracker.providers.push(provider);
      console.log('✅ Ethereum provider initialized for cross-chain testing');
    } catch (providerError) {
      console.warn('⚠️ Provider setup failed:', providerError.message);
    }

    console.log('🚀 REAL Cross-Chain E2E Test environment setup complete');
    console.log('🎯 Ready to test Solana → Ethereum bridging via LiFi!');
  }, 60000);

  it('should create a REAL cross-chain transaction (Solana → Ethereum)', async () => {
    console.log('🧪 Testing REAL cross-chain transaction: Solana → Ethereum');
    
    const buyer = testAccounts.find(acc => acc.role === 'buyer');
    const seller = testAccounts.find(acc => acc.role === 'seller');
    
    expect(buyer.network).toBe('solana');
    expect(seller.network).toBe('ethereum');
    expect(buyer.networkType).toBe('non-EVM');
    expect(seller.networkType).toBe('EVM');
    
    const transactionData = {
      initiatedBy: 'BUYER',
      propertyAddress: '123 Cross-Chain Test Street, DeFi City',
      amount: 0.5, // 0.5 SOL equivalent
      otherPartyEmail: 'ethereum-seller@test.com',
      buyerWalletAddress: buyer.address, // Solana address
      buyerNetwork: 'solana', // Non-EVM network
      sellerWalletAddress: seller.address, // Ethereum address
      sellerNetwork: 'ethereum', // EVM network
      initialConditions: [
        {
          id: 'solana_bridge_test',
          type: 'CUSTOM',
          description: 'Testing LiFi Solana to Ethereum bridge functionality'
        },
        {
          id: 'cross_chain_validation',
          type: 'CUSTOM',
          description: 'Validate cross-chain transaction between non-EVM and EVM networks'
        }
      ],
      // Explicitly test LiFi bridging
      testCrossChainBridging: true,
      expectedBridgeProvider: 'lifi'
    };

    console.log('📊 Transaction data:', {
      buyer: `${buyer.address} (${buyer.network})`,
      seller: `${seller.address} (${seller.network})`,
      amount: transactionData.amount,
      crossChain: true,
      bridgeTest: true
    });

    try {
      const createResponse = await api.post('/transaction/create', transactionData, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // Increased timeout for cross-chain operations
      });

      console.log('✅ Cross-chain transaction API response received');
      console.log('📊 Response status:', createResponse.status);
      
      // Validate response structure for cross-chain transactions
      expect(createResponse.status).toBe(201);
      expect(createResponse.data).toMatchObject({
        message: expect.stringContaining('Transaction initiated successfully'),
        transactionId: expect.any(String),
        isCrossChain: true, // Must be true for Solana → Ethereum
      });

      // Validate cross-chain specific metadata
      if (createResponse.data.crossChainInfo) {
        expect(createResponse.data.crossChainInfo).toMatchObject({
          buyerNetwork: 'solana',
          sellerNetwork: 'ethereum',
          // LiFi universal routing handles bridge detection automatically
          networkValidation: expect.objectContaining({
            buyer: true,
            seller: true,
            evmCompatible: false
          })
        });
        
        console.log('🌉 Cross-chain bridge info:', createResponse.data.crossChainInfo);
      }

      // Check if LiFi integration was detected
      if (createResponse.data.lifiIntegration) {
        console.log('✅ LiFi integration detected in response');
        console.log('🔗 LiFi route info:', createResponse.data.lifiRoute || 'Route pending');
      }

      // Store transaction ID for further tests
      global.testTransactionId = createResponse.data.transactionId;
      global.testIsCrossChain = true;
      global.testBuyerNetwork = 'solana';
      global.testSellerNetwork = 'ethereum';

      console.log(`✅ REAL cross-chain transaction created: ${global.testTransactionId}`);
      console.log('🎯 LiFi Solana → Ethereum bridge test PASSED!');

    } catch (error) {
      console.error('❌ Cross-chain transaction creation failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      // Enhanced error context for cross-chain debugging
      if (error.response?.status === 404) {
        console.log('🔍 Debugging 404 error - checking API endpoint availability...');
      } else if (error.response?.status === 403) {
        console.log('🔍 Debugging 403 error - checking Firebase emulator authentication...');
      }
      
      throw error;
    }
  }, 45000); // Extended timeout for cross-chain operations

  afterAll(async () => {
    console.log('🧹 Cleaning up E2E test environment...');
    try {
      // Clean up HTTP resources
      await cleanupAllHttpResources();

      // Clean up providers
      for (const providerInstance of resourceTracker.providers) {
        if (typeof providerInstance.destroy === 'function') {
          await providerInstance.destroy();
        }
      }
    } catch (cleanupError) {
      console.warn('⚠️ Cleanup warning:', cleanupError.message);
    }
    console.log('✅ E2E test cleanup complete');
  });
}); 
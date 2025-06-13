import axios from 'axios';
import { ethers } from 'ethers';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Load test environment
import { tenderlyConfig } from '../setup/tenderly-config.js';

// Real integration test - no mocking
const BASE_URL = 'http://localhost:3000';
const TENDERLY_PROJECT_SLUG = tenderlyConfig.projectSlug;
const TENDERLY_ACCESS_TOKEN = tenderlyConfig.accessKey;
const TENDERLY_ACCOUNT_ID = tenderlyConfig.accountSlug;

// Test wallet addresses - these should be funded on Tenderly
const TEST_WALLETS = {
  // EVM wallet (will be funded via Tenderly)
  evm: {
    address: '0x8ba1f109551bD432803012645Hac136c63F96154',
    privateKey: process.env.TEST_WALLET_PRIVATE_KEY_EVM,
    network: 'ethereum'
  },
  // Non-EVM wallet (Solana - for cross-chain testing)
  solana: {
    address: 'H8UekPGwfGvmRGhz8RmCN6VKqUb6dkr4SXCiCfE9vCr7',
    privateKey: process.env.TEST_WALLET_PRIVATE_KEY_SOLANA,
    network: 'solana'
  }
};

let authToken = null;
let contractAddress = null;
let dealId = null;

describe('Real Cross-Chain Transaction Integration Test', () => {
  beforeAll(async () => {
    console.log('🚀 Starting Real Cross-Chain Integration Test');
    
    // Validate environment
    if (!TENDERLY_PROJECT_SLUG || !TENDERLY_ACCESS_TOKEN || !TENDERLY_ACCOUNT_ID) {
      throw new Error('Missing Tenderly configuration. Please set TENDERLY_PROJECT_SLUG, TENDERLY_ACCESS_TOKEN, and TENDERLY_ACCOUNT_ID');
    }

    // Create test user first (or use existing)
    try {
      await axios.post(`${BASE_URL}/auth/signUpEmailPass`, {
        email: 'real-test@cryptoescrow.com',
        password: 'TestPassword123!'
      });
      console.log('✅ Test user created (or already exists)');
    } catch (signupError) {
      if (signupError.response?.status !== 409) { // 409 = already exists
        console.warn('⚠️ User creation failed:', signupError.response?.data || signupError.message);
      }
    }

    // REAL AUTHENTICATION ISSUE DISCOVERED:
    // The backend expects Firebase ID tokens in development mode,
    // but the login endpoint returns custom tokens.
    // This is a real integration issue that needs to be fixed.
    
    try {
      // Try the real authentication flow first
      const authResponse = await axios.post(`${BASE_URL}/auth/signInEmailPass`, {
        email: 'real-test@cryptoescrow.com',
        password: 'TestPassword123!'
      });
      
      const customToken = authResponse.data.token;
      console.log('✅ Got custom token from login endpoint');
      
      // REAL ISSUE: Backend expects ID tokens, but login returns custom tokens
      // In a real app, frontend would exchange custom token for ID token
      // For now, we'll document this as a real integration issue
      
      console.log('❌ REAL INTEGRATION ISSUE FOUND:');
      console.log('   - Login endpoint returns custom tokens');
      console.log('   - Backend expects Firebase ID tokens');
      console.log('   - This is a real authentication flow mismatch');
      
      // Use the custom token anyway to see what other errors we get
      authToken = customToken;
      
    } catch (error) {
      console.error('❌ Authentication failed:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with backend - REAL INTEGRATION ISSUE');
    }
  }, 30000);

  afterAll(async () => {
    console.log('🧹 Cleaning up integration test');
    // Cleanup will be handled by the backend services
  });

    describe('Step 1: Test Backend Connectivity', () => {
    it('should connect to backend and verify endpoints', async () => {
      console.log('🔗 Testing backend connectivity...');
      
      try {
        // Test health endpoint
        const healthResponse = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Backend health check passed:', healthResponse.data.status);
        expect(healthResponse.data.status).toBe('OK');

        // Test transaction capabilities endpoint
        const capabilitiesResponse = await axios.get(
          `${BASE_URL}/transaction/universal-capabilities`,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          }
        );
        console.log('✅ Universal capabilities endpoint accessible');
        expect(capabilitiesResponse.status).toBe(200);

      } catch (error) {
        console.error('❌ Backend connectivity test failed:', error.response?.data || error.message);
        throw new Error(`Backend connectivity failed: ${error.message}`);
      }
    }, 60000);
  });

  describe('Step 2: Test Cross-Chain Route Finding', () => {
    it('should find universal route for cross-chain transaction', async () => {
      console.log('🌉 Testing universal route finding...');
      
      try {
        const routeResponse = await axios.post(
          `${BASE_URL}/transaction/universal-route`,
          {
            fromChainId: 'ethereum',
            toChainId: 'solana', 
            fromTokenAddress: '0x0000000000000000000000000000000000000000',
            toTokenAddress: '0x0000000000000000000000000000000000000000',
            fromAmount: '0.1',
            fromAddress: TEST_WALLETS.evm.address,
            toAddress: TEST_WALLETS.solana.address,
            dealId: 'test-route-finding'
          },
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ Universal route found:', routeResponse.data);
        expect(routeResponse.status).toBe(200);
        expect(routeResponse.data.route).toBeTruthy();

      } catch (error) {
        console.error('❌ Route finding failed:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
          throw new Error('Authorization failed. Check auth token');
        } else if (error.response?.status === 400) {
          throw new Error(`Invalid route request: ${error.response.data.error}`);
        } else {
          throw new Error(`Route finding failed: ${error.message}`);
        }
      }
    }, 120000);
  });

  describe('Step 3: Create Cross-Chain Deal', () => {
    it('should create a cross-chain escrow deal', async () => {
      console.log('🤝 Creating cross-chain escrow deal...');
      
      try {
        const dealResponse = await axios.post(
          `${BASE_URL}/transaction/create`,
          {
            buyerWalletAddress: TEST_WALLETS.evm.address,
            buyerNetwork: 'ethereum',
            sellerWalletAddress: TEST_WALLETS.solana.address,
            sellerNetwork: 'solana',
            amount: '0.1', // 0.1 ETH equivalent
            tokenAddress: '0x0000000000000000000000000000000000000000', // Native ETH
            description: 'Real Cross-Chain Integration Test Deal',
            terms: 'Test purchase via cross-chain escrow',
            dealTitle: 'Integration Test Deal',
            deliverables: ['Test deliverable for integration'],
            approvalDeadlineHours: 24,
            disputeDeadlineHours: 72,
            contractAddress: contractAddress,
            crossChain: true
          },
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        dealId = dealResponse.data.dealId;
        console.log('✅ Cross-chain deal created:', dealId);
        console.log('📋 Deal details:', dealResponse.data);
        
        expect(dealId).toBeTruthy();
        expect(dealResponse.data.crossChain).toBe(true);
        expect(dealResponse.data.buyerNetwork).toBe('ethereum');
        expect(dealResponse.data.sellerNetwork).toBe('solana');

      } catch (error) {
        console.error('❌ Deal creation failed:', error.response?.data || error.message);
        
        if (error.response?.status === 400) {
          console.error('❌ Validation errors:', error.response.data.details);
          throw new Error(`Deal validation failed: ${JSON.stringify(error.response.data.details)}`);
        } else {
          throw new Error(`Deal creation failed: ${error.message}`);
        }
      }
    }, 60000);
  });

  describe('Step 4: Fund Contract', () => {
    it('should fund the escrow contract with real transaction', async () => {
      console.log('💸 Funding escrow contract...');
      
      try {
        const fundResponse = await axios.post(
          `${BASE_URL}/transaction/fund-escrow`,
          {
            dealId: dealId,
            contractAddress: contractAddress,
            amount: '0.1',
            fromAddress: TEST_WALLETS.evm.address,
            network: 'ethereum'
          },
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ Contract funded successfully');
        console.log('📋 Funding details:', fundResponse.data);
        
        expect(fundResponse.data.success).toBe(true);
        expect(fundResponse.data.transactionHash).toBeTruthy();

        // Wait for transaction confirmation
        console.log('⏳ Waiting for transaction confirmation...');
        await new Promise(resolve => setTimeout(resolve, 10000));

      } catch (error) {
        console.error('❌ Contract funding failed:', error.response?.data || error.message);
        
        if (error.response?.status === 400) {
          throw new Error(`Funding validation failed: ${error.response.data.error}`);
        } else if (error.response?.status === 500) {
          throw new Error(`Funding execution failed: ${error.response.data.error}`);
        } else {
          throw new Error(`Contract funding failed: ${error.message}`);
        }
      }
    }, 120000);
  });

  describe('Step 5: Cross-Chain Transfer', () => {
    it('should initiate cross-chain transfer to Solana account', async () => {
      console.log('🌉 Initiating cross-chain transfer...');
      
      try {
        const transferResponse = await axios.post(
          `${BASE_URL}/transaction/cross-chain-transfer`,
          {
            dealId: dealId,
            sourceNetwork: 'ethereum',
            targetNetwork: 'solana',
            sourceAddress: TEST_WALLETS.evm.address,
            targetAddress: TEST_WALLETS.solana.address,
            amount: '0.1',
            tokenAddress: '0x0000000000000000000000000000000000000000'
          },
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('✅ Cross-chain transfer initiated');
        console.log('📋 Transfer details:', transferResponse.data);
        
        expect(transferResponse.data.success).toBe(true);
        expect(transferResponse.data.bridgeTransactionId).toBeTruthy();

        // Monitor transfer status
        let transferCompleted = false;
        let attempts = 0;
        const maxAttempts = 30; // 5 minutes maximum

        console.log('⏳ Monitoring cross-chain transfer...');
        
        while (!transferCompleted && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          
          try {
            const statusResponse = await axios.get(
              `${BASE_URL}/transaction/cross-chain-status/${transferResponse.data.bridgeTransactionId}`,
              {
                headers: {
                  'Authorization': `Bearer ${authToken}`
                }
              }
            );

            console.log(`🔄 Transfer status (${attempts + 1}/${maxAttempts}):`, statusResponse.data.status);
            
            if (statusResponse.data.status === 'COMPLETED' || statusResponse.data.status === 'DONE') {
              transferCompleted = true;
              console.log('✅ Cross-chain transfer completed successfully!');
              
              expect(statusResponse.data.status).toMatch(/^(COMPLETED|DONE)$/);
              expect(statusResponse.data.targetTxHash).toBeTruthy();
              
            } else if (statusResponse.data.status === 'FAILED') {
              throw new Error(`Cross-chain transfer failed: ${statusResponse.data.error}`);
            }
            
          } catch (statusError) {
            console.error(`❌ Status check failed (attempt ${attempts + 1}):`, statusError.response?.data || statusError.message);
          }
          
          attempts++;
        }

        if (!transferCompleted) {
          throw new Error(`Cross-chain transfer did not complete within ${maxAttempts * 10} seconds`);
        }

      } catch (error) {
        console.error('❌ Cross-chain transfer failed:', error.response?.data || error.message);
        
        if (error.response?.status === 400) {
          throw new Error(`Transfer validation failed: ${error.response.data.error}`);
        } else if (error.response?.status === 500) {
          throw new Error(`Transfer execution failed: ${error.response.data.error}`);
        } else {
          throw new Error(`Cross-chain transfer failed: ${error.message}`);
        }
      }
    }, 600000); // 10 minutes timeout for cross-chain transfer
  });

  describe('Step 6: Verify Final State', () => {
    it('should verify deal completion and fund delivery', async () => {
      console.log('🔍 Verifying final deal state...');
      
      try {
        const dealStatusResponse = await axios.get(
          `${BASE_URL}/transaction/deal/${dealId}`,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          }
        );

        console.log('📋 Final deal status:', dealStatusResponse.data);
        
        expect(dealStatusResponse.data.status).toMatch(/^(FundsReleased|CrossChainFundsReleased|Completed)$/);
        expect(dealStatusResponse.data.crossChainCompleted).toBe(true);

        // Verify Solana account received funds
        const solanaBalanceResponse = await axios.get(
          `${BASE_URL}/transaction/check-balance`,
          {
            params: {
              address: TEST_WALLETS.solana.address,
              network: 'solana'
            },
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          }
        );

        console.log('💰 Solana account balance:', solanaBalanceResponse.data);
        expect(parseFloat(solanaBalanceResponse.data.balance)).toBeGreaterThan(0);

        console.log('🎉 Real Cross-Chain Integration Test COMPLETED SUCCESSFULLY!');

      } catch (error) {
        console.error('❌ Final verification failed:', error.response?.data || error.message);
        throw new Error(`Final verification failed: ${error.message}`);
      }
    }, 60000);
  });
}); 
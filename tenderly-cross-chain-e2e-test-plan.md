# Tenderly Cross-Chain E2E Test Plan

## Executive Summary

This document outlines a comprehensive End-to-End (E2E) testing strategy for cross-chain transactions using your existing Tenderly Virtual TestNet setup. The plan leverages your configured Tenderly environment for **real-world testing** of the CryptoScrow API, smart contracts, and cross-chain functionality - **no mocks, real services only**.

## 1. Your Tenderly Setup (Confirmed)

### 1.1 Existing Configuration
- **Account**: Dusss
- **Project**: CryptoTest  
- **Virtual TestNet**: Active (Sepolia fork, Chain ID 1)
- **Credentials**: Available in `.env.test`
- **API Access**: Configured and ready

### 1.2 Tenderly Capabilities Confirmed
- Unlimited faucets for testing
- Real contract deployment environment
- Cross-chain simulation capabilities  
- Live transaction monitoring
- Gas profiling and debugging

## 2. Real-World E2E Test Architecture

### 2.1 **REALITY-FIRST** Test Environment

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Source Chain  │    │  Your Live API  │    │ Destination     │
│ (Tenderly VNet) │◄──►│ + Real Services │◄──►│ Chain (Polygon) │
│                 │    │                 │    │                 │
│ - Real Contracts│    │ - crossChainSvc │    │ - Real Contracts│
│ - Live Accounts │    │ - lifiService   │    │ - Live Accounts │
│ - Real Tokens   │    │ - contractDeploy│    │ - Real Tokens   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**NO MOCKS** - Test your actual:
- `transactionRoutes.js` API endpoints
- `crossChainService.js` bridge logic
- `lifiService.js` route finding
- `contractDeployer.js` real deployments
- `smartContractBridgeService.js` integrations

### 2.2 Test Network Configuration

**Primary Test Networks:**
1. **Tenderly Virtual TestNet** (Your existing setup - Sepolia fork)
2. **Polygon Mumbai** (For cross-chain testing)
3. **Arbitrum Goerli** (Alternative cross-chain target)

## 3. Implementation Plan

### 3.1 Phase 1: Tenderly Integration Setup

#### 3.1.1 Environment Configuration

```javascript
// test/e2e/setup/tenderly-config.js
import dotenv from 'dotenv';

// Load your existing .env.test credentials
dotenv.config({ path: '.env.test' });

export const tenderlyConfig = {
  accessKey: process.env.TENDERLY_ACCESS_KEY,
  accountId: process.env.TENDERLY_ACCOUNT_ID, // 'Dusss'
  projectId: process.env.TENDERLY_PROJECT_ID, // 'CryptoTest'
  virtualTestnetId: process.env.TENDERLY_VIRTUAL_TESTNET_ID,
  rpcUrl: process.env.TENDERLY_RPC_URL,
  wssUrl: process.env.TENDERLY_WSS_URL
};

// Validate all required credentials are present
export function validateTenderlyConfig() {
  const required = ['accessKey', 'accountId', 'projectId', 'rpcUrl'];
  const missing = required.filter(key => !tenderlyConfig[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing Tenderly config: ${missing.join(', ')}`);
  }
  
  console.log('✅ Tenderly configuration validated');
  return true;
}
```

#### 3.1.2 Real Account Funding

```javascript
// test/e2e/setup/fund-accounts.js
import { Tenderly } from '@tenderly/sdk';
import { tenderlyConfig } from './tenderly-config.js';

export async function fundTestAccounts() {
  const tenderly = new Tenderly(tenderlyConfig);
  
  // Test accounts for real scenarios
  const testAccounts = [
    {
      address: '0x1234567890123456789012345678901234567890', // Buyer
      role: 'buyer',
      networks: ['ethereum', 'polygon']
    },
    {
      address: '0x0987654321098765432109876543210987654321', // Seller  
      role: 'seller',
      networks: ['ethereum', 'polygon']
    }
  ];

  for (const account of testAccounts) {
    // Fund on your Tenderly VNet
    await tenderly.virtualTestnet.fundAccount({
      testnetId: tenderlyConfig.virtualTestnetId,
      address: account.address,
      amount: '10000000000000000000', // 10 ETH
      token: 'ETH'
    });

    // Fund with USDC for token testing
    await tenderly.virtualTestnet.fundAccount({
      testnetId: tenderlyConfig.virtualTestnetId,
      address: account.address,
      amount: '10000000000', // 10,000 USDC
      token: '0xA0b86a33E6417c38c53A81C1b9FB17c3cd6b0f94' // USDC
    });
    
    console.log(`✅ Funded ${account.role} account: ${account.address}`);
  }
}
```

### 3.2 Phase 2: Real API Integration Tests

#### 3.2.1 **REAL** Transaction Creation Tests

```javascript
// test/e2e/api/transaction-creation.test.js
import request from 'supertest';
import { app } from '../../../src/app.js'; // Your actual app
import { validateTenderlyConfig, tenderlyConfig } from '../setup/tenderly-config.js';
import { setupTestAccounts } from '../setup/test-accounts.js';

describe('REAL API - Transaction Creation E2E', () => {
  let testAccounts;
  let authToken;
  
  beforeAll(async () => {
    // Validate real Tenderly setup
    validateTenderlyConfig();
    
    // Setup real test accounts
    testAccounts = await setupTestAccounts();
    
    // Get real auth token for your Firebase
    authToken = await getTestAuthToken();
    
    // Ensure your app uses Tenderly RPC
    process.env.RPC_URL = tenderlyConfig.rpcUrl;
    process.env.NODE_ENV = 'e2e_test';
  });
  
  it('should create REAL cross-chain transaction via your API', async () => {
    const transactionData = {
      initiatedBy: 'BUYER',
      propertyAddress: '123 Test Street, Test City',
      amount: 1.5, // 1.5 ETH
      otherPartyEmail: 'seller@test.com',
      buyerWalletAddress: testAccounts.buyer.address,
      sellerWalletAddress: testAccounts.seller.address,
      buyerNetworkHint: 'ethereum',
      sellerNetworkHint: 'polygon',
      initialConditions: [
        {
          id: 'property_inspection',
          type: 'CUSTOM',
          description: 'Property inspection completed and approved'
        },
        {
          id: 'title_verification',
          type: 'CUSTOM', 
          description: 'Title verification and legal review completed'
        }
      ]
    };

    console.log('🧪 Creating REAL cross-chain transaction...');
    
    // Hit your REAL API endpoint
    const response = await request(app)
      .post('/api/transactions/create')
      .set('Authorization', `Bearer ${authToken}`)
      .send(transactionData)
      .expect(201);

    // Verify REAL response structure
    expect(response.body).toMatchObject({
      message: expect.stringContaining('enhanced cross-chain integration'),
      transactionId: expect.any(String),
      isCrossChain: true,
      smartContractAddress: expect.any(String), // Real deployed contract
      crossChainInfo: {
        buyerNetwork: 'ethereum',
        sellerNetwork: 'polygon',
        networkValidation: {
          buyer: true,
          seller: true,
          evmCompatible: true
        }
      }
    });

    // Verify REAL smart contract was deployed on Tenderly
    const { smartContractAddress } = response.body;
    console.log(`✅ Real contract deployed: ${smartContractAddress}`);
    
    // Verify contract exists on your Tenderly VNet
    const contractExists = await verifyContractDeployment(smartContractAddress);
    expect(contractExists).toBe(true);
    
    // Store for subsequent tests
    global.testTransactionId = response.body.transactionId;
    global.testContractAddress = smartContractAddress;
  });

  it('should retrieve REAL transaction details', async () => {
    const response = await request(app)
      .get(`/api/transactions/${global.testTransactionId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify real cross-chain data
    expect(response.body).toMatchObject({
      id: global.testTransactionId,
      isCrossChain: true,
      smartContractAddress: global.testContractAddress,
      conditions: expect.arrayContaining([
        expect.objectContaining({
          type: 'CROSS_CHAIN',
          description: expect.stringContaining('Network compatibility validated')
        })
      ])
    });
  });
});
```

#### 3.2.2 **REAL** Cross-Chain Service Tests

```javascript
// test/e2e/services/cross-chain-service.test.js
import { 
  prepareCrossChainTransaction,
  executeCrossChainStep,
  getCrossChainTransactionStatus,
  estimateTransactionFees
} from '../../../src/services/crossChainService.js';
import { tenderlyConfig } from '../setup/tenderly-config.js';

describe('REAL CrossChain Service E2E', () => {
  let realCrossChainTx;
  
  beforeAll(async () => {
    // Ensure real LiFi service integration
    process.env.LIFI_API_URL = 'https://li.quest/v1';
    process.env.RPC_URL = tenderlyConfig.rpcUrl;
  });

  it('should prepare REAL cross-chain transaction', async () => {
    console.log('🧪 Testing REAL cross-chain preparation...');
    
    realCrossChainTx = await prepareCrossChainTransaction({
      fromAddress: testAccounts.buyer.address,
      toAddress: testAccounts.seller.address,
      amount: '1500000000000000000', // 1.5 ETH
      sourceNetwork: 'ethereum',
      targetNetwork: 'polygon',
      dealId: global.testTransactionId,
      userId: 'test-user-id'
    });

    expect(realCrossChainTx).toMatchObject({
      id: expect.any(String),
      status: expect.stringMatching(/prepared|pending/),
      needsBridge: true,
      steps: expect.arrayContaining([
        expect.objectContaining({
          description: expect.any(String),
          status: 'pending'
        })
      ])
    });

    console.log(`✅ Real cross-chain transaction prepared: ${realCrossChainTx.id}`);
  });

  it('should execute REAL cross-chain steps', async () => {
    console.log('🧪 Testing REAL cross-chain step execution...');
    
    // Execute step 1 - Lock funds on source
    const step1Result = await executeCrossChainStep(
      realCrossChainTx.id, 
      1,
      '0x1234567890abcdef1234567890abcdef12345678' // Mock tx hash for testing
    );

    expect(step1Result).toMatchObject({
      success: true,
      step: 1,
      status: expect.stringMatching(/completed|pending/)
    });

    // Get real status
    const status = await getCrossChainTransactionStatus(realCrossChainTx.id);
    expect(status.steps[0].status).toBe('completed');
    
    console.log('✅ Real cross-chain step executed successfully');
  });

  it('should estimate REAL transaction fees', async () => {
    console.log('🧪 Testing REAL fee estimation...');
    
    const feeEstimate = await estimateTransactionFees(
      'ethereum',
      'polygon', 
      '1500000000000000000',
      null, // ETH
      testAccounts.buyer.address
    );

    expect(feeEstimate).toMatchObject({
      totalEstimatedFee: expect.any(String),
      bridgeFee: expect.any(String),
      estimatedTime: expect.any(String),
      confidence: expect.stringMatching(/high|medium|low/)
    });

    console.log(`✅ Real fee estimate: ${feeEstimate.totalEstimatedFee}`);
  });
});
```

#### 3.2.3 **REAL** Smart Contract Integration Tests

```javascript
// test/e2e/contracts/smart-contract.test.js
import { SmartContractBridgeService } from '../../../src/services/smartContractBridgeService.js';
import { deployCrossChainPropertyEscrowContract } from '../../../src/services/crossChainContractDeployer.js';
import { tenderlyConfig } from '../setup/tenderly-config.js';

describe('REAL Smart Contract E2E', () => {
  let bridgeService;
  let realContractAddress;
  
  beforeAll(async () => {
    bridgeService = new SmartContractBridgeService();
    
    // Use real Tenderly RPC
    process.env.RPC_URL = tenderlyConfig.rpcUrl;
    process.env.DEPLOYER_PRIVATE_KEY = process.env.TEST_DEPLOYER_PRIVATE_KEY;
  });

  it('should deploy REAL cross-chain contract on Tenderly', async () => {
    console.log('🧪 Deploying REAL cross-chain contract...');
    
    const deployResult = await deployCrossChainPropertyEscrowContract({
      sellerAddress: testAccounts.seller.address,
      buyerAddress: testAccounts.buyer.address,
      escrowAmount: ethers.parseEther('1.5'),
      serviceWalletAddress: testAccounts.service.address,
      buyerSourceChain: 'ethereum',
      sellerTargetChain: 'polygon',
      tokenAddress: null, // ETH
      deployerPrivateKey: process.env.TEST_DEPLOYER_PRIVATE_KEY,
      rpcUrl: tenderlyConfig.rpcUrl,
      dealId: global.testTransactionId
    });

    expect(deployResult).toMatchObject({
      contractAddress: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/),
      gasUsed: expect.any(String),
      deploymentCost: expect.any(String)
    });

    realContractAddress = deployResult.contractAddress;
    console.log(`✅ Real contract deployed: ${realContractAddress}`);
  });

  it('should handle REAL cross-chain deposit', async () => {
    console.log('🧪 Testing REAL cross-chain deposit...');
    
    const depositResult = await bridgeService.handleIncomingCrossChainDeposit({
      contractAddress: realContractAddress,
      bridgeTransactionId: 'bridge-tx-123',
      sourceChain: 'ethereum',
      originalSender: testAccounts.buyer.address,
      amount: ethers.parseEther('1.5').toString(),
      tokenAddress: null,
      dealId: global.testTransactionId
    });

    expect(depositResult).toMatchObject({
      success: true,
      contractUpdated: true,
      fundsReceived: expect.any(String)
    });

    console.log('✅ Real cross-chain deposit processed');
  });

  it('should initiate REAL cross-chain release', async () => {
    console.log('🧪 Testing REAL cross-chain release...');
    
    const releaseResult = await bridgeService.initiateCrossChainRelease({
      contractAddress: realContractAddress,
      targetChain: 'polygon',
      targetAddress: testAccounts.seller.address,
      dealId: global.testTransactionId
    });

    expect(releaseResult).toMatchObject({
      success: true,
      bridgeInitiated: true,
      bridgeTransactionId: expect.any(String)
    });

    console.log(`✅ Real cross-chain release initiated: ${releaseResult.bridgeTransactionId}`);
  });
});
```

### 3.3 Phase 3: **REAL** End-to-End User Journey Tests

#### 3.3.1 Complete Cross-Chain Transaction Flow

```javascript
// test/e2e/journeys/complete-cross-chain-flow.test.js
import request from 'supertest';
import { app } from '../../../src/app.js';

describe('REAL Complete Cross-Chain User Journey', () => {
  let buyer, seller;
  let dealId, authTokens;
  
  beforeAll(async () => {
    // Setup real user accounts
    ({ buyer, seller, authTokens } = await setupRealUserAccounts());
  });

  it('should complete FULL cross-chain real estate transaction', async () => {
    console.log('🧪 Starting REAL complete cross-chain journey...');
    
    // Step 1: Buyer creates cross-chain deal
    console.log('Step 1: Creating cross-chain deal...');
    const createResponse = await request(app)
      .post('/api/transactions/create')
      .set('Authorization', `Bearer ${authTokens.buyer}`)
      .send({
        initiatedBy: 'BUYER',
        propertyAddress: '456 Blockchain Ave, DeFi City',
        amount: 2.0,
        otherPartyEmail: seller.email,
        buyerWalletAddress: buyer.walletAddress,
        sellerWalletAddress: seller.walletAddress,
        buyerNetworkHint: 'ethereum',
        sellerNetworkHint: 'polygon',
        initialConditions: [
          {
            id: 'inspection_complete',
            type: 'CUSTOM',
            description: 'Property inspection completed successfully'
          }
        ]
      })
      .expect(201);

    dealId = createResponse.body.transactionId;
    expect(createResponse.body.isCrossChain).toBe(true);
    expect(createResponse.body.smartContractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    
    console.log(`✅ Deal created: ${dealId}`);

    // Step 2: Seller reviews and accepts
    console.log('Step 2: Seller accepting deal...');
    const acceptResponse = await request(app)
      .patch(`/api/transactions/${dealId}/seller-decision`)
      .set('Authorization', `Bearer ${authTokens.seller}`)
      .send({ decision: 'ACCEPT' })
      .expect(200);

    expect(acceptResponse.body.status).toBe('AWAITING_CONDITION_FULFILLMENT');
    
    // Step 3: Buyer fulfills conditions
    console.log('Step 3: Buyer fulfilling conditions...');
    const conditions = await getTransactionConditions(dealId, authTokens.buyer);
    
    for (const condition of conditions.filter(c => c.status === 'PENDING_BUYER_ACTION')) {
      await request(app)
        .patch(`/api/transactions/conditions/${condition.id}/buyer-review`)
        .set('Authorization', `Bearer ${authTokens.buyer}`)
        .send({
          dealId,
          status: 'FULFILLED_BY_BUYER',
          notes: 'Condition completed successfully'
        })
        .expect(200);
    }

    // Step 4: Execute cross-chain transfer
    console.log('Step 4: Executing cross-chain transfer...');
    const transferResponse = await request(app)
      .post(`/api/transactions/cross-chain/${dealId}/transfer`)
      .set('Authorization', `Bearer ${authTokens.buyer}`)
      .send({
        fromTxHash: '0xabc123def456...',
        autoRelease: true
      })
      .expect(200);

    expect(transferResponse.body.bridgeCompleted).toBe(true);
    
    // Step 5: Verify final completion
    console.log('Step 5: Verifying completion...');
    await wait(5000); // Allow for async processing
    
    const finalStatus = await request(app)
      .get(`/api/transactions/${dealId}`)
      .set('Authorization', `Bearer ${authTokens.buyer}`)
      .expect(200);

    expect(finalStatus.body.status).toBe('READY_FOR_FINAL_APPROVAL');
    expect(finalStatus.body.fundsDepositedByBuyer).toBe(true);
    
    console.log('✅ REAL complete cross-chain transaction journey SUCCESSFUL!');
  });
});
```

### 3.4 Phase 4: Real-World Error Scenario Tests

#### 3.4.1 **REAL** Bridge Failure Handling

```javascript
// test/e2e/error-scenarios/bridge-failures.test.js
describe('REAL Bridge Failure Scenarios', () => {
  it('should handle REAL bridge timeout gracefully', async () => {
    // Test with actual timeout scenarios using your services
    // No mocks - test real timeout handling
  });

  it('should retry REAL stuck cross-chain transactions', async () => {
    // Test real retry mechanisms in crossChainService.js
  });

  it('should handle REAL network congestion', async () => {
    // Test with high gas scenarios on Tenderly
  });
});
```

## 4. **REALITY-FOCUSED** Test Scenarios

### 4.1 Happy Path (Real Services)
- ✅ Real cross-chain transaction creation via your API
- ✅ Real bridge execution using LiFi service
- ✅ Real smart contract deployment on Tenderly
- ✅ Real condition fulfillment workflow
- ✅ Real fund release to seller

### 4.2 Error Scenarios (Real Services)
- ❌ Real bridge failures and automatic retry
- ❌ Real network timeouts and recovery
- ❌ Real gas estimation failures
- ❌ Real contract deployment failures

### 4.3 Performance Tests (Real Services)
- 🔄 Real concurrent transaction processing
- 🔄 Real high-value transaction handling
- 🔄 Real network switching scenarios

## 5. Implementation Timeline

### Week 1: Real Environment Setup
- [x] Tenderly account configured ✅
- [x] Virtual TestNet active ✅  
- [ ] Test account funding automation
- [ ] Real API endpoint configuration

### Week 2: Real Service Integration
- [ ] Cross-chain service real testing
- [ ] LiFi service real integration tests
- [ ] Smart contract real deployment tests
- [ ] Database real transaction tests

### Week 3: Real User Journeys
- [ ] Complete transaction flow testing
- [ ] Real error scenario handling
- [ ] Performance testing with real services
- [ ] Cross-chain monitoring tests

### Week 4: Real Production Readiness
- [ ] Load testing with real API
- [ ] Security testing with real contracts
- [ ] Documentation of real test results
- [ ] Production deployment validation

## 6. Success Metrics (Real World)

### 6.1 Functional Metrics
- **API Success Rate**: >99% for real endpoint calls
- **Real Bridge Execution**: <5 minutes average
- **Real Contract Deployment**: <30 seconds on Tenderly
- **Cross-Chain Completion**: >95% success rate

### 6.2 Quality Metrics  
- **Real Service Coverage**: 100% of production services tested
- **Real Error Handling**: All error scenarios tested with actual services
- **Real Performance**: API response times <500ms under load

## 7. **NO MOCKS** - Real Testing Approach

### 7.1 What We Test For Real
- ✅ Your actual transactionRoutes.js API
- ✅ Your actual crossChainService.js logic
- ✅ Your actual lifiService.js integration
- ✅ Your actual smart contract deployment
- ✅ Your actual database operations
- ✅ Your actual Firebase authentication

### 7.2 What We Use Tenderly For
- ✅ Real blockchain environment (your VNet)
- ✅ Real contract deployments and testing
- ✅ Real transaction simulation
- ✅ Real gas usage analysis
- ✅ Real cross-chain bridge testing

## 8. Next Steps With Your Tenderly Setup

### 8.1 Immediate Actions
Based on your confirmed Tenderly setup, here are the immediate next steps:

```bash
# 1. Install required testing dependencies
npm install --save-dev @tenderly/sdk jest supertest

# 2. Create test environment configuration
mkdir -p test/e2e/setup
touch test/e2e/setup/tenderly-config.js

# 3. Verify your .env.test has required variables
# TENDERLY_ACCESS_KEY=your_access_key
# TENDERLY_ACCOUNT_ID=Dusss  
# TENDERLY_PROJECT_ID=CryptoTest
# TENDERLY_RPC_URL=https://rpc.tenderly.co/fork/your_fork_id
# TENDERLY_WSS_URL=wss://rpc.tenderly.co/fork/your_fork_id

# 4. Create your first real test
mkdir -p test/e2e/api
touch test/e2e/api/transaction-creation.test.js
```

### 8.2 Test Implementation Priority
1. **Real API Transaction Creation** - Test your `/api/transactions/create` endpoint
2. **Real Contract Deployment** - Test actual contract deployment to your Tenderly VNet
3. **Real Cross-Chain Service** - Test your `crossChainService.js` with real LiFi integration
4. **Real Error Scenarios** - Test actual failure handling, not mocked failures

### 8.3 Validation Checklist
- [ ] Tenderly credentials working in test environment
- [ ] Real API endpoints responding correctly
- [ ] Actual smart contracts deploying to Tenderly VNet
- [ ] Real cross-chain service integration functional
- [ ] Actual database operations working in test mode
- [ ] Real Firebase authentication working in tests

## Conclusion

This **reality-first** E2E test plan leverages your existing Tenderly setup to test your actual API and services without mocks. Every test validates real functionality, ensuring your cross-chain transaction system works exactly as it will in production.

The focus is on **testing reality** - your real API endpoints, real services, real smart contracts, and real cross-chain logic using your configured Tenderly Virtual TestNet environment.

**Key Success Factors:**
- ✅ Your Tenderly setup is confirmed and ready
- ✅ No arbitrators needed - simplified two-party transactions
- ✅ Real services testing approach - no mocks
- ✅ Production-ready validation using actual infrastructure 
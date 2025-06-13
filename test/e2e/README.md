# CryptoScrow E2E Tests - Unified LiFi Integration

## Overview

This directory contains End-to-End (E2E) tests for the CryptoScrow platform with **Unified LiFi Integration**. These tests use **real services** and deploy actual **UniversalPropertyEscrow** contracts to Tenderly Virtual TestNet - **no mocks**.

## Architecture Tested

### ✨ Unified LiFi Integration
- **UniversalPropertyEscrow.sol** - Single contract for all transaction types
- **universalContractDeployer.js** - Unified deployer service
- **Enhanced API routes** with LiFi orchestration
- **Real cross-chain transactions** via LiFi protocol

### 🎯 Test Coverage
- ✅ Same-chain transactions with Universal contract
- ✅ Cross-chain transactions with Universal contract
- ✅ Real API endpoint testing
- ✅ Actual smart contract deployment to Tenderly
- ✅ Complete escrow transaction lifecycle
- ✅ LiFi route optimization and execution

## Test Environment

### 🌐 Tenderly Integration
- **Real blockchain environment** (Tenderly Virtual TestNet)
- **Unlimited faucets** for testing
- **Real contract deployments** 
- **Live transaction monitoring**
- **Production-like conditions**

### 🔧 Services Tested
- **Transaction API** (`/api/transactions/*`)
- **Universal Contract Deployer** 
- **LiFi Service Integration**
- **Cross-chain bridge logic**
- **Database operations**
- **Firebase authentication** (mocked for E2E)

## Setup Requirements

### 📋 Prerequisites
1. **Node.js** 18+ 
2. **Tenderly account** with Virtual TestNet access
3. **Environment variables** configured in `.env.test`

### 🔑 Required Environment Variables
```bash
# Tenderly Configuration
TENDERLY_ACCESS_KEY=your_access_key
TENDERLY_ACCOUNT_SLUG=your_account_slug
TENDERLY_PROJECT_SLUG=your_project_slug
TENDERLY_VIRTUAL_TESTNET_ID=your_testnet_id
RPC_URL=https://rpc.tenderly.co/fork/your_fork_id

# Contract Deployment
TEST_DEPLOYER_PRIVATE_KEY=0x...

# Firebase (if needed)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
```

### 📦 Dependencies
```bash
npm install --save-dev @tenderly/sdk jest supertest
```

## Running Tests

### 🚀 Run All E2E Tests
```bash
# Using npm script
npm run test:e2e

# Or directly with Jest
npx jest --config test/e2e/jest.e2e.config.js
```

### 🎯 Run Specific Test Suites
```bash
# Transaction creation tests
npx jest test/e2e/api/transaction-creation.test.js

# Complete escrow flow tests  
npx jest test/e2e/services/complete-escrow-flow.test.js

# Tenderly integration demos
npx jest test/e2e/services/tenderly-demo.test.js
```

### 🔍 Run with Verbose Output
```bash
npm run test:e2e -- --verbose --detectOpenHandles
```

## Test Structure

### 📁 Directory Organization
```
test/e2e/
├── api/                          # API endpoint tests
│   └── transaction-creation.test.js
├── services/                     # Service integration tests
│   ├── complete-escrow-flow.test.js
│   └── tenderly-demo.test.js
├── setup/                        # Test configuration
│   ├── tenderly-config.js       # Tenderly configuration
│   ├── fund-accounts.js         # Account funding utilities
│   ├── global-setup.js          # Global test setup
│   ├── global-teardown.js       # Global test cleanup
│   ├── jest-setup.js            # Jest configuration
│   └── env-setup.js             # Environment setup
├── jest.e2e.config.js           # Jest E2E configuration
└── README.md                    # This file
```

## Test Scenarios

### 🔄 Same-Chain Transactions
Tests Universal contract deployment and execution for same-network transactions:
- ✅ Contract deployment with `same_chain` transaction type
- ✅ Buyer condition fulfillment
- ✅ Fund deposit simulation
- ✅ Final approval process
- ✅ Contract state verification

### 🌉 Cross-Chain Transactions  
Tests Universal contract with cross-chain capabilities:
- ✅ Contract deployment with `cross_chain` transaction type
- ✅ LiFi route optimization
- ✅ Network compatibility validation
- ✅ Bridge transaction preparation
- ✅ Cross-chain metadata verification

### 🏁 Complete Lifecycle
Tests full escrow transaction from creation to completion:
- 📝 Deal creation via API
- 👥 Seller acceptance
- 🔗 Contract state verification
- ✅ Condition fulfillment
- 💰 Fund deposit handling
- ⏰ Final approval period
- 🎯 Transaction completion

## Key Test Features

### 🎯 Real Service Integration
- **No mocks** - tests use actual services
- **Real contract deployment** to Tenderly
- **Actual API calls** to transaction endpoints  
- **Live database operations**
- **Real LiFi service integration**

### 🔧 Universal Contract Testing
- **Single contract type** for all scenarios
- **Transaction type auto-detection**
- **LiFi route optimization**
- **Cross-chain metadata validation**
- **Same-chain and cross-chain flows**

### 📊 Comprehensive Verification
- **On-chain contract state** verification
- **API response validation**
- **Database state consistency**
- **Transaction lifecycle completion**
- **Error handling and recovery**

## Sample Test Output

```bash
🧪 Setting up REAL Tenderly E2E Test Environment with Unified LiFi Integration...
✅ Tenderly configuration validated
✅ Test accounts funded successfully
🚀 E2E Test environment setup complete

🧪 Creating REAL same-chain transaction with Universal contract...
✅ Real Universal contract deployed: 0x1234...
✅ Universal contract verified on Tenderly VNet

🧪 Creating REAL cross-chain transaction with Universal contract...
✅ Real Universal cross-chain contract deployed: 0x5678...
✅ Cross-chain Universal contract verified

🎉 REAL same-chain Universal transaction created successfully!
🎉 REAL cross-chain Universal transaction created successfully!

📊 Test Results Summary:
   ✅ Same-chain Transaction: tx_abc123
   ✅ Same-chain Contract: 0x1234...
   ✅ Cross-chain Transaction: tx_def456  
   ✅ Cross-chain Contract: 0x5678...
```

## Debugging Tests

### 🔍 Common Issues
1. **Tenderly connection issues**
   - Verify `RPC_URL` is correct
   - Check Tenderly account access

2. **Contract deployment failures**
   - Verify `TEST_DEPLOYER_PRIVATE_KEY` is set
   - Check account has sufficient balance

3. **Test timeouts**
   - Increase timeout in Jest config
   - Check network connectivity

### 📋 Debug Commands
```bash
# Run with full debug output
DEBUG=* npm run test:e2e

# Check Tenderly configuration
node -e "import('./test/e2e/setup/tenderly-config.js').then(c => c.logConfigStatus())"

# Test account funding
node -e "import('./test/e2e/setup/fund-accounts.js').then(f => f.testAccountFunding())"
```

## Integration with CI/CD

### 🤖 GitHub Actions Example
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:e2e
        env:
          TENDERLY_ACCESS_KEY: ${{ secrets.TENDERLY_ACCESS_KEY }}
          TENDERLY_ACCOUNT_SLUG: ${{ secrets.TENDERLY_ACCOUNT_SLUG }}
          TENDERLY_PROJECT_SLUG: ${{ secrets.TENDERLY_PROJECT_SLUG }}
          RPC_URL: ${{ secrets.TENDERLY_RPC_URL }}
```

## Contributing

### 📝 Adding New Tests
1. Create test file in appropriate directory
2. Import required setup utilities
3. Use real services (no mocks)
4. Test Universal contract integration
5. Add comprehensive assertions
6. Include cleanup logic

### 🎯 Test Best Practices
- **Test real scenarios** - no mocking of core services
- **Verify Universal contracts** - ensure correct contract type
- **Check transaction metadata** - validate LiFi integration
- **Test error handling** - include failure scenarios
- **Clean up resources** - prevent test conflicts

## Support

For issues with E2E tests:
1. Check Tenderly configuration
2. Verify environment variables
3. Review test logs for errors
4. Ensure Universal contracts are deployed correctly
5. Validate LiFi service integration

---

**Ready to test the future of cross-chain real estate transactions! 🚀** 
# Cross-Chain Escrow Testing Guide

## Overview

This testing suite validates the LI.FI SDK integration for cross-chain escrow transactions. We use a multi-layered testing approach to ensure reliable cross-chain functionality while minimizing costs.

## Testing Strategy

### 🧪 1. Unit Tests (Cost: Free)
- **Purpose**: Test service logic, route selection, and error handling
- **Method**: Mock all external dependencies
- **Coverage**: LI.FI service, route optimization, wallet validation
- **Location**: `tests/unit/`

### 🔄 2. Integration Tests with Tenderly Simulation (Cost: Free)
- **Purpose**: Test complete cross-chain flows without spending money
- **Method**: Tenderly transaction simulation
- **Coverage**: Full buyer→bridge→seller flow, contract interactions
- **Location**: `tests/integration/`

### 💰 3. Low-Cost Mainnet Tests (Cost: ~$0.01-0.10)
- **Purpose**: Validate real-world scenarios with actual bridges
- **Method**: Real transactions on Polygon/Gnosis (low fees)
- **Coverage**: End-to-end validation
- **Location**: `tests/mainnet/` (optional)

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Install test dependencies  
npm install --save-dev jest supertest axios-mock-adapter

# Set up environment variables (optional for Tenderly tests)
cp .env.example .env.test
```

### Environment Variables

```bash
# .env.test - For Tenderly integration tests
TENDERLY_ACCOUNT_SLUG=your-account
TENDERLY_PROJECT_SLUG=your-project  
TENDERLY_ACCESS_KEY=your-api-key

# For mainnet tests (optional)
POLYGON_RPC_URL=https://polygon-rpc.com
GNOSIS_RPC_URL=https://rpc.gnosischain.com
TEST_PRIVATE_KEY=your-test-wallet-private-key
```

### Run Tests

```bash
# Run all unit tests
npm test

# Run specific test suites
npm test -- tests/unit/lifiService.test.js
npm test -- tests/unit/walletRoutes.test.js

# Run integration tests with Tenderly
npm run test:integration

# Run mainnet tests (requires setup)
npm run test:mainnet
```

## Test Structure

### Unit Tests

#### LI.FI Service Tests (`tests/unit/lifiService.test.js`)

```javascript
// Tests route finding, fee estimation, bridge selection
describe('LiFiBridgeService', () => {
  it('should find optimal routes between chains')
  it('should select best bridge based on multiple factors')
  it('should handle API errors gracefully')
  it('should estimate fees accurately')
})
```

#### Wallet Routes Tests (`tests/unit/walletRoutes.test.js`)

```javascript
// Tests API endpoints for cross-chain wallet functionality
describe('Enhanced Wallet Routes', () => {
  it('should find optimal routes between buyer/seller wallets')
  it('should prepare cross-chain escrow transactions')
  it('should analyze wallet capabilities with LI.FI')
  it('should validate wallet addresses correctly')
})
```

### Integration Tests

#### Complete Cross-Chain Flow (`tests/integration/crossChainEscrow.test.js`)

```javascript
// Tests full escrow flow using Tenderly simulation
describe('Cross-Chain Escrow Integration', () => {
  it('should execute Ethereum->Polygon escrow with LI.FI bridge')
  it('should handle bridge failures gracefully')  
  it('should support same-network transactions')
  it('should prevent double-spending')
})
```

## Testing Scenarios

### ✅ Supported Test Cases

1. **Ethereum ↔ Polygon**: Fast, cheap cross-chain
2. **Ethereum ↔ BSC**: Different bridge protocols
3. **Polygon ↔ Avalanche**: L2 to L1 bridging
4. **Same Network**: Direct transfers without bridging
5. **Failed Bridges**: Error handling and fallbacks
6. **Invalid Addresses**: Validation testing

### 🔄 Bridge Protocols Tested

- **Across Protocol**: Fast, capital-efficient bridging
- **Stargate**: Omnichain liquidity transport
- **Hop Protocol**: Rollup-to-rollup transfers
- **Connext**: Trust-minimized bridges
- **Native Bridges**: Polygon PoS, Arbitrum, etc.

### 🛡️ Security Tests

- Address validation (EVM, Solana, Bitcoin)
- Double-spending prevention
- Slippage protection
- Bridge failure handling
- Rate limiting compliance

## Tenderly Integration Testing

### Setup Tenderly Account

1. **Create Account**: Sign up at [tenderly.co](https://tenderly.co)
2. **Create Project**: Set up a new project for testing
3. **Get API Key**: Generate access key from dashboard
4. **Configure Environment**: Add credentials to `.env.test`

### Simulation Benefits

- **100% Accurate**: Exact mainnet replica
- **Free**: No gas costs for simulations
- **Fast**: Instant transaction results
- **Debugging**: Full transaction traces
- **State Overrides**: Test edge cases

### Example Tenderly Test

```javascript
// Simulate complete cross-chain transaction
const result = await tenderly.simulateTransaction({
  network: 'ethereum',
  from: buyerAddress,
  to: lifiRouterAddress,
  input: bridgeTransactionData,
  value: amount,
  simulation_type: 'full'
});

// Verify transaction success
expect(result.transaction.status).toBe(true);
expect(result.balance_changes).toContainEqual(
  expect.objectContaining({
    address: sellerAddress,
    balance_changes: expect.arrayContaining([
      expect.objectContaining({
        raw_amount: amount
      })
    ])
  })
);
```

## Low-Cost Mainnet Testing

### Recommended Networks

1. **Polygon** (~$0.001 per transaction)
   - Fast finality
   - EVM compatible
   - Excellent bridge support

2. **Gnosis Chain** (~$0.00001 per transaction)
   - Extremely low fees
   - Stable network
   - Good bridge coverage

### Test Wallet Setup

```javascript
// Use dedicated test wallets with small amounts
const testWallet = {
  address: '0x...',
  privateKey: process.env.TEST_PRIVATE_KEY,
  networks: ['polygon', 'gnosis'],
  maxTestAmount: '0.1' // 0.1 ETH equivalent max
};
```

### Safety Measures

- **Small Amounts**: Never test with > $1 worth
- **Dedicated Wallets**: Separate from main funds  
- **Network Limits**: Stick to low-fee networks
- **Automated Cleanup**: Return funds after tests

## Smart Contract Testing

### Contract Deployment Strategy

```javascript
// Smart contracts remain unchanged - test deployment
const escrowContract = await deployPropertyEscrow({
  dealId: 'test-deal-001',
  buyer: buyerAddress,
  seller: sellerAddress,
  amount: testAmount,
  token: testTokenAddress
});

// Verify contract maintains original architecture
expect(escrowContract.interface).toMatchObject(originalInterface);
```

### Bridge Integration Points

- **Deposit Handling**: Funds received from bridges
- **Release Mechanism**: Funds sent to bridges
- **State Management**: Deal conditions and status
- **Event Emission**: Cross-chain transaction tracking

## Test Data & Fixtures

### Standard Test Addresses

```javascript
const TEST_DATA = {
  // Valid test addresses (checksummed)
  ethereum: {
    buyer: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',
    seller: '0x8ba1f109551bD432803012645Hac136c'
  },
  
  // Mock LI.FI responses
  mockRoutes: {
    ethereumToPolygon: {
      bridge: 'across',
      estimatedTime: 900, // 15 minutes
      totalFees: 5.5,
      confidence: 85
    }
  },
  
  // Test amounts (in wei)
  amounts: {
    small: '100000000000000000',    // 0.1 ETH
    medium: '1000000000000000000',  // 1 ETH  
    large: '5000000000000000000'    // 5 ETH
  }
};
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Cross-Chain Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
  
  integration-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
        env:
          TENDERLY_ACCESS_KEY: ${{ secrets.TENDERLY_ACCESS_KEY }}
```

## Debugging & Troubleshooting

### Common Issues

1. **LI.FI API Errors**
   ```bash
   # Check rate limits (75 requests per 2 hours)
   curl -H "X-Access-Key: $LIFI_KEY" https://li.quest/v1/status
   ```

2. **Tenderly Simulation Failures**
   ```javascript
   // Enable detailed logging
   const result = await tenderly.simulateTransaction({
     ...params,
     save: true,  // Save simulation for debugging
     save_if_fails: true
   });
   ```

3. **Bridge Route Not Found**
   ```javascript
   // Check supported chains
   const chains = await lifiService.getSupportedChains();
   console.log('Available chains:', chains.map(c => c.name));
   ```

### Test Output Examples

```bash
✅ Cross-Chain Escrow Integration Tests
  ✅ Complete Cross-Chain Escrow Flow
    ✅ should execute full Ethereum->Polygon escrow flow with LI.FI bridge (2.1s)
    ✅ should handle failed bridge transactions gracefully (0.8s)
    ✅ should support same-network transactions without bridging (0.3s)
  ✅ Bridge Protocol Compatibility
    ✅ should work with Across Protocol routes (0.2s)
    ✅ should work with Stargate Protocol routes (0.2s)
  ✅ Security and Error Handling
    ✅ should validate wallet addresses before processing (0.1s)
    ✅ should prevent double-spending in escrow contracts (0.4s)

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
Time:        4.2s
```

## Best Practices

### 🎯 Test Guidelines

1. **Isolation**: Each test should be independent
2. **Deterministic**: Tests should have predictable results
3. **Fast**: Unit tests < 100ms, integration tests < 5s
4. **Clear**: Test names describe expected behavior
5. **Coverage**: Aim for 90%+ code coverage

### 🔒 Security Testing

1. **Address Validation**: Test all supported formats
2. **Input Sanitization**: Prevent injection attacks
3. **Rate Limiting**: Respect API limits
4. **Error Handling**: Graceful failure modes
5. **State Management**: Prevent race conditions

### 💡 Performance Testing

1. **Route Optimization**: Verify best route selection
2. **Fee Estimation**: Accurate cost predictions
3. **Response Times**: LI.FI API latency
4. **Concurrency**: Multiple simultaneous requests
5. **Memory Usage**: Monitor for leaks

## Conclusion

This testing strategy ensures:

- ✅ **Reliable Cross-Chain Functionality**: Comprehensive coverage
- ✅ **Cost-Effective Testing**: Free simulation + minimal mainnet costs
- ✅ **Production Readiness**: Real-world scenario validation
- ✅ **Continuous Quality**: Automated CI/CD integration
- ✅ **Smart Contract Integrity**: Original architecture maintained

Run tests regularly during development and always before production deployments. 
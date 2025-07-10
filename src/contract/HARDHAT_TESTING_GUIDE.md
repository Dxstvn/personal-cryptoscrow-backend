# Hardhat Testing Guide for V3 Contracts

This guide explains how to test the UniversalEscrowServiceV3Disputes contract locally using Hardhat.

## Overview

The V3 contracts can be fully tested in Hardhat's local environment, which provides:
- Fast execution (no waiting for block confirmations)
- Time manipulation (test dispute windows instantly)
- Deterministic results
- No gas costs

## Production Architecture

In production, the system works as follows:

1. **Frontend** → User initiates actions (create escrow, mark condition met, raise dispute)
2. **Backend API** → Validates requests and calls smart contract methods
3. **Smart Contract** → Executes the logic with access control

Key points:
- Users never interact directly with the smart contract
- The backend service wallet has privileged access for updates
- All user actions are mediated through the backend API
- This provides additional validation, security, and user experience benefits

## What Can Be Tested

### ✅ Fully Testable Features:
1. **Core Escrow Functions**
   - Creating escrows with ETH or ERC-20 tokens
   - 2% service fee calculation
   - Condition updates
   - Fund releases

2. **Dispute Resolution**
   - 48-hour dispute window enforcement
   - Dispute raising by buyer/seller
   - 7-day resolution period
   - Automatic refunds for unresolved disputes
   - Service wallet arbitration

3. **Token Swaps (Uniswap)**
   - ETH → ERC-20 swaps
   - ERC-20 → ETH swaps
   - ERC-20 → ERC-20 swaps
   - Slippage protection
   - Path finding through WETH

4. **Business Logic**
   - Access control:
     * Only service wallet can update conditions
     * Buyer/seller can raise disputes (in production, backend does this on their behalf)
     * Only service wallet can resolve disputes
   - State transitions
   - Edge case handling
   - Error conditions

### ⚠️ Simulated Features:
1. **Cross-Chain Transfers**
   - Uses mock Stargate contracts
   - Tests fee calculation logic
   - Validates routing decisions
   - Cannot test actual cross-chain messaging

2. **External Protocol Integration**
   - Mock Uniswap with simplified pricing
   - Mock Stargate with fixed fees
   - No real liquidity constraints

## Running Tests

### 1. Run the Test Suite
```bash
cd src/contract
npx hardhat test test/UniversalEscrowServiceV3Disputes.test.js
```

### 2. Run with Coverage
```bash
npx hardhat coverage --testfiles test/UniversalEscrowServiceV3Disputes.test.js
```

### 3. Run the Demonstration Script
```bash
npx hardhat run scripts/demonstrateV3Capabilities.js
```

### 4. Run Specific Test
```bash
npx hardhat test test/UniversalEscrowServiceV3Disputes.test.js --grep "dispute resolution"
```

## Test Structure

### Basic Tests
- Escrow creation with ETH and tokens
- Service fee calculations
- Condition updates

### Dispute Tests
- Dispute window timing
- Dispute raising and resolution
- Automatic refunds
- Access control

### Swap Tests
- Same-chain token swaps
- Multiple swap paths
- Slippage handling

### Edge Cases
- Zero amounts
- Double disputes
- Insufficient fees
- Invalid parameters

## Example Test Output

```
UniversalEscrowServiceV3Disputes
  Basic Escrow Functions
    ✓ Should create an escrow with ETH (145ms)
    ✓ Should create an escrow with ERC20 tokens (89ms)
    ✓ Should calculate 2% service fee correctly (67ms)
    
  Dispute Resolution
    ✓ Should allow raising dispute within 48 hours (123ms)
    ✓ Should not allow raising dispute after 48-hour window (95ms)
    ✓ Should allow service wallet to resolve dispute (87ms)
    ✓ Should return funds to buyer if dispute unresolved (102ms)
    ✓ Should enforce canReleaseEscrow logic (156ms)
    
  Token Swaps
    ✓ Should swap ETH to USDC on same chain (178ms)
    ✓ Should swap USDC to DAI on same chain (145ms)
    
  Cross-Chain Simulation
    ✓ Should quote cross-chain fees (45ms)
    ✓ Should initiate cross-chain transfer (98ms)
    
  Edge Cases
    ✓ Should handle zero amount escrows (34ms)
    ✓ Should prevent double dispute (89ms)
    ✓ Should handle insufficient cross-chain fees (67ms)

15 passing (1.8s)
```

## Benefits of Hardhat Testing

1. **Speed**: Tests run in seconds, not minutes
2. **Control**: Manipulate time, block numbers, and state
3. **Isolation**: Each test starts with clean state
4. **Debugging**: Detailed stack traces and console logs
5. **Cost**: No gas fees or testnet tokens needed

## Limitations

1. **Network Effects**: Cannot test actual cross-chain messaging
2. **External Protocols**: Mock implementations differ from mainnet
3. **Gas Costs**: May vary from actual network conditions
4. **Liquidity**: No real market dynamics

## Next Steps

1. **Integration Tests**: Deploy to testnets for real cross-chain testing
2. **Stress Tests**: Test with high transaction volumes
3. **Security Audit**: Professional review before mainnet
4. **Mainnet Staging**: Test on mainnet with small amounts

## Troubleshooting

### Common Issues:

1. **Compilation Errors**
   ```bash
   npx hardhat clean
   npx hardhat compile
   ```

2. **Import Errors**
   - Ensure all mock contracts are in `contracts/mocks/`
   - Check contract import paths

3. **Multiple Artifacts Error**
   - Use fully qualified contract names:
   ```javascript
   // Wrong
   await ethers.getContractFactory("MockERC20");
   
   // Correct
   await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
   ```

3. **Time Manipulation**
   - Use `time.increase()` not `evm_increaseTime`
   - Remember to mine a new block if needed

4. **Gas Errors**
   - Hardhat has default gas limits
   - Can be configured in hardhat.config.js
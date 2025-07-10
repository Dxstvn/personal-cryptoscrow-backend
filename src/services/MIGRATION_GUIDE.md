# Migration Guide: V3 Backend Services

This guide helps you migrate from deprecated services to the new unified `escrowServiceV3.js`.

## Quick Reference

| Old Service | New Service | Purpose |
|------------|-------------|---------|
| contractDeployer.js | escrowServiceV3.js | Contract deployment |
| crossChainContractDeployer.js | escrowServiceV3.js | Cross-chain contracts |
| smartContractBridgeService.js | escrowServiceV3.js | Bridge operations |
| crossChainService.js | escrowServiceV3.js | Cross-chain logic |
| blockchainService.js | escrowServiceV3.js | Blockchain interactions |

## Migration Examples

### 1. Contract Deployment

**Old Way (DEPRECATED):**
```javascript
import { deployPropertyEscrowContract } from '../services/contractDeployer.js';

// Deploy contract
const { contractAddress, txHash } = await deployPropertyEscrowContract(
  providerUrl,
  privateKey,
  buyerAddress,
  sellerAddress,
  depositAmount,
  serviceWalletAddress,
  serviceFeeAmount
);
```

**New Way (V3):**
```javascript
import { EscrowServiceV3 } from '../services/escrowServiceV3.js';

const escrowService = new EscrowServiceV3();
await escrowService.initialize();

// Create escrow (deploys if needed)
const result = await escrowService.createEscrow({
  chainId: 11155111, // Sepolia
  seller: sellerAddress,
  depositToken: '0x0000000000000000000000000000000000000000', // ETH
  amount: depositAmount,
  targetToken: '0x0000000000000000000000000000000000000000',
  targetChainId: 11155111,
  signerPrivateKey: privateKey
});

const { contractAddress, escrowId, txHash } = result;
```

### 2. Cross-Chain Operations

**Old Way (DEPRECATED):**
```javascript
import { bridgeAssets } from '../services/smartContractBridgeService.js';
import { deployCrossChainContract } from '../services/crossChainContractDeployer.js';

// Deploy cross-chain contract
const contract = await deployCrossChainContract(...);

// Bridge assets
await bridgeAssets(
  sourceChain,
  targetChain,
  amount,
  tokenAddress,
  contractAddress
);
```

**New Way (V3):**
```javascript
import { EscrowServiceV3 } from '../services/escrowServiceV3.js';

const escrowService = new EscrowServiceV3();
await escrowService.initialize();

// Create cross-chain escrow
const escrowResult = await escrowService.createEscrow({
  chainId: 11155111,        // Source: Sepolia
  seller: sellerAddress,
  depositToken: '0x0000000000000000000000000000000000000000',
  amount: amount,
  targetToken: '0x0000000000000000000000000000000000000000',
  targetChainId: 421614,    // Target: Arbitrum Sepolia
  signerPrivateKey: privateKey
});

// Release handles cross-chain automatically
const releaseResult = await escrowService.releaseEscrow(
  11155111,
  escrowResult.escrowId,
  crossChainFee,
  privateKey
);
```

### 3. Contract Interactions

**Old Way (DEPRECATED):**
```javascript
import { getContract, updateContractCondition } from '../services/blockchainService.js';

const contract = await getContract(contractAddress, contractABI);
await updateContractCondition(contractAddress, conditionMet);
```

**New Way (V3):**
```javascript
import { EscrowServiceV3 } from '../services/escrowServiceV3.js';

const escrowService = new EscrowServiceV3();
await escrowService.initialize();

// Update condition
await escrowService.updateCondition(
  chainId,
  escrowId,
  conditionMet,
  privateKey
);

// Get escrow details
const details = await escrowService.getEscrowDetails(escrowId, chainId);
```

### 4. Fee Estimation

**Old Way (DEPRECATED):**
```javascript
// No unified fee estimation in old services
const serviceFee = amount * 0.02; // 2% hardcoded
```

**New Way (V3):**
```javascript
import { EscrowServiceV3 } from '../services/escrowServiceV3.js';

const escrowService = new EscrowServiceV3();
await escrowService.initialize();

// Get comprehensive fee estimate
const fees = await escrowService.estimateTotalFees({
  amount: '1000000000000000000', // 1 ETH
  sourceChainId: 11155111,
  targetChainId: 421614,
  requiresSwap: false
});

console.log(fees);
// {
//   serviceFee: '20000000000000000',     // 2%
//   crossChainFee: '10000000000000000',  // Estimated
//   gasEstimate: '150000',
//   total: '30000000000000000'
// }
```

### 5. Dispute Handling

**Old Way (DEPRECATED):**
```javascript
// No dispute handling in old contracts
```

**New Way (V3):**
```javascript
import { EscrowServiceV3 } from '../services/escrowServiceV3.js';

const escrowService = new EscrowServiceV3();

// Raise dispute
await escrowService.raiseDispute(escrowId, reason, {
  chainId,
  contractAddress,
  signerPrivateKey: privateKey
});

// Resolve dispute
await escrowService.resolveDispute(escrowId, releaseFunds, {
  chainId,
  contractAddress,
  signerPrivateKey: serviceWalletPrivateKey
});
```

## API Route Updates

### Transaction Routes

Update your imports in `transactionRoutes.js`:

```javascript
// Remove these
import { deployPropertyEscrowContract } from '../services/contractDeployer.js';
import { deployCrossChainContract } from '../services/crossChainContractDeployer.js';
import SmartContractBridgeService from '../services/smartContractBridgeService.js';

// Add this
import { EscrowServiceV3 } from '../services/escrowServiceV3.js';
const escrowService = new EscrowServiceV3();
```

## Testing Your Migration

1. **Unit Tests**: Update test imports to use escrowServiceV3
2. **Integration Tests**: Use test-all-endpoints-final.js as reference
3. **Contract Tests**: See UniversalEscrowServiceV3.comprehensive.test.js

## Common Migration Issues

### Issue 1: Missing Chain Configuration
**Error**: `No V3 contract configured for chain X`
**Solution**: Ensure the chain is configured in escrowServiceV3.chainConfigs

### Issue 2: Different Parameter Names
**Old**: `buyerAddress`, `sellerAddress`
**New**: `buyer` param removed (derived from msg.sender), only `seller` needed

### Issue 3: Contract Version Mismatch
**Error**: `Contract method not found`
**Solution**: Ensure you're using V3 contract addresses, not old contracts

## Support

- See DEPRECATION_NOTICE.md for timeline
- Check V3_BACKEND_UPDATE_PLAN.md for architecture details
- Review test examples in /src/services/__tests__/escrowServiceV3.test.js

## Checklist

- [ ] Updated all imports from deprecated services
- [ ] Replaced contract deployment logic with createEscrow
- [ ] Updated cross-chain operations to use V3 methods
- [ ] Added proper error handling for V3-specific errors
- [ ] Tested all endpoints with new service
- [ ] Removed unused deprecated service imports
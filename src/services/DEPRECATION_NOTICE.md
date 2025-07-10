# Service Deprecation Notice

## ⚠️ DEPRECATED SERVICES

The following services are **DEPRECATED** as of Phase 3 of the V3 Backend Update Plan and will be removed in a future release:

### 1. Old Contract Deployers
- **contractDeployer.js** - Uses old PropertyEscrow contracts
- **crossChainContractDeployer.js** - Uses old CrossChainPropertyEscrow contracts
- **universalContractDeployer.js** - Mixed V1/V2 contract support

**Replacement**: Use `escrowServiceV3.js` for all contract deployments

### 2. Bridge Services
- **smartContractBridgeService.js** - Relies on deprecated LiFi integration
- **crossChainService.js** - Contains LiFi-specific code

**Replacement**: Use `escrowServiceV3.js` for all cross-chain functionality (Stargate-based)

### 3. Legacy Services
- **blockchainService.js** - Old blockchain interaction patterns

**Replacement**: Use `escrowServiceV3.js` for all blockchain operations

## 📅 Deprecation Timeline

- **Phase 3 Start (Current)**: Services marked as deprecated
- **Phase 3 + 2 weeks**: Warning logs added when deprecated services are used
- **Phase 4**: Deprecated services removed from codebase

## 🔄 Migration Guide

### For Contract Deployment:
```javascript
// OLD (DEPRECATED)
import { deployPropertyEscrowContract } from './contractDeployer.js';
const contract = await deployPropertyEscrowContract(...);

// NEW (USE THIS)
import { EscrowServiceV3 } from './escrowServiceV3.js';
const escrowService = new EscrowServiceV3();
const result = await escrowService.createEscrow(...);
```

### For Cross-Chain Operations:
```javascript
// OLD (DEPRECATED)
import { bridgeAssets } from './smartContractBridgeService.js';
await bridgeAssets(...);

// NEW (USE THIS)
import { EscrowServiceV3 } from './escrowServiceV3.js';
const escrowService = new EscrowServiceV3();
await escrowService.releaseEscrow(...); // Handles cross-chain automatically
```

## ✅ Active Services

The following services remain active and supported:

- **escrowServiceV3.js** - Unified V3 escrow service
- **databaseService.js** - Database operations
- **scheduledJobs.js** - Background job processing
- **contractConditionSync.js** - Real-time condition synchronization

## 🚨 Action Required

If your code uses any deprecated services:
1. Review the migration guide above
2. Update imports to use `escrowServiceV3.js`
3. Test thoroughly with V3 contracts
4. Remove deprecated service imports

## 📞 Support

For migration assistance or questions, please refer to:
- V3_BACKEND_UPDATE_PLAN.md
- escrowServiceV3.js documentation
- Test examples in test-all-endpoints-final.js
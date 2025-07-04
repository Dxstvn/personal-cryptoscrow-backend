# Blockchain Codebase Refactoring Plan for OFT Integration

## Current Architecture Overview

### Escrow Contracts Hierarchy
```
PropertyEscrow (V1)
    ↓
CrossChainPropertyEscrow (V2)
    ↓
UniversalPropertyEscrow (V3 - LiFi based)
```

### OFT Implementations
```
PropertyOFTAdapter (Basic lock/unlock)
PropertyMintBurnOFTAdapterV3 (Advanced with DEX)
```

## Refactoring Strategy

### Phase 1: Fix and Enhance OFT Adapters

1. **Debug PropertyOFTAdapter InvalidAmount Issue**
   - The error suggests amount validation or conversion issues
   - Possible causes:
     - Dust amount protection
     - Decimal conversion mismatch
     - Missing initialization
     - Incompatible token implementation

2. **Create Enhanced OFT Adapter**
   ```solidity
   // Combine best features from existing implementations
   contract PropertyOFTAdapterV2 is OFTAdapter {
       // From V3: DEX integration
       // From V3: Fee handling
       // From V3: Emergency rescue
       // Fix: Proper decimal handling
       // Fix: Amount validation
   }
   ```

### Phase 2: Create OFT-Integrated Escrow

```solidity
contract LayerZeroPropertyEscrow is PropertyEscrow {
    // Integrate OFT adapters for cross-chain transfers
    mapping(address => address) public tokenToOFTAdapter;
    
    function depositWithOFT(uint32 dstEid, address token, uint256 amount)
    function releaseWithOFT(uint32 dstEid)
}
```

### Phase 3: Service Layer Integration

```javascript
// OFTEscrowService.js
class OFTEscrowService {
    // Manages escrow + OFT operations
    // Handles cross-chain orchestration
    // Integrates with existing services
}
```

## Immediate Action Items

### 1. Fix OFT Adapter Issues

**Issue**: InvalidAmount error (0x6780cfaf) with data 0x000...000

**Root Cause Analysis**:
- Amount becomes 0 after processing
- Could be decimal conversion issue
- May need minimum amount enforcement
- Possible initialization missing

**Fix Approach**:
```solidity
// Add debugging and validation
function _debit(
    address _from,
    uint256 _amountLD,
    uint256 _minAmountLD,
    uint32 _dstEid
) internal override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
    // Add validation
    require(_amountLD > 0, "Amount must be positive");
    
    // Check decimal conversion
    uint256 amountSD = _toSD(_amountLD);
    require(amountSD > 0, "Amount too small after conversion");
    
    // Proceed with transfer
    return super._debit(_from, _amountLD, _minAmountLD, _dstEid);
}
```

### 2. Integration Pattern

```solidity
// EscrowWithOFT.sol
contract EscrowWithOFT is UniversalPropertyEscrow {
    // Use OFT for cross-chain token movements
    // Keep LiFi for routing decisions
    // LayerZero for token transfers
}
```

### 3. Testing Strategy

1. **Unit Tests**: Test OFT adapter in isolation
2. **Integration Tests**: Test escrow + OFT together
3. **E2E Tests**: Full cross-chain flow

## Contract Relationships After Refactoring

```
UniversalPropertyEscrow
    ├── Uses LiFi for routing
    └── Uses OFT Adapters for token transfers
        ├── PropertyOFTAdapterV2 (WETH, USDC)
        └── Custom adapters per token

OFT Adapters
    ├── Managed by escrow
    ├── Configured with peers
    └── Handle cross-chain transfers
```

## Benefits of This Approach

1. **Separation of Concerns**
   - Escrow handles business logic
   - OFT handles token transfers
   - LiFi handles routing decisions

2. **Flexibility**
   - Can use different adapters per token
   - Easy to add new tokens
   - Can switch between bridges

3. **Maintainability**
   - Clear contract boundaries
   - Modular architecture
   - Easier debugging

## Next Steps

1. **Debug Current OFT Adapter**
   - Add logging and validation
   - Test with different amounts
   - Check initialization requirements

2. **Create Test Suite**
   - Isolated OFT tests
   - Mock LayerZero endpoint
   - Test decimal conversions

3. **Integrate with Escrow**
   - Add OFT support to escrow
   - Create service layer
   - Update deployment scripts
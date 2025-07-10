# Cross-Chain Architecture Optimization Plan

## Current Situation Analysis

### LayerZero OFT Adapters
- **Purpose**: Bridge WETH tokens across chains
- **Process**: Convert all tokens to WETH → Bridge WETH → Convert back on destination
- **Limitations**:
  - Cannot handle native ETH directly
  - Complex DVN/executor configuration
  - Higher fees
  - Limited to wrapped tokens only
  - Configuration issues in current implementation

### Stargate Protocol
- **Purpose**: Bridge native assets and stablecoins efficiently
- **Capabilities**:
  - Native ETH via RouterETH (Pool ID 13)
  - USDC (Pool ID 1)
  - USDT (Pool ID 2)
  - Other supported tokens
- **Advantages**:
  - Production-tested infrastructure
  - Deep liquidity pools
  - Lower fees
  - Simpler configuration
  - Better monitoring and reliability

## Key Finding: LayerZero OFT is Redundant

Since Stargate can handle:
1. **Native ETH** - via RouterETH
2. **WETH** - it's just wrapped ETH, Stargate handles it
3. **USDC/USDT** - directly supported
4. **Token conversions** - via Uniswap on source/destination

**Conclusion**: LayerZero OFT adds unnecessary complexity without providing unique value.

## Recommended Architecture

### Simplified Cross-Chain Design

```
┌─────────────────────────────────────────────┐
│         UniversalEscrowServiceV3            │
│              (Simplified)                    │
├─────────────────────────────────────────────┤
│                                             │
│  Same-Chain Transfers:                      │
│  ├── Direct Transfer (same token)           │
│  └── Uniswap Swap (different tokens)        │
│                                             │
│  Cross-Chain Transfers:                     │
│  └── Stargate Protocol (ALL cross-chain)    │
│      ├── Native ETH                         │
│      ├── Stablecoins (USDC, USDT)          │
│      └── Convert unsupported → supported    │
│                                             │
└─────────────────────────────────────────────┘
```

### Removal Plan

1. **Remove LayerZero OFT code**:
   - `_handleCrossChainRelease()` with OFT logic
   - OFT adapter configurations
   - Composer contracts for OFT
   - WETH conversion logic for bridging

2. **Simplify to Stargate-only**:
   - Use Stargate for ALL cross-chain transfers
   - Automatic token routing:
     - Supported tokens → Direct Stargate bridge
     - Unsupported tokens → Convert to ETH/USDC → Bridge
   - Single, clear cross-chain path

3. **Keep only essential mappings**:
   - Chain ID to Stargate chain ID
   - Stargate router addresses
   - Supported token configurations

## Implementation Steps

### Phase 1: Contract Simplification
1. Create new `UniversalEscrowServiceV3Simplified.sol`
2. Remove all LayerZero OFT logic
3. Keep only Stargate cross-chain functionality
4. Simplify configuration requirements

### Phase 2: Enhanced Stargate Integration
1. Implement comprehensive token support checking
2. Add automatic routing for unsupported tokens
3. Optimize gas usage by removing redundant conversions
4. Add better error messages and logging

### Phase 3: Testing & Deployment
1. Update test suite for simplified architecture
2. Test all supported token combinations
3. Verify gas savings and fee reductions
4. Deploy and migrate users

## Benefits of Simplification

### 1. **Reduced Complexity**
- Single cross-chain protocol
- Clearer code paths
- Easier debugging

### 2. **Lower Costs**
- No redundant WETH conversions
- Optimized Stargate fees
- Less gas usage

### 3. **Better UX**
- Faster transfers
- More reliable
- Clearer error messages

### 4. **Easier Maintenance**
- Single protocol to monitor
- Simpler configuration
- Less attack surface

## Code Example: Simplified Cross-Chain Logic

```solidity
function _handleCrossChainTransfer(
    bytes32 escrowId,
    EscrowDeposit memory escrow
) internal {
    uint16 stargateChainId = chainIdToStargateId[escrow.targetChainId];
    require(stargateChainId != 0, "Chain not supported");
    
    // Check if token is directly supported by Stargate
    TokenConfig memory config = tokenConfigs[escrow.depositToken];
    
    if (config.supported) {
        // Direct Stargate transfer
        _transferViaStargate(escrowId, escrow, config);
    } else {
        // Convert to best supported token (ETH or USDC) then bridge
        address bridgeToken = _getBestBridgeToken(escrow.targetChainId);
        uint256 convertedAmount = _swapToBridgeToken(
            escrow.depositToken,
            bridgeToken,
            escrow.netAmount
        );
        
        TokenConfig memory bridgeConfig = tokenConfigs[bridgeToken];
        _transferViaStargate(escrowId, escrow, bridgeConfig);
    }
}
```

## Migration Strategy

1. **Deploy new simplified contract**
2. **Run parallel for testing period**
3. **Gradually move users to new contract**
4. **Deprecate old contract with OFT logic**

## Conclusion

Removing LayerZero OFT in favor of Stargate-only cross-chain transfers will:
- Simplify the codebase significantly
- Reduce costs for users
- Improve reliability
- Make the system easier to maintain

The redundancy is clear: Stargate can handle everything LayerZero OFT does for WETH, plus native ETH and stablecoins, with better infrastructure and lower costs.
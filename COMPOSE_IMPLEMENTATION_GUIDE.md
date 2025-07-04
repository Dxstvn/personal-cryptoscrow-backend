# LayerZero Compose Implementation Guide

## Overview

This implementation adds automatic token swapping on destination chains using LayerZero V2's compose functionality. When funds arrive on the destination chain, they are automatically swapped from WETH to the seller's desired token.

## Architecture

### 1. **EscrowSwapComposer Contract**
Deployed on each destination chain to handle automatic swaps:
- Implements `IOAppComposer` interface
- Receives WETH from LayerZero
- Swaps to target token using Uniswap
- Delivers final token to seller

### 2. **Updated UniversalEscrowService**
Enhanced to support compose messaging:
- Detects if composer is available on destination
- Sends compose instructions with transfer
- Falls back to standard transfer if no composer

### 3. **Message Flow**
```
1. Source Chain: Escrow → WETH → OFT Adapter
2. LayerZero: Bridge message + compose instructions
3. Destination Chain: OFT Adapter → WETH → Composer
4. Destination Chain: Composer → Swap → Target Token → Seller
```

## Key Features

### Safety Mechanisms
1. **Authorized Callers**: Only OFT adapters can trigger compose
2. **Slippage Protection**: Configurable max slippage (default 5%)
3. **Multi-Router Support**: Tries V3 then V2 for best execution
4. **Deadline Protection**: Transactions expire after deadline
5. **Emergency Withdrawal**: Owner can recover stuck funds

### Gas Management
- Separate gas allocation for receive (100k) and compose (500k)
- Configurable gas limits per operation
- Efficient fallback mechanisms

### Error Handling
- Graceful fallback if swap fails
- Clear error messages and events
- No funds can be lost (worst case: seller receives WETH)

## Deployment Process

### 1. Deploy Composer on Each Chain
```bash
# Deploy on Polygon Amoy (destination)
npx hardhat run scripts/deployEscrowComposer.js --network polygon-amoy

# Deploy on Arbitrum Sepolia (destination)
npx hardhat run scripts/deployEscrowComposer.js --network arbitrum-sepolia
```

### 2. Configure Escrow Service
The deployment script automatically:
- Authorizes OFT adapters
- Updates escrow service with composer addresses
- Saves deployment info

### 3. Manual Configuration (if needed)
```javascript
// Set composer for a specific chain
await escrow.setSwapComposer(40267, composerAddress); // Polygon

// Authorize OFT adapter on composer
await composer.setAuthorizedCaller(oftAdapterAddress, true);

// Adjust gas limits if needed
await escrow.setGasLimits(150000, 600000); // receive, compose
```

## Testing

### Test Scenario: ETH on Sepolia → USDC on Polygon
1. **Create Escrow**:
   - Deposit: ETH
   - Target: USDC on Polygon
   - Composer: Configured ✓

2. **Release Process**:
   - ETH → WETH (automatic)
   - WETH bridged to Polygon
   - Composer receives WETH
   - Swaps WETH → USDC
   - Delivers USDC to seller

3. **Verification**:
   - Check LayerZero Scan for transfer
   - Verify seller received USDC (not WETH)
   - Check events for swap details

## Configuration Examples

### Uniswap V3 Fee Tiers
The composer tries multiple fee tiers:
- 0.05% (500) - Stable pairs
- 0.3% (3000) - Standard pairs
- 1% (10000) - Exotic pairs

### Slippage Settings
```javascript
// Update slippage tolerance (basis points)
await composer.setSlippage(300); // 3% slippage
```

### Router Configuration
```javascript
// Update routers
await composer.setRouters(
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // V2
    "0xE592427A0AEce92De3Edee1F18E0157C05861564"  // V3
);
```

## Gas Costs

### Without Compose
- Bridge only: ~300-400k gas
- Seller receives WETH
- Must manually swap

### With Compose
- Bridge + auto-swap: ~600-800k gas
- Seller receives desired token
- No manual steps needed

## Security Considerations

1. **Trust Model**
   - Composer holds funds temporarily
   - Only authorized contracts can trigger
   - Owner has emergency withdrawal

2. **Slippage Risks**
   - Large swaps may have high slippage
   - Configure appropriate limits
   - Monitor liquidity on destination

3. **Gas Estimation**
   - Ensure sufficient gas allocated
   - Monitor failed composes
   - Adjust limits based on usage

## Monitoring

### Events to Track
- `SwapExecuted`: Successful swaps
- `SwapFailed`: Failed swaps (seller gets WETH)
- `CrossChainTransferInitiated`: Check `withCompose` flag

### Key Metrics
- Swap success rate
- Average slippage
- Gas usage patterns
- Router performance (V2 vs V3)

## Troubleshooting

### Compose Not Working
1. Check composer is deployed on destination
2. Verify OFT adapter is authorized
3. Ensure sufficient gas allocated
4. Check token liquidity on destination

### High Slippage
1. Increase slippage tolerance
2. Use different router (V2/V3)
3. Split large transfers
4. Check liquidity depth

### Gas Issues
1. Increase compose gas limit
2. Optimize swap path
3. Check destination network congestion

## Future Enhancements

1. **Multi-hop swaps** for better rates
2. **Alternative DEX integration** (Curve, Balancer)
3. **Dynamic gas calculation** based on network
4. **Batched swaps** for gas efficiency
5. **Price impact protection**

## Conclusion

The compose implementation provides a seamless cross-chain experience where sellers receive their desired tokens automatically. While it adds complexity and gas costs, the improved user experience justifies the implementation for most use cases.
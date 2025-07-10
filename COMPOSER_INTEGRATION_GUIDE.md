# Composer Integration Guide

## Overview

The Composer system enables automatic token conversion on the destination chain, eliminating the need for users to manually swap WETH to their desired token.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SOURCE CHAIN                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Escrow Contract                                                         │
│  ┌──────────────┐    Determines if composer available                   │
│  │ Check Target │ ─────────────────────────────────┐                   │
│  │    Token     │                                   │                   │
│  └──────────────┘                                   ▼                   │
│                                          ┌─────────────────────┐        │
│                                          │ targetToken != WETH │        │
│                                          │ composer != null    │        │
│                                          └─────────┬───────────┘        │
│                                                    │                     │
│                                                    ▼                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Compose Message:                                                  │  │
│  │ - recipient: seller address                                       │  │
│  │ - targetToken: USDC/DAI/ETH/etc                                  │  │
│  │ - amount: WETH amount                                            │  │
│  │ - minAmountOut: with slippage protection                         │  │
│  │ - deadline: timestamp + 1 hour                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         LAYERZERO BRIDGE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  OFT Adapter sends WETH with compose message                            │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │ Send to:     │ ──────> │   LayerZero  │ ──────> │   Deliver    │    │
│  │  Composer    │         │   Protocol   │         │   to Target  │    │
│  └──────────────┘         └──────────────┘         └──────────────┘    │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DESTINATION CHAIN                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Composer Contract                                                       │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐    │
│  │   Receive    │ ──────> │  Decode      │ ──────> │   Execute    │    │
│  │    WETH      │         │  Message     │         │    Swap      │    │
│  └──────────────┘         └──────────────┘         └──────────────┘    │
│                                                           │              │
│                                                           ▼              │
│                                              ┌───────────────────────┐   │
│                                              │ If targetToken = ETH: │   │
│                                              │   WETH.withdraw()     │   │
│                                              │ Else:                 │   │
│                                              │   Uniswap swap       │   │
│                                              └───────────────────────┘   │
│                                                           │              │
│                                                           ▼              │
│                                              ┌───────────────────────┐   │
│                                              │ Seller receives       │   │
│                                              │ target token directly │   │
│                                              └───────────────────────┘   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

## Smart Contracts

### 1. UniversalSwapComposer.sol

Key features:
- Implements LayerZero's `IOAppComposer` interface
- Receives WETH and compose messages from OFT transfers
- Automatically swaps WETH to target token
- Handles ETH unwrapping for native ETH targets
- Fallback to WETH if swap fails

### 2. UniversalEscrowServiceV3WithComposer.sol

Enhancements:
- Fixed OFT adapter selection (uses source chain adapter)
- Enhanced composer integration
- Automatic fee calculation for compose operations
- Cross-chain swap event tracking

## Deployment Steps

### Step 1: Deploy Composers

Deploy `UniversalSwapComposer` on each chain:

```javascript
// Constructor parameters
const composer = await UniversalSwapComposer.deploy(
    layerZeroEndpoint,  // 0x6EDCE65403992e310A62460808c4b910D972f10f
    ownerAddress,       // Your admin wallet
    wethAddress,        // Chain-specific WETH
    uniswapRouter      // Chain-specific router
);
```

### Step 2: Configure Composers

```javascript
// Authorize OFT adapters to send compose messages
await composer.setOFTAdapterAuthorization(oftAdapterAddress, true);

// Set slippage tolerance
await composer.setMaxSlippageBps(500); // 5%
```

### Step 3: Update Escrow Contracts

```javascript
// On Sepolia escrow: Set Arbitrum composer
await escrow.setSwapComposer(
    40231,  // Arbitrum endpoint ID
    arbitrumComposerAddress
);

// On Arbitrum escrow: Set Sepolia composer  
await escrow.setSwapComposer(
    40161,  // Sepolia endpoint ID
    sepoliaComposerAddress
);
```

## User Experience Comparison

### Without Composer
```
1. User creates escrow: 100 USDC → DAI
2. Escrow swaps: 100 USDC → 0.05 WETH
3. LayerZero bridges: 0.05 WETH
4. User receives: 0.05 WETH ❌
5. User must manually swap: 0.05 WETH → ~90 DAI
```

### With Composer
```
1. User creates escrow: 100 USDC → DAI
2. Escrow swaps: 100 USDC → 0.05 WETH
3. LayerZero bridges: 0.05 WETH + compose message
4. Composer swaps: 0.05 WETH → ~90 DAI
5. User receives: ~90 DAI ✅
```

## Gas Considerations

### Additional Gas Costs
- Compose execution: ~200-300k gas on destination
- Token approval: ~50k gas (one-time)
- Swap execution: ~150k gas
- Total additional: ~300-400k gas

### Fee Calculation
```solidity
// Base LayerZero fee
uint256 baseFee = IOFT.quoteSend(sendParam, false);

// Add 50% buffer for compose execution
uint256 totalFee = baseFee * 150 / 100;
```

## Security Features

1. **Slippage Protection**: Both source and destination swaps protected
2. **Deadline Enforcement**: 1-hour deadline for destination swaps
3. **Authorized Senders**: Only whitelisted OFT adapters can compose
4. **Fallback Mechanism**: If swap fails, user gets WETH
5. **No Infinite Approvals**: Exact amount approvals only

## Testing

### Test Scenarios

1. **ETH → USDC**: Wrap + Bridge + Swap
2. **USDC → USDC**: Swap + Bridge + Swap
3. **WETH → ETH**: Bridge + Unwrap
4. **Token → Token**: Full conversion flow

### Example Test

```javascript
// Create escrow: ETH → USDC
const tx = await escrow.createEscrow(
    seller,
    ETH_ADDRESS,           // Deposit ETH
    parseEther("0.1"),
    USDC_ADDRESS_ARB,      // Want USDC on Arbitrum
    421614,                // Arbitrum chain ID
    { value: parseEther("0.1") }
);

// After release, seller receives USDC directly!
```

## Monitoring

### Events to Track

1. **CrossChainSwapInitiated**: Escrow initiates transfer with compose
2. **ComposerExecuted**: Composer completes the swap
3. **TokenSwapped**: Actual swap details
4. **ETHUnwrapped**: For ETH targets

### LayerZero Scan

Monitor cross-chain messages:
- Check compose message delivery
- Verify swap execution
- Track end-to-end flow

## Future Enhancements

1. **Multi-hop Swaps**: Support complex token paths
2. **DEX Aggregation**: Use multiple DEXs for better rates
3. **Price Oracles**: Better slippage calculation
4. **Batch Operations**: Multiple swaps in one compose
5. **Fee Optimization**: Dynamic gas estimation

## Troubleshooting

### Common Issues

1. **Insufficient Gas**: Increase compose gas limits
2. **Swap Reverts**: Check liquidity and slippage
3. **Authorization Failed**: Verify OFT adapter whitelist
4. **Deadline Exceeded**: Increase deadline buffer

### Fallback Behavior

If any step fails, users receive WETH:
- Maintains value
- No funds lost
- Manual swap still possible
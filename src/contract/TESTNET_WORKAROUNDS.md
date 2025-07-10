# Testnet Workarounds

This document contains workarounds that were used during testnet development but removed for production.

## Stargate Hardcoded Fees

During testnet development, we encountered issues with Stargate's quote function returning 0 or failing. As a workaround, we used hardcoded fees:

```solidity
// TESTNET WORKAROUND: Use hardcoded fees for Sepolia and Arbitrum Sepolia
if ((block.chainid == 11155111 && targetChainId == 421614) || 
    (block.chainid == 421614 && targetChainId == 11155111)) {
    
    // Hardcoded fees for testnet
    if (block.chainid == 11155111 && targetChainId == 421614) {
        fee = 0.002 ether; // Sepolia to Arbitrum Sepolia
    } else {
        fee = 0.001 ether; // Arbitrum Sepolia to Sepolia
    }
    
    // Calculate minimum amount out with slippage
    minAmountOut = amount * (MAX_BPS - maxSlippageBps) / MAX_BPS;
    return (fee, minAmountOut);
}
```

### When to Use
- Only on testnets where Stargate quote function is broken
- When testing cross-chain functionality without mainnet infrastructure
- For rapid prototyping when exact fees aren't critical

### Why Removed for Production
- Production Stargate infrastructure provides accurate quotes
- Hardcoded fees could lead to failed transactions or overpayment
- Dynamic fees are essential for handling network congestion

## High Slippage Tolerance

We also used higher slippage tolerance on testnets:

```solidity
// TESTNET: Use higher slippage tolerance for testnets
uint256 slippageBps = ((block.chainid == 11155111 || block.chainid == 421614) && 
                      (targetChainId == 11155111 || targetChainId == 421614)) 
                      ? 2000 // 20% slippage for testnets
                      : maxSlippageBps;
```

This was due to poor liquidity in testnet pools. Production should use the configured `maxSlippageBps` (typically 5%).
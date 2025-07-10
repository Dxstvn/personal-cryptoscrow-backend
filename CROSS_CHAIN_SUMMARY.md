# Cross-Chain Token Handling Summary

## 🎯 The Core Principle

**ALL cross-chain transfers go through WETH as the universal bridge token**

```
Any Token (Source) → WETH → LayerZero Bridge → WETH → Any Token (Destination)
```

## 📊 Complete Cross-Chain Scenarios

### Scenario 1: ETH → Any Token
- **Source**: Wrap ETH to WETH (`WETH.deposit()`)
- **Bridge**: Send WETH via LayerZero
- **Destination**: 
  - Without Composer: User gets WETH
  - With Composer: Auto-convert WETH to target token

### Scenario 2: Any ERC20 → Any Token
- **Source**: Swap token to WETH via Uniswap
- **Bridge**: Send WETH via LayerZero
- **Destination**: 
  - Without Composer: User gets WETH
  - With Composer: Auto-convert WETH to target token

### Scenario 3: WETH → Any Token
- **Source**: Already WETH, no conversion
- **Bridge**: Send WETH via LayerZero
- **Destination**: 
  - Without Composer: User gets WETH
  - With Composer: Auto-convert WETH to target token

## 🔧 Technical Implementation

### Source Chain Processing
```solidity
// Convert everything to WETH before bridging
if (escrow.depositToken == address(0)) {
    // ETH: Wrap to WETH
    WETH.deposit{value: escrow.netAmount}();
    bridgeAmount = escrow.netAmount;
} else if (escrow.depositToken != address(WETH)) {
    // Any ERC20: Swap to WETH via Uniswap
    // USDC → WETH, DAI → WETH, etc.
    bridgeAmount = swapTokenToWETH(escrow.depositToken, escrow.netAmount);
}
// If already WETH: bridgeAmount = escrow.netAmount
```

### Destination Chain Handling
```solidity
// Check if automatic conversion is available
bool useCompose = composer != address(0) && escrow.targetToken != address(WETH);

if (useCompose) {
    // Send to composer contract with swap instructions
    // Composer will: WETH → targetToken → seller
    sendTo = composer;
    includeSwapInstructions = true;
} else {
    // Send WETH directly to seller
    // Seller must manually swap if they want different token
    sendTo = seller;
}
```

## 📝 Real Example Flows

### Example 1: 100 USDC (Sepolia) → USDC (Arbitrum)
1. User deposits 100 USDC on Sepolia
2. Contract swaps 100 USDC → ~0.05 WETH (Uniswap)
3. Contract bridges 0.05 WETH (LayerZero)
4. **Current**: User receives 0.05 WETH on Arbitrum
5. **Future**: Composer swaps 0.05 WETH → ~99 USDC

### Example 2: 0.1 ETH (Sepolia) → DAI (Arbitrum)
1. User deposits 0.1 ETH on Sepolia
2. Contract wraps 0.1 ETH → 0.1 WETH
3. Contract bridges 0.1 WETH (LayerZero)
4. **Current**: User receives 0.1 WETH on Arbitrum
5. **Future**: Composer swaps 0.1 WETH → ~180 DAI

## ⚡ Current System Status

| Feature | Status | Result |
|---------|--------|--------|
| ETH → WETH wrapping | ✅ Working | Automatic on source |
| Token → WETH swaps | ✅ Working | Via Uniswap on source |
| WETH bridging | ✅ Working | Via LayerZero OFT |
| Destination composers | ❌ Not deployed | Users get WETH only |
| Auto-conversion | ❌ Not available | Manual swap needed |

## 🎯 Key Takeaways

1. **WETH is the universal bridge token** - All paths lead through WETH
2. **Source chain handles all conversions** - Everything becomes WETH before bridging
3. **Destination is currently WETH-only** - Users must swap manually
4. **Composers will enable auto-conversion** - Future enhancement for better UX

## 🔍 Verified Transaction Example

From our test:
- **Input**: 0.0002 ETH on Sepolia
- **Process**: ETH → WETH → Bridge → WETH
- **Output**: 0.000196 WETH on Arbitrum (after 2% fee)
- **Verified TX**: [0x2e904396...](https://sepolia.etherscan.io/tx/0x2e904396c69ce22ba152c56e6d4da9bb4bb44dfa51f32e6a20235cf3a4a95c0b)
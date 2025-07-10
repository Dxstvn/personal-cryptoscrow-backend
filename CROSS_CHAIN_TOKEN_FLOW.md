# Cross-Chain Token Flow Architecture

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SOURCE CHAIN (e.g., Sepolia)                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  User Deposits:           Contract Converts:          Ready to Bridge:           │
│  ┌─────────────┐         ┌─────────────────┐        ┌──────────────┐           │
│  │    ETH      │  ──-->  │  WETH.deposit() │  ───>  │              │           │
│  └─────────────┘         └─────────────────┘        │              │           │
│                                                      │              │           │
│  ┌─────────────┐         ┌─────────────────┐        │    WETH     │           │
│  │    USDC     │  ──-->  │ Uniswap: USDC→ │  ───>  │   (Always)   │           │
│  └─────────────┘         │     WETH       │        │              │           │
│                          └─────────────────┘        │              │           │
│  ┌─────────────┐                                    │              │           │
│  │    WETH     │  ──────────────────────────────>  │              │           │
│  └─────────────┘         (No conversion)            └──────────────┘           │
│                                                             │                    │
└─────────────────────────────────────────────────────────────┘                    │
                                                             │                    
                                                             ▼                    
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LAYERZERO BRIDGE                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌──────────────┐        ┌─────────────────┐        ┌──────────────┐           │
│  │ OFT Adapter  │  ───>  │ LayerZero V2    │  ───>  │ OFT Adapter  │           │
│  │  (Source)    │        │   Messaging     │        │ (Destination)│           │
│  └──────────────┘        └─────────────────┘        └──────────────┘           │
│                                                                                   │
│  Only bridges WETH tokens across chains                                          │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                             │                    
                                                             ▼                    
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DESTINATION CHAIN (e.g., Arbitrum)                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  Received:              Without Composer:            With Composer:              │
│  ┌──────────────┐      ┌─────────────────┐         ┌─────────────────┐         │
│  │              │      │ User receives    │         │ Auto-convert to │         │
│  │    WETH     │ ───> │     WETH        │   OR    │  target token   │         │
│  │  (Always)    │      │ (Manual swap    │         │ (ETH, USDC,     │         │
│  │              │      │  needed)        │         │  DAI, etc.)     │         │
│  └──────────────┘      └─────────────────┘         └─────────────────┘         │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Key Points

### 1. **Source Chain Logic**
```solidity
// The contract ALWAYS converts to WETH before bridging
if (depositToken == ETH) {
    WETH.deposit{value: amount}();  // Wrap ETH
} else if (depositToken != WETH) {
    swapTokenToWETH(depositToken);   // Swap any token to WETH
}
// If already WETH, no conversion needed
```

### 2. **Bridge Token**
- **ONLY WETH** is bridged via LayerZero
- This is because each OFT adapter is configured for a specific token (WETH)
- Creating OFT adapters for every token would be complex and expensive

### 3. **Destination Chain Options**

**Current Implementation (No Composer)**:
- User ALWAYS receives WETH
- If they want a different token, they must:
  1. Receive WETH from the escrow
  2. Manually swap WETH → desired token on a DEX
  3. Or unwrap WETH → ETH if they want native ETH

**Future Implementation (With Composer)**:
- Composer contract receives WETH + instructions
- Automatically executes swap/unwrap
- User receives their desired token in one transaction

## Example Flows

### Example 1: USDC (Sepolia) → USDC (Arbitrum)
```
1. User deposits 100 USDC on Sepolia
2. Contract swaps: 100 USDC → 0.05 WETH (via Uniswap)
3. Contract bridges: 0.05 WETH via LayerZero
4. Current: User receives 0.05 WETH on Arbitrum (must swap manually)
5. Future: Composer auto-swaps 0.05 WETH → ~99 USDC
```

### Example 2: ETH (Sepolia) → DAI (Arbitrum)
```
1. User deposits 0.1 ETH on Sepolia
2. Contract wraps: 0.1 ETH → 0.1 WETH
3. Contract bridges: 0.1 WETH via LayerZero
4. Current: User receives 0.1 WETH on Arbitrum (must swap manually)
5. Future: Composer auto-swaps 0.1 WETH → ~180 DAI
```

### Example 3: WETH (Sepolia) → WETH (Arbitrum)
```
1. User deposits 0.1 WETH on Sepolia
2. No conversion needed
3. Contract bridges: 0.1 WETH via LayerZero
4. User receives 0.1 WETH on Arbitrum
5. No composer needed - already in desired token
```

## Why This Architecture?

1. **Simplicity**: One OFT adapter per chain (just for WETH)
2. **Liquidity**: WETH has the deepest liquidity on all chains
3. **Gas Efficiency**: Fewer contract deployments and interactions
4. **Flexibility**: Any token can be converted to/from WETH
5. **Security**: Well-tested WETH contracts on all chains

## Current Limitations

1. **No Composers on Testnets**: Users always receive WETH
2. **Manual Swaps Required**: Users must swap WETH themselves on destination
3. **Extra Transaction**: Users pay gas twice (receive + swap)

## Future Improvements

1. **Deploy Composers**: Enable automatic token conversion on destination
2. **Multi-Path Routing**: Support direct token bridges where available
3. **Batch Operations**: Allow multiple escrows in one transaction
# EscrowServiceV3 - Unified Escrow Service

## Overview

`EscrowServiceV3` is a unified service that handles all interactions with UniversalEscrowServiceV3 smart contracts. It consolidates all escrow functionality into a single, maintainable interface.

## Features

- ✅ **V3-Only**: Exclusively uses UniversalEscrowServiceV3 contracts
- ✅ **Multi-Chain**: Supports Arbitrum Sepolia, Sepolia, and Polygon Amoy
- ✅ **Cross-Chain**: LayerZero OFT integration for cross-chain transfers
- ✅ **Token Swaps**: Uniswap V3 integration for automatic token swaps
- ✅ **Unified Interface**: Single service for all escrow operations

## Installation

```javascript
import { EscrowServiceV3 } from './services/escrowServiceV3.js';
const escrowService = new EscrowServiceV3();
```

## Core Methods

### Escrow Operations

```javascript
// Create a new escrow
const result = await escrowService.createEscrow({
  chainId: 11155111,           // Source chain
  seller: '0x...',              // Seller address
  depositToken: '0x0...',       // Token to deposit (0x0 for ETH)
  amount: '1',                  // Amount in token units
  targetToken: '0x...',         // Token seller wants
  targetChainId: 80002,         // Target chain
  signerPrivateKey: '0x...'     // Optional, uses default if not provided
});

// Update escrow condition
await escrowService.updateCondition(chainId, escrowId, true);

// Release escrow (with cross-chain fees if needed)
await escrowService.releaseEscrow(chainId, escrowId, value);

// Cancel escrow
await escrowService.cancelEscrow(chainId, escrowId);
```

### Fee Management

```javascript
// Calculate 2% service fee
const serviceFee = escrowService.calculateServiceFee('100'); // Returns "2.0"

// Quote cross-chain fees
const quote = await escrowService.quoteCrossChainFee(
  sourceChainId,
  targetChainId,
  amount
);

// Estimate total fees
const fees = await escrowService.estimateTotalFees({
  amount: '100',
  sourceChainId: 11155111,
  targetChainId: 80002,
  requiresSwap: true
});
```

### Chain Configuration

```javascript
// Get supported chains
const chains = escrowService.getSupportedChains();

// Get chain config
const config = escrowService.getChainConfig(11155111);

// Get specific addresses
const oftAdapter = escrowService.getOFTAdapter(chainId);
const composer = escrowService.getComposer(chainId);
```

### Token Operations

```javascript
// Get token info
const info = await escrowService.getTokenInfo(tokenAddress, chainId);

// Quote Uniswap swap
const quote = await escrowService.quoteSwap(
  fromToken,
  toToken,
  amount,
  chainId
);

// Get supported tokens
const tokens = await escrowService.getSupportedTokens(chainId);
```

## Supported Chains

| Chain | Chain ID | Contract Address |
|-------|----------|------------------|
| Arbitrum Sepolia | 421614 | 0xeb8e89c8872f476750C91a9557798ec83EDC7031 |
| Sepolia | 11155111 | 0xBA10d8d3A09439eA5984F545C925d61958fa14E9 |
| Polygon Amoy | 80002 | 0x52e89b515E2636aA7bBe456e546878D0903E85f1 |

## Environment Variables

```bash
# RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
ARBITRUM_SEPOLIA_RPC_URL=https://arbitrum-sepolia.infura.io/v3/YOUR_KEY
POLYGON_AMOY_RPC_URL=https://polygon-amoy.infura.io/v3/YOUR_KEY

# Private Key
BACKEND_WALLET_PRIVATE_KEY=0x...
```

## Testing

```bash
# Run unit tests
npm test -- escrowServiceV3.test.js

# Run integration tests (requires RPC URLs)
npm test -- escrowServiceV3.integration.test.js

# Run example
node src/services/examples/escrowServiceV3.example.js
```

## Migration from Old Services

This service replaces:
- `blockchainService.js`
- `contractDeployer.js`
- `crossChainContractDeployer.js`
- `universalContractDeployer.js`
- `crossChainService.js`
- `smartContractBridgeService.js`

Simply replace imports and update method calls to use the unified service.

## Error Handling

The service includes comprehensive error handling:
- Chain validation
- RPC connection checks
- Private key validation
- Contract interaction errors
- Network-specific error messages

## Best Practices

1. **Initialize Once**: Call `initialize()` once at startup
2. **Reuse Providers**: The service caches providers and wallets
3. **Handle Fees**: Always quote fees before cross-chain transfers
4. **Use 3x Buffer**: Multiply LayerZero quotes by 3 for safety
5. **Check Explorer**: Use `getExplorerUrl()` for transaction links
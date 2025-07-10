# Cross-Chain Transaction Verification Guide

## Overview

This guide explains how to verify that cross-chain transactions complete successfully through the entire flow: **deposit → bridging → service fee → bridging → seller receives**.

## Important: Authorization Requirements

The UniversalEscrowServiceV3 contract has authorization controls:
- **Only authorized updaters** can set escrow conditions to `true`
- **Only the buyer or owner** can release an escrow (after condition is met)
- **The contract owner** can always update conditions and release escrows

### Check Your Authorization Status

```bash
node src/services/scripts/checkConditionUpdaters.js
```

This will show:
- Who owns each contract
- Whether your wallet is authorized
- Which addresses can update conditions

## Automated Verification

### 1. Run Live Cross-Chain Test (If Authorized)

```bash
# Requires BACKEND_WALLET_PRIVATE_KEY in .env
npm run verify:crosschain

# Test specific route
node src/services/scripts/verifyCrossChainComplete.js --route=0
# Routes:
# 0: Sepolia → Arbitrum Sepolia
# 1: Arbitrum Sepolia → Sepolia  
# 2: Sepolia → Polygon Amoy
```

This script will:
1. Create a new escrow with a random seller address
2. Deposit 0.0001 ETH
3. Update condition to true (requires authorization)
4. Get LayerZero fee quote
5. Release escrow with cross-chain transfer
6. **Monitor destination chain for up to 5 minutes**
7. Verify seller receives exactly 0.000098 WETH (2% fee deducted)

**Note**: If you're not authorized, the script will provide manual steps to complete the test.

### Alternative: Owner Release Method

If you're the contract owner:

```bash
node src/services/scripts/verifyWithOwnerRelease.js
```

This method works if you deployed the contracts and are the owner.

### 2. Check Existing Transactions

```bash
npm run verify:crosschain:check
```

This checks known test transactions and their current status.

### 3. Run Vitest Cross-Chain Test

```bash
npm run test:v3:crosschain
```

This runs the comprehensive test suite with delivery monitoring.

## Manual Verification Steps

If you need to manually verify a cross-chain transaction:

### Step 1: Check Source Chain Transaction

1. Go to the source chain explorer
2. Find the release transaction
3. Look for these events:
   - `EscrowReleased` - Confirms escrow was released
   - `CrossChainTransferInitiated` - Contains the LayerZero GUID
   - `OFTSent` - Shows amount sent via OFT adapter

### Step 2: Track on LayerZero

1. Copy the GUID from `CrossChainTransferInitiated` event
2. Go to https://layerzeroscan.com/tx/{GUID}
3. Check status:
   - **Sent**: Message initiated
   - **Delivered**: Message received on destination
   - **Failed**: Something went wrong

### Step 3: Verify Destination Receipt

1. Go to destination chain explorer
2. Check seller address for WETH balance
3. Expected amount: Original amount × 0.98 (2% service fee)

## Transaction Flow Breakdown

```
1. User deposits 0.0001 ETH into escrow
   ↓
2. Service fee (2%) = 0.000002 ETH deducted
   ↓
3. Net amount = 0.000098 ETH to be bridged
   ↓
4. ETH converted to WETH on source chain
   ↓
5. LayerZero OFT adapter burns WETH on source
   ↓
6. LayerZero message sent to destination chain
   ↓
7. OFT adapter on destination mints WETH
   ↓
8. Seller receives 0.000098 WETH on destination
```

## Verification Links for Known Transactions

### Arbitrum Sepolia → Sepolia (Successfully Delivered)

- **TX**: https://sepolia.arbiscan.io/tx/0xb51424ed01fdd8cc03831bef15fe6dd250a766f902c8a0386f28b8be1a200625
- **LayerZero**: https://layerzeroscan.com/tx/0xbcab3c617b8822dfd14e472d74131931d655608588eb4908f2849f1c09600acc
- **Seller**: https://sepolia.etherscan.io/address/0x6Deb7c0886b94b289F891bC1C0D6c447F74f3BaA
- **Expected**: 0.000098 WETH

### Sepolia → Polygon Amoy

- **LayerZero**: https://layerzeroscan.com/tx/0xb690a71dc7caa38c5982d4d78c8538082000c71f562bda9ddca370945ced08df
- **Seller**: https://amoy.polygonscan.com/address/0x7fFA8De598e503491e33DB6CAe6ebac1AF71C07e
- **Expected**: 0.000098 WETH

## Common Issues

### Authorization Error (0x5c427cd9)

This error means your wallet is not authorized to update conditions. Solutions:

1. **If you're the contract owner**: You can update conditions directly
2. **If you're not the owner**: 
   - Contact the contract owner to add you as a condition updater
   - Or have the owner set the condition manually
   - Or use a pre-authorized service wallet

To add a wallet as condition updater (owner only):
```bash
node src/services/scripts/checkConditionUpdaters.js --set 11155111 0xYourWalletAddress
```

### Transaction Pending After 5 Minutes

1. Check LayerZero scan for detailed status
2. Testnet can be slower than mainnet
3. Check if endpoints are properly configured

### Balance Shows 0 Despite "Delivered" Status

1. Check if the correct token address is being checked
2. Verify the seller address is correct
3. Check for any execution errors in LayerZero scan

### Fee Quote Failures

The system uses fallback methods:
1. OFT adapter quote (requires peers)
2. Direct endpoint quote
3. Mock quoter (always works)

## Required Environment

To run live verification tests:

```env
# .env file
BACKEND_WALLET_PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=your_sepolia_rpc_url
ARBITRUM_SEPOLIA_RPC_URL=your_arbitrum_rpc_url
POLYGON_AMOY_RPC_URL=your_polygon_rpc_url
```

## Success Criteria

A cross-chain transaction is considered successful when:

1. ✅ Escrow is created and funded
2. ✅ Service fee (2%) is deducted
3. ✅ CrossChainTransferInitiated event is emitted with GUID
4. ✅ LayerZero scan shows "Delivered" status
5. ✅ Seller receives exactly 98% of original amount as WETH
6. ✅ Escrow is marked as released on source chain

## Debugging

Enable verbose logging:

```javascript
const feeQuote = await service.quoteCrossChainFee(
  sourceChainId,
  targetChainId,
  amount,
  { verbose: true } // Enables detailed logging
);
```

Check contract state:
```javascript
const escrowDetails = await service.getEscrowDetails(chainId, escrowId);
console.log('Released:', escrowDetails.released);
console.log('Net amount:', escrowDetails.netAmount);
```
# Production OFT Setup Guide

## Overview
For production, your backend service wallet should own the OFT adapters. This gives you full control over which escrow contracts can perform cross-chain transfers.

## Current Issue
- Your escrow contract: `0x6857A4be630282eE9B270CD99BD0DCDB59642e55`
- Current OFT owner: `0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D` (not your service wallet)
- Your service wallet: `0x2223F51659fAcC662504dcEbD4735886285ABC96`

## Solution: Deploy Your Own OFT Adapters

### Step 1: Deploy OFT Adapters
Run this script to deploy OFT adapters where YOUR service wallet is the owner:

```bash
node src/services/scripts/deployOFTAdaptersWithServiceWallet.js
```

This will:
- Deploy new OFT adapters on Sepolia and Arbitrum Sepolia
- Set your service wallet as the owner
- Automatically authorize your escrow contract
- Save deployment information

### Step 2: Update Configuration
After deployment, update your service configuration:

```bash
node src/services/scripts/updateEscrowServiceConfig.js
```

This will show you exactly what to update in:
- `escrowServiceV3.js` (chain configurations)
- `.env` file (OFT adapter addresses)

### Step 3: Verify Setup
Test your new setup with:

```bash
npm run verify:crosschain:yours
```

## Benefits of This Approach

1. **Full Control**: Your service wallet owns the OFT adapters
2. **Security**: You control which contracts can bridge tokens
3. **Flexibility**: Add/remove authorized contracts anytime
4. **Production Ready**: No dependency on external owners

## Production Checklist

- [ ] Deploy OFT adapters with service wallet as owner
- [ ] Update escrowServiceV3.js with new OFT addresses
- [ ] Update .env with OFT adapter addresses
- [ ] Test cross-chain functionality
- [ ] Document OFT adapter addresses
- [ ] Set up monitoring for OFT adapter usage
- [ ] Consider multisig for OFT adapter ownership

## Security Considerations

1. **Private Key Security**: Keep your service wallet private key secure
2. **Access Control**: Only authorize trusted escrow contracts
3. **Monitoring**: Watch for unauthorized usage attempts
4. **Upgrades**: Plan for OFT adapter upgrades if needed

## Quick Reference

### Authorize a New Escrow Contract
```javascript
// As OFT owner (your service wallet)
await oftAdapter.setAuthorizedReleaseCaller(escrowAddress, true);
```

### Revoke Authorization
```javascript
await oftAdapter.setAuthorizedReleaseCaller(escrowAddress, false);
```

### Check Authorization
```javascript
const isAuthorized = await oftAdapter.authorizedReleaseCallers(escrowAddress);
```

## Alternative: Get Current OFT Owner to Authorize

If you can't deploy new OFT adapters immediately, contact the current owner:
- Owner: `0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D`
- Request: `authorizeEscrowContract("0x6857A4be630282eE9B270CD99BD0DCDB59642e55", true)`

But for production, you should control your own OFT adapters.
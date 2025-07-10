# OFT Authorization Guide

## Overview

Your newly deployed escrow contract (0x6857A4be630282eE9B270CD99BD0DCDB59642e55) needs to be authorized on the OFT adapter to enable cross-chain functionality. This guide explains the authorization process and provides workarounds for testing.

## Current Status

- **Your Contract**: `0x6857A4be630282eE9B270CD99BD0DCDB59642e55`
- **OFT Adapter**: `0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4` (Sepolia)
- **OFT Owner**: `0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D`
- **Authorization Status**: ❌ Not Authorized

## Scripts Available

### 1. Check Authorization Status
```bash
node src/services/scripts/authorizeYourContractOnOFT.js
```
This script:
- Checks if your contract is authorized
- Determines if you're the OFT owner
- Provides authorization commands if you're the owner
- Suggests alternatives if you're not

### 2. Test Same-Chain Operations
```bash
node src/services/scripts/testSameChainEscrow.js
```
This script:
- Shows how to test without OFT authorization
- Provides example transactions for Sepolia-only testing
- Checks your contract status and permissions

### 3. Check Your Escrow
```bash
node src/services/scripts/checkYourEscrow.js
```
This script:
- Verifies your escrow contract deployment
- Checks condition updater permissions
- Lists recent transactions

## Authorization Options

### Option 1: Get Authorized by OFT Owner
The OFT owner needs to execute:
```javascript
await oftAdapter.authorizeEscrowContract("0x6857A4be630282eE9B270CD99BD0DCDB59642e55", true)
```

### Option 2: Test Without Authorization
You can test all escrow features except cross-chain transfers:

1. **Same-Chain Testing** (Recommended)
   - Create transactions where source and destination are both Sepolia
   - All escrow features work normally
   - No token bridging occurs

2. **Example Test Transaction**
   ```javascript
   const testTx = {
     transactionId: 'test-001',
     sender: yourAddress,
     receiver: recipientAddress,
     tokenAddress: '0x0000000000000000000000000000000000000000', // ETH
     amount: ethers.parseEther('0.001'),
     sourceChainId: 11155111, // Sepolia
     destChainId: 11155111,   // Sepolia (same chain!)
     hashlock: ethers.keccak256(ethers.toUtf8Bytes('secret')),
     timelock: Math.floor(Date.now() / 1000) + 3600
   };
   ```

### Option 3: Deploy Your Own OFT Adapters
For full control over cross-chain functionality:
1. Deploy OFT adapter contracts on each chain
2. Configure LayerZero endpoints
3. Authorize your escrow contract
4. More complex but gives complete control

## Testing Workflow

1. **Start with same-chain tests** to verify your escrow logic
2. **Use small amounts** (0.001 ETH) for testing
3. **Keep track of secrets** for releasing funds
4. **Monitor on Etherscan** for transaction verification

## Troubleshooting

### "execution reverted" Error
The OFT adapter might have a different interface. Check the contract on Etherscan:
https://sepolia.etherscan.io/address/0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4#code

### "Not a condition updater" Warning
You can still:
- Create transactions where you're the sender
- Release transactions where you're involved
- Admin functions require updater permissions

## Next Steps

1. Run `authorizeYourContractOnOFT.js` to check current status
2. Test with same-chain operations using `testSameChainEscrow.js`
3. Contact OFT owner for authorization if needed
4. Once authorized, test cross-chain functionality

## Support

For questions about:
- OFT authorization: Contact the adapter owner
- Escrow functionality: Test with same-chain first
- Cross-chain issues: Verify authorization status
# Compose Functionality Testing Guide

## Overview

This guide covers the complete testing process for the LayerZero compose functionality that enables automatic token swapping on destination chains.

## Architecture Recap

1. **UniversalEscrowService**: Main escrow contract with compose support
2. **EscrowSwapComposer**: Destination chain contract that handles auto-swaps
3. **OFT Adapters**: Bridge WETH across chains
4. **LayerZero Compose**: Horizontal composability for automatic execution

## Pre-requisites

### 1. Deploy Escrow Service (if not already deployed)
```bash
# Deploy on all test networks
npx hardhat run scripts/deployUniversalEscrow.js --network sepolia
npx hardhat run scripts/deployUniversalEscrow.js --network polygon-amoy
npx hardhat run scripts/deployUniversalEscrow.js --network arbitrum-sepolia
```

### 2. Deploy OFT Adapters (if not already deployed)
```bash
# Deploy standard OFT adapters
npx hardhat run scripts/deployStandardOFTAdapter.js --network sepolia
npx hardhat run scripts/deployStandardOFTAdapter.js --network polygon-amoy
npx hardhat run scripts/deployStandardOFTAdapter.js --network arbitrum-sepolia
```

### 3. Configure Trusted Remotes
```bash
# Set up three-way trusted remote configuration
npx hardhat run scripts/configureTrustedRemotes.js --network sepolia
```

## Step-by-Step Compose Deployment

### Step 1: Deploy Swap Composers

Deploy the composer on each **destination** chain:

```bash
# Deploy on Polygon Amoy (destination for Sepolia)
npx hardhat run scripts/deployEscrowComposer.js --network polygon-amoy

# Deploy on Arbitrum Sepolia (destination for Sepolia)
npx hardhat run scripts/deployEscrowComposer.js --network arbitrum-sepolia

# Deploy on Sepolia (destination for other chains)
npx hardhat run scripts/deployEscrowComposer.js --network sepolia
```

### Step 2: Verify Composer Configuration

The deployment script automatically:
- Authorizes OFT adapters to call the composer
- Updates escrow service with composer addresses
- Saves deployment information

Verify with:
```bash
npx hardhat console --network sepolia

> const escrow = await ethers.getContractAt("UniversalEscrowService", "ESCROW_ADDRESS")
> await escrow.getSwapComposer(40267) // Should return Polygon composer
> await escrow.getSwapComposer(40231) // Should return Arbitrum composer
```

### Step 3: Configure Gas Limits (Optional)

Adjust gas limits if needed:
```javascript
// Default: 100k for receive, 500k for compose
await escrow.setGasLimits(150000, 600000);
```

## Running the Enhanced Test Suite

### 1. Basic Test (Original)
Tests basic functionality without compose:
```bash
npx hardhat run scripts/testUniversalEscrowComplete.js --network sepolia
```

### 2. Enhanced Test (With Compose)
Tests all compose scenarios:
```bash
npx hardhat run scripts/testUniversalEscrowEnhanced.js --network sepolia
```

## Test Scenarios Covered

### Scenario 1: Direct Transfer (Same Chain, Same Token)
- **Flow**: ETH → ETH
- **Expected**: Direct transfer, no compose
- **Verification**: Seller receives ETH directly

### Scenario 2: Uniswap Swap (Same Chain, Different Token)
- **Flow**: ETH → USDC
- **Expected**: Uniswap swap on source chain
- **Verification**: Seller receives USDC

### Scenario 3: Cross-Chain to WETH
- **Flow**: ETH → Polygon WETH
- **Expected**: LayerZero bridge, no compose
- **Verification**: Seller receives WETH on Polygon

### Scenario 4: Cross-Chain with Auto-Swap
- **Flow**: ETH → Polygon USDC
- **Expected**: LayerZero bridge with compose
- **Verification**: Seller receives USDC (not WETH) on Polygon

### Scenario 5: Cross-Chain to Native Token
- **Flow**: ETH → Polygon ETH
- **Expected**: LayerZero bridge with compose unwrap
- **Verification**: Seller receives native ETH on Polygon

## Monitoring Cross-Chain Transfers

### 1. LayerZero Scan
Track cross-chain messages:
```
https://layerzeroscan.com/tx/{GUID}
```

### 2. Destination Chain Events
Monitor composer events on destination:
```javascript
// Watch for SwapExecuted events
const composer = await ethers.getContractAt("EscrowSwapComposer", COMPOSER_ADDRESS);
composer.on("SwapExecuted", (recipient, tokenIn, tokenOut, amountIn, amountOut, router) => {
    console.log(`Swap executed: ${amountIn} ${tokenIn} → ${amountOut} ${tokenOut}`);
});
```

### 3. Balance Verification
Check seller balances on destination:
```javascript
// For native token
const balance = await ethers.provider.getBalance(SELLER_ADDRESS);

// For ERC20
const token = await ethers.getContractAt("IERC20", TOKEN_ADDRESS);
const balance = await token.balanceOf(SELLER_ADDRESS);
```

## Troubleshooting

### Compose Not Working
1. **Check composer deployment**:
   ```javascript
   const composer = await escrow.getSwapComposer(CHAIN_ID);
   console.log("Composer:", composer); // Should not be zero address
   ```

2. **Verify OFT adapter authorization**:
   ```javascript
   const composer = await ethers.getContractAt("EscrowSwapComposer", COMPOSER_ADDRESS);
   const isAuthorized = await composer.authorizedCallers(OFT_ADAPTER);
   console.log("Authorized:", isAuthorized); // Should be true
   ```

3. **Check gas allocation**:
   ```javascript
   const receiveGas = await escrow.lzReceiveGas();
   const composeGas = await escrow.lzComposeGas();
   console.log("Gas limits:", receiveGas, composeGas);
   ```

### High Slippage
1. **Adjust slippage on composer**:
   ```javascript
   await composer.setSlippage(300); // 3% slippage
   ```

2. **Check liquidity**:
   - Verify token pairs have sufficient liquidity
   - Consider using different DEX routers

### Failed Swaps
If swaps fail, seller receives WETH as fallback:
- Check `SwapFailed` events for reasons
- Verify router configuration
- Ensure tokens are compatible

## Gas Optimization

### Without Compose
- Source chain: ~300-400k gas
- Destination: Manual swap required

### With Compose
- Source chain: ~400-500k gas (includes compose fee)
- Destination: Automatic, no action needed

## Production Checklist

Before mainnet deployment:

1. **Security**:
   - [ ] Audit composer contract
   - [ ] Test emergency withdrawal
   - [ ] Verify slippage limits

2. **Configuration**:
   - [ ] Set appropriate gas limits
   - [ ] Configure all chain composers
   - [ ] Set production slippage

3. **Monitoring**:
   - [ ] Set up event monitoring
   - [ ] Track swap success rates
   - [ ] Monitor gas usage

4. **Documentation**:
   - [ ] Update user guides
   - [ ] Document gas costs
   - [ ] Create troubleshooting guide

## Example Integration

### Frontend Integration
```javascript
// Check if compose is available
const composer = await escrow.getSwapComposer(targetChainId);
const composeAvailable = composer !== ethers.constants.AddressZero;

// Show to user
if (composeAvailable && targetToken !== WETH) {
    console.log("✅ Auto-swap enabled: You'll receive your desired token automatically");
} else {
    console.log("⚠️ Manual swap required: You'll receive WETH on destination");
}
```

### Gas Estimation
```javascript
// Estimate total cost including compose
const sendParam = {
    dstEid: targetChainId,
    to: ethers.utils.zeroPad(seller, 32),
    amountLD: amount,
    minAmountLD: amount * 95n / 100n,
    extraOptions: composer ? composeOptions : standardOptions,
    composeMsg: composer ? composeMessage : "0x",
    oftCmd: "0x"
};

const fee = await oftAdapter.quoteSend(sendParam, false);
console.log("Total fee (including compose):", ethers.utils.formatEther(fee.nativeFee));
```

## Conclusion

The compose functionality significantly improves user experience by automating token swaps on destination chains. While it adds complexity and gas costs, the seamless experience justifies the implementation for most use cases.

For support or questions, refer to:
- LayerZero V2 Documentation: https://docs.layerzero.network/
- Uniswap Documentation: https://docs.uniswap.org/
- This repository's issues section
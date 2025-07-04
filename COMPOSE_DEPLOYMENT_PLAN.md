# Complete Compose Deployment and Testing Plan

## Current Status

### ✅ Already Deployed:
1. **UniversalEscrowService on Sepolia**: `0x335Bb94C802E224Bc3D7afE9d65902df9984ed08`
2. **OFT Adapters on all networks**: 
   - Sepolia WETH: `0x90653738e66A0fa93BF20b087e6A39A704FA39e1`
   - Polygon WMATIC: `0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df`
   - Arbitrum WETH: `0x5661438B6C23dDFdC718591c3A85FeE1433Dab36`

### ❌ Not Yet Deployed:
1. **UniversalEscrowService on Polygon Amoy**
2. **UniversalEscrowService on Arbitrum Sepolia**
3. **EscrowSwapComposer on all networks**

## Deployment Steps

### Step 1: Deploy UniversalEscrowService on Missing Networks

```bash
# Deploy on Polygon Amoy
npx hardhat run scripts/deployUniversalEscrow.js --network polygon-amoy

# Deploy on Arbitrum Sepolia  
npx hardhat run scripts/deployUniversalEscrow.js --network arbitrum-sepolia
```

### Step 2: Configure OFT Adapters in Escrow Services

After deployment, configure the OFT adapters:

```javascript
// On Polygon Amoy
const escrow = await ethers.getContractAt("UniversalEscrowService", ESCROW_ADDRESS);
await escrow.setOFTAdapter(40161, "0x90653738e66A0fa93BF20b087e6A39A704FA39e1", "Sepolia");
await escrow.setOFTAdapter(40231, "0x5661438B6C23dDFdC718591c3A85FeE1433Dab36", "Arbitrum");

// On Arbitrum Sepolia
const escrow = await ethers.getContractAt("UniversalEscrowService", ESCROW_ADDRESS);
await escrow.setOFTAdapter(40161, "0x90653738e66A0fa93BF20b087e6A39A704FA39e1", "Sepolia");
await escrow.setOFTAdapter(40267, "0x12a9d0C6D06fEA1A584e98cd86aDC9EFdD7887df", "Polygon");
```

### Step 3: Deploy EscrowSwapComposers

**Important**: Yes, we need to deploy on ALL networks including Sepolia because:
- Each network can be a destination for cross-chain transfers
- Sepolia needs a composer for when it receives tokens from Polygon/Arbitrum
- The composer handles auto-swapping WETH to desired tokens on arrival

```bash
# Option 1: Use the batch script
cd src/contract
./scripts/deployAllComposers.sh

# Option 2: Deploy individually
npx hardhat run scripts/deployEscrowComposer.js --network sepolia
npx hardhat run scripts/deployEscrowComposer.js --network polygon-amoy
npx hardhat run scripts/deployEscrowComposer.js --network arbitrum-sepolia
```

### Step 4: Manual Composer Configuration (if needed)

If escrow services weren't deployed when composers were deployed:

```javascript
// On Sepolia (already has escrow)
const escrow = await ethers.getContractAt("UniversalEscrowService", "0x335Bb94C802E224Bc3D7afE9d65902df9984ed08");
await escrow.setSwapComposer(40267, POLYGON_COMPOSER_ADDRESS);
await escrow.setSwapComposer(40231, ARBITRUM_COMPOSER_ADDRESS);

// On Polygon (after escrow deployment)
const escrow = await ethers.getContractAt("UniversalEscrowService", POLYGON_ESCROW_ADDRESS);
await escrow.setSwapComposer(40161, SEPOLIA_COMPOSER_ADDRESS);
await escrow.setSwapComposer(40231, ARBITRUM_COMPOSER_ADDRESS);

// On Arbitrum (after escrow deployment)
const escrow = await ethers.getContractAt("UniversalEscrowService", ARBITRUM_ESCROW_ADDRESS);
await escrow.setSwapComposer(40161, SEPOLIA_COMPOSER_ADDRESS);
await escrow.setSwapComposer(40267, POLYGON_COMPOSER_ADDRESS);
```

## Testing Plan

### Test 1: Basic Functionality Test
```bash
# Run the standard test first
npx hardhat run scripts/testUniversalEscrowComplete.js --network sepolia
```

### Test 2: Enhanced Compose Test
```bash
# Run the enhanced test with compose scenarios
npx hardhat run scripts/testUniversalEscrowEnhanced.js --network sepolia
```

### Test 3: Cross-Network Testing
Test from each network to verify bi-directional transfers:

```bash
# From Polygon to Sepolia
npx hardhat run scripts/testUniversalEscrowEnhanced.js --network polygon-amoy

# From Arbitrum to Sepolia
npx hardhat run scripts/testUniversalEscrowEnhanced.js --network arbitrum-sepolia
```

### Test 4: Monitor Destination Chains

1. **Watch for Compose Events**:
```javascript
// Monitor on destination chain
const composer = await ethers.getContractAt("EscrowSwapComposer", COMPOSER_ADDRESS);
composer.on("SwapExecuted", (recipient, tokenIn, tokenOut, amountIn, amountOut, router) => {
    console.log(`✅ Auto-swap executed!`);
    console.log(`Recipient: ${recipient}`);
    console.log(`${ethers.formatEther(amountIn)} WETH → ${ethers.formatUnits(amountOut, 6)} USDC`);
});
```

2. **Verify Final Balances**:
```javascript
// Check seller received correct token
const token = await ethers.getContractAt("IERC20", TARGET_TOKEN);
const balance = await token.balanceOf(SELLER_ADDRESS);
console.log(`Seller balance: ${ethers.formatUnits(balance, decimals)}`);
```

## Verification Checklist

### Pre-flight Checks:
- [ ] All escrow services deployed
- [ ] All composers deployed
- [ ] OFT adapters configured in escrows
- [ ] Composers configured in escrows
- [ ] OFT adapters authorized in composers
- [ ] Uniswap routers available on each chain

### Post-deployment Verification:
- [ ] Composer addresses saved in deployments
- [ ] Cross-chain transfers show `withCompose: true`
- [ ] SwapExecuted events fire on destination
- [ ] Sellers receive correct tokens (not WETH)
- [ ] Gas consumption is reasonable
- [ ] Fallback to WETH works if swap fails

## Gas Estimates

### Without Compose:
- Source: ~300-400k gas
- Destination: Manual swap needed

### With Compose:
- Source: ~400-500k gas (includes compose gas)
- Destination: Automatic (no user action)

## Troubleshooting

### Issue: "No composer configured"
- Solution: Deploy composer on destination chain
- Manually set with `escrow.setSwapComposer(chainId, composerAddress)`

### Issue: "Unauthorized caller"  
- Solution: Authorize OFT adapter in composer
- `composer.setAuthorizedCaller(oftAdapter, true)`

### Issue: "Swap failed"
- Check Uniswap router configuration
- Verify token liquidity
- Adjust slippage settings

### Issue: High gas costs
- Optimize gas limits: `escrow.setGasLimits(receiveGas, composeGas)`
- Consider batching transfers
- Monitor network congestion

## Production Readiness

Before mainnet:
1. Audit all contracts
2. Test with mainnet fork
3. Verify slippage settings
4. Document gas costs
5. Set up monitoring
6. Create user guides
7. Implement emergency pause
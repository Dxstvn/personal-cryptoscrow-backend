# Stargate Testnet Workarounds & Alternative Approaches

## 🔍 Research Summary

Based on thorough analysis of the codebase and documentation, here are the identified workarounds and alternative approaches for dealing with the broken Stargate testnet quote function.

## 1. **Hardcoded Fee Approach** ✅

### Implementation
The `debugStargateAlternatives.js` script already suggests using hardcoded fees:

```javascript
// Common hardcoded values for testnets
const hardcodedFees = {
  'sepolia-arbitrum': hre.ethers.parseEther('0.002'),
  'arbitrum-sepolia': hre.ethers.parseEther('0.001')
};
```

### Contract Modification
You could modify the contract to accept a manual fee override:

```solidity
// Add to contract
mapping(uint256 => uint256) public hardcodedStargateFees;

function setHardcodedFee(uint256 targetChainId, uint256 fee) external onlyOwner {
    hardcodedStargateFees[targetChainId] = fee;
}

// In getStargateQuote, add fallback:
if (fee == 0 && hardcodedStargateFees[targetChainId] > 0) {
    fee = hardcodedStargateFees[targetChainId];
}
```

## 2. **LayerZero OFT Fallback** ✅

The contract already supports this fallback mechanism:

```solidity
if (mode == CrossChainMode.STARGATE) {
    _handleStargateRelease(escrowId, escrow);
} else if (mode == CrossChainMode.LAYERZERO_OFT) {
    // Fallback to existing LayerZero implementation
    _handleCrossChainRelease(escrowId, escrow, targetEndpointId);
}
```

### To Use:
1. Set cross-chain mode to `LAYERZERO_OFT` for problematic chains
2. Ensure OFT adapters are deployed and configured

## 3. **Mock Endpoint Quoter** ✅

The codebase includes `mockEndpointQuoter.js` which provides realistic fee estimates:

```javascript
// Use the mock quoter for testing
import mockQuoter from '../services/mockEndpointQuoter.js';

const quote = mockQuoter.getStaticQuote(
    sourceChainId, 
    destChainId, 
    amount
);
// Returns: { nativeFee: '0.001500', recommended: '0.004500' }
```

## 4. **Mainnet Fork Testing** 🔧

Add to `hardhat.config.js`:

```javascript
hardhat: {
  forking: {
    url: process.env.MAINNET_RPC_URL,
    blockNumber: 19000000 // Fixed block for consistent testing
  }
},
"mainnet-fork": {
  url: "http://127.0.0.1:8545",
  accounts: process.env.MAINNET_PRIVATE_KEY !== undefined
    ? [process.env.MAINNET_PRIVATE_KEY]
    : [],
}
```

Then test with mainnet Stargate contracts which should have working quote functions.

## 5. **Direct Pool Interaction** 🔧

From `debugStargateAlternatives.js`, we found pool addresses:

```javascript
const stargatePoolAddresses = {
  11155111: { // Sepolia
    native: '0x9Cc7e185162Aa5D1425ee924D97a87A0a34A0706',
    usdc: '0x4985b8fcEA3659FD801a5b857dA1D00e985863F0'
  },
  421614: { // Arbitrum Sepolia
    native: '0x6fddB6270F6c71f31B62AE0260cfa8E2e2d186E0',
    usdc: '0x543BdA7c6cA4384FE90B1F5929bb851F52888983'
  }
};
```

You could potentially interact with pools directly for testing.

## 6. **Gas Estimation Based Testing** 💡

Create a testing script that:
1. Estimates gas for the swap transaction
2. Adds a buffer (e.g., 50%)
3. Uses that as the fee

```javascript
// Estimate gas for the actual swap
const estimatedGas = await routerETH.estimateGas.swapETH(
    stargateChainId,
    payable(refundAddress),
    toAddress,
    amount,
    minAmount,
    { value: amount + estimatedFee }
);

const gasPrice = await provider.getGasPrice();
const estimatedFee = estimatedGas * gasPrice * 150n / 100n; // 50% buffer
```

## 7. **Environment-Based Configuration** ✅

Implement environment-specific behavior:

```javascript
const IS_TESTNET = [11155111, 421614, 80002].includes(chainId);

if (IS_TESTNET && STARGATE_TESTNET_BROKEN) {
    // Use hardcoded fees or LayerZero fallback
    return hardcodedFees[route] || parseEther('0.002');
} else {
    // Use actual quote function
    return await getStargateQuote(...);
}
```

## 8. **Testing Strategy Recommendations** 📋

### Immediate Testing (Without Quote Function):
1. **Use Hardcoded Fees**: Set reasonable fees based on historical data
2. **Focus on Same-Chain**: Test Uniswap integration thoroughly
3. **Use LayerZero OFT**: For cross-chain testing where available
4. **Mock the Quote**: Use the mock quoter for realistic estimates

### Production Preparation:
1. **Mainnet Fork Testing**: Test with real Stargate infrastructure
2. **Fee Monitoring**: Implement monitoring to track actual fees
3. **Dynamic Fallback**: Auto-switch between Stargate/LayerZero based on availability
4. **Error Handling**: Graceful degradation when quote fails

## 9. **Specific Code Changes** 🛠️

### Option A: Add Fee Override Parameter
```solidity
function releaseEscrow(bytes32 escrowId, uint256 manualFee) external payable {
    // Use manualFee if provided, otherwise try quote
}
```

### Option B: Environment Variable Control
```javascript
// In deployment script
const STARGATE_USE_HARDCODED_FEES = process.env.STARGATE_USE_HARDCODED_FEES === 'true';

if (STARGATE_USE_HARDCODED_FEES) {
    await contract.setHardcodedFee(targetChainId, parseEther('0.002'));
}
```

### Option C: Wrapper Contract
Create a wrapper that handles quote failures:
```solidity
contract StargateQuoteWrapper {
    function getQuoteWithFallback(uint16 chainId, uint256 amount) 
        external view returns (uint256) {
        try router.quoteLayerZeroFee(...) returns (uint256 fee, uint256) {
            return fee;
        } catch {
            return hardcodedFees[chainId];
        }
    }
}
```

## 10. **Testing Without Stargate** 🧪

Focus on what you CAN test:
1. **All same-chain functionality** (direct transfers, Uniswap swaps)
2. **Contract deployment and configuration**
3. **Fee calculation logic** (with mocked values)
4. **Error handling and edge cases**
5. **Service layer integration**
6. **Event emission and logging**

## 🎯 Recommended Approach

1. **Short Term**: Use hardcoded fees with environment variable control
2. **Testing**: Focus on same-chain and use LayerZero OFT for cross-chain
3. **Development**: Implement fee override mechanism in contract
4. **Production**: Ensure mainnet Stargate works before deployment

## 📝 Next Steps

1. Implement hardcoded fee mechanism in contract
2. Update test scripts to use fallback fees
3. Add environment variable for testnet workarounds
4. Document the temporary nature of these workarounds
5. Monitor Stargate testnet status for fixes

Remember: These are temporary workarounds. Always test thoroughly on mainnet fork or with small amounts on mainnet before full deployment.
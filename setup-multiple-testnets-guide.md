# Setting Up Multiple Virtual TestNets for Cross-Chain Testing

This guide will help you set up multiple Virtual TestNets across different networks so they appear in your Tenderly Dashboard, enabling comprehensive cross-chain testing and wallet visibility.

## Phase 1: Create Virtual TestNets via Dashboard

Since the Tenderly API requires specific authentication setup, the most reliable way to create multiple Virtual TestNets is through the Tenderly Dashboard.

### Step 1: Access Tenderly Dashboard

1. Go to [Tenderly Dashboard](https://dashboard.tenderly.co/)
2. Navigate to **Virtual TestNets** in the left sidebar
3. You should see your existing Virtual TestNet

### Step 2: Create Cross-Chain Virtual TestNets

Create the following Virtual TestNets one by one:

#### 1. Ethereum Mainnet Virtual TestNet
- Click **"Create Virtual TestNet"**
- **Parent Network**: Ethereum Mainnet
- **Name**: "Ethereum CrossChain TestNet"
- **Chain ID**: 73571 (custom)
- **Public Explorer**: Enabled
- **State Sync**: Disabled (for testing stability)

#### 2. Polygon Virtual TestNet
- **Parent Network**: Polygon
- **Name**: "Polygon CrossChain TestNet" 
- **Chain ID**: 73572 (custom)
- **Public Explorer**: Enabled
- **State Sync**: Disabled

#### 3. Arbitrum Virtual TestNet
- **Parent Network**: Arbitrum One
- **Name**: "Arbitrum CrossChain TestNet"
- **Chain ID**: 73573 (custom)
- **Public Explorer**: Enabled
- **State Sync**: Disabled

#### 4. Base Virtual TestNet
- **Parent Network**: Base Mainnet
- **Name**: "Base CrossChain TestNet"
- **Chain ID**: 73574 (custom)
- **Public Explorer**: Enabled
- **State Sync**: Disabled

#### 5. Optimism Virtual TestNet
- **Parent Network**: Optimism
- **Name**: "Optimism CrossChain TestNet"
- **Chain ID**: 73575 (custom)
- **Public Explorer**: Enabled
- **State Sync**: Disabled

## Phase 2: Document Your Virtual TestNets

After creating each Virtual TestNet, copy the following information and add it to your environment configuration:

1. **TestNet ID** (found in the URL)
2. **RPC URL** (Public HTTPS)
3. **Chain ID** (the custom one you set)
4. **Explorer URL**

## Phase 3: Automated Wallet Funding

Once you have created the Virtual TestNets through the Dashboard, use the automated scripts below to fund wallets across all networks.

### Environment Configuration

Create a `.env.testnets` file with your Virtual TestNet details:

```bash
# Tenderly Configuration
TENDERLY_ACCESS_KEY=gAMGpVldgYDEApaRb0PzF63OnwKRvhn
TENDERLY_ACCOUNT_SLUG=Dusss
TENDERLY_PROJECT_SLUG=project

# Virtual TestNet RPC URLs (replace with your actual URLs)
ETHEREUM_TESTNET_RPC=https://virtual.mainnet.rpc.tenderly.co/YOUR_ETHEREUM_TESTNET_ID
POLYGON_TESTNET_RPC=https://virtual.polygon.rpc.tenderly.co/YOUR_POLYGON_TESTNET_ID
ARBITRUM_TESTNET_RPC=https://virtual.arbitrum.rpc.tenderly.co/YOUR_ARBITRUM_TESTNET_ID
BASE_TESTNET_RPC=https://virtual.base.rpc.tenderly.co/YOUR_BASE_TESTNET_ID
OPTIMISM_TESTNET_RPC=https://virtual.optimism.rpc.tenderly.co/YOUR_OPTIMISM_TESTNET_ID

# Virtual TestNet IDs (copy from dashboard URLs)
ETHEREUM_TESTNET_ID=your_ethereum_testnet_id
POLYGON_TESTNET_ID=your_polygon_testnet_id
ARBITRUM_TESTNET_ID=your_arbitrum_testnet_id
BASE_TESTNET_ID=your_base_testnet_id
OPTIMISM_TESTNET_ID=your_optimism_testnet_id
```

## Benefits of This Approach

### 1. **Cross-Chain Wallet Visibility**
Once set up, your Tenderly Dashboard will show:
- Multiple networks with funded wallets
- Transaction history across different chains
- Cross-chain contract deployments
- Real-time monitoring of all networks

### 2. **Comprehensive Testing Environment**
- Test cross-chain transactions between networks
- Verify bridge functionality
- Monitor gas costs across chains
- Debug transactions on multiple networks

### 3. **Development Workflow Integration**
- Use different RPC URLs for different test scenarios
- Switch between networks easily in your application
- Maintain separate state for each chain
- Independent testing environments

## Phase 4: Verification

After setup, verify your configuration:

1. **Dashboard Check**: Visit your Tenderly Dashboard and confirm you see multiple Virtual TestNets
2. **RPC Connectivity**: Test each RPC URL to ensure connectivity
3. **Wallet Funding**: Confirm wallets are funded on each network
4. **Explorer Access**: Verify you can view transactions on each network's explorer

## Next Steps

1. **Integration Testing**: Use the funded wallets to test cross-chain functionality
2. **Contract Deployment**: Deploy contracts to each Virtual TestNet
3. **Transaction Monitoring**: Set up monitoring across all networks
4. **CI/CD Integration**: Include Virtual TestNet URLs in your test configuration

## Troubleshooting

### Common Issues:
- **404 Errors**: Usually indicates incorrect project/account slugs
- **Authentication Failures**: Check if access key is valid and has proper permissions
- **Rate Limiting**: Add delays between API calls
- **Network Connectivity**: Verify RPC URLs are accessible

### Solutions:
- Verify credentials in Tenderly Dashboard
- Check project permissions
- Use the Dashboard's built-in faucet as fallback
- Contact Tenderly support for account-specific issues

## Security Notes

- Never commit actual access keys to version control
- Use environment variables for all sensitive configuration
- Regularly rotate access keys
- Monitor usage through Tenderly Dashboard
- Use separate access keys for different environments (dev/staging/prod)

---

This approach provides a robust cross-chain testing environment with multiple Virtual TestNets visible in your Tenderly Dashboard, each with funded wallets ready for comprehensive testing scenarios. 
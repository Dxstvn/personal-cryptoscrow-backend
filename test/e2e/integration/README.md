# Real Cross-Chain Integration Test

This test performs a **real** cross-chain transaction using actual services without mocking.

## Prerequisites

### 1. Environment Variables Required

Create a `.env.testnets` file in the project root with these values:

```bash
# Tenderly Configuration (REQUIRED)
TENDERLY_PROJECT_SLUG=your-project-slug
TENDERLY_ACCESS_KEY=your-access-token  
TENDERLY_ACCOUNT_SLUG=your-account-slug
TENDERLY_ETHEREUM_MAINNET=https://virtual.mainnet.rpc.tenderly.co/your-virtual-testnet-id

# Test Wallet Configuration
TEST_WALLET_PRIVATE_KEY_EVM=your-ethereum-private-key
TEST_WALLET_PRIVATE_KEY_SOLANA=your-solana-private-key

# Backend Configuration
NODE_ENV=test
JWT_SECRET=test-jwt-secret-key
ENCRYPTION_KEY=test-encryption-key-32-chars-min
```

### 2. Setup Tenderly Account

1. Go to [Tenderly Dashboard](https://dashboard.tenderly.co/)
2. Create/access your project
3. Get your Access Key from Settings > Authorization
4. Create a Virtual TestNet (Ethereum Mainnet)
5. Copy the RPC URL

### 3. Generate Test Wallets

```bash
# Generate Ethereum wallet
node -e "console.log(require('ethers').Wallet.createRandom().mnemonic.phrase)"

# Generate Solana wallet (you can use existing tools or create a test keypair)
```

## What The Test Does

1. **Fund Solana Account on Tenderly**: Creates a fork and funds a Solana account
2. **Deploy EVM Contract**: Deploys our Universal Property Escrow contract on Tenderly
3. **Create Cross-Chain Deal**: Creates a real deal between Ethereum and Solana
4. **Fund Contract**: Funds the escrow contract with ETH
5. **Cross-Chain Transfer**: Initiates real transfer using LI.FI bridge services
6. **Verify Completion**: Confirms funds arrived at Solana address

## Running The Test

```bash
# Ensure backend is running
npm start

# Run the integration test
npm test test/e2e/integration/real-cross-chain-transaction.test.js
```

## Expected Output

The test will show real transaction hashes, bridge IDs, and Tenderly URLs where you can monitor the transactions.

**No mocking is used** - all errors are real integration issues that need to be fixed.

## Troubleshooting

### Missing Environment Variables
- Check that all required variables are set in `.env.testnets`
- Verify Tenderly credentials are correct

### Authentication Errors
- Ensure backend has proper Firebase setup
- Check JWT secrets are configured

### Bridge/Cross-Chain Errors  
- Verify LI.FI service is properly configured
- Check network connectivity
- Ensure sufficient funds in test wallets

### Contract Deployment Errors
- Verify Tenderly Virtual TestNet is active
- Check deployer wallet has funds
- Ensure contract compilation is successful

This test will reveal real integration issues without hiding them behind mocks. 
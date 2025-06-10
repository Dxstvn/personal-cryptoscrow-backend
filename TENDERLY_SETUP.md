# Tenderly Virtual TestNet Setup Guide

This guide explains how to set up Tenderly Virtual TestNets for cross-chain integration testing.

## Prerequisites

1. **Tenderly Account**: Sign up at [tenderly.co](https://tenderly.co)
2. **Tenderly Project**: Create a project in your Tenderly dashboard
3. **API Access Key**: Generate an access key for API access

## Getting Tenderly Credentials

### 1. Get Your Access Key

1. Go to [Tenderly Dashboard](https://dashboard.tenderly.co)
2. Navigate to **Account** → **Authorization**
3. Click **Generate New Token**
4. Copy the access key (it starts with a long string)

### 2. Get Account and Project Slugs

1. In your Tenderly dashboard, go to any project
2. Look at the URL: `https://dashboard.tenderly.co/{account-slug}/project/{project-slug}`
3. Extract the `account-slug` and `project-slug` from the URL

## Environment Variables

Set these environment variables for real Tenderly integration:

```bash
# Required for real Tenderly Virtual TestNet integration
export TENDERLY_ACCESS_KEY=your_access_key_here
export TENDERLY_ACCOUNT_SLUG=your_account_slug  
export TENDERLY_PROJECT_SLUG=your_project_slug

# Optional: Enable debug logging
export DEBUG_TESTS=true
```

## Testing Integration

### 1. Run Tests with Tenderly Integration

```bash
# Set environment variables
export TENDERLY_ACCESS_KEY=your_key
export TENDERLY_ACCOUNT_SLUG=your_account
export TENDERLY_PROJECT_SLUG=your_project

# Run the tests
npm test tests/integration/crossChainEscrow.test.js
```

### 2. What Happens During Tests

- **Real Virtual TestNets** are created using Tenderly REST API
- **Actual transactions** are sent to the Virtual TestNets
- **Explorer links** are printed to console for viewing transactions
- **Automatic cleanup** removes testnets after tests complete

### 3. View Transactions in Tenderly Dashboard

When tests run with real credentials:

1. Check console output for explorer URLs like:
   ```
   ✅ Transaction sent successfully: 0xabc123...
      View in explorer: https://dashboard.tenderly.co/explorer/vnet/12345/tx/0xabc123...
   ```

2. Click the explorer link to view the transaction in Tenderly dashboard

3. You can also see created Virtual TestNets in your Tenderly project

## Cost Considerations

### Free Features Used
- Virtual TestNet creation
- Basic transaction sending
- Public explorer
- Unlimited faucet

### Paid Features (Disabled by Default)
- **State Sync**: Disabled in tests to avoid charges
- **Advanced monitoring**: Not used in basic tests

## Troubleshooting

### No Transactions Visible
- Ensure `TENDERLY_ACCESS_KEY` is set correctly
- Check that account/project slugs match your Tenderly project
- Look for error messages in test output

### API Rate Limits
- Tenderly has rate limits on API calls
- Tests automatically handle cleanup to minimize API usage
- If you hit limits, wait a few minutes before re-running

### Permission Errors
- Ensure your access key has project permissions
- Check that the project exists in your account

## Mock Mode (No Credentials)

If you don't set Tenderly credentials, tests will run in mock mode:
- No real Virtual TestNets are created
- Transactions are simulated locally
- No charges or API usage
- Useful for basic functionality testing

## Example Test Output

With real Tenderly integration:

```
🧪 Enhanced Cross-Chain Integration Tests Starting...
🔧 Tenderly Config: { accountSlug: 'your-account', projectSlug: 'your-project', accessKey: '***1234' }
🚀 Creating Virtual TestNet: Test-ethereum-1640995200000
✅ Virtual TestNet created successfully:
   ID: 12345-abcd-6789-efgh
   Chain ID: 73571
   Admin RPC: https://virtual.mainnet.rpc.tenderly.co/12345-abcd-6789-efgh
   Explorer: https://dashboard.tenderly.co/explorer/vnet/12345-abcd-6789-efgh
💰 Funding account 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 with 1000000000000000000 wei
✅ Account funded successfully
🔄 Sending real transaction on ethereum: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -> 0x742d35Cc6634C0532925a3b8D51d9bb98A42b4B2
✅ Transaction sent successfully: 0xabc123def456...
   View in explorer: https://dashboard.tenderly.co/explorer/vnet/12345-abcd-6789-efgh/tx/0xabc123def456...
```

Click the explorer link to see your transaction in the Tenderly dashboard! 
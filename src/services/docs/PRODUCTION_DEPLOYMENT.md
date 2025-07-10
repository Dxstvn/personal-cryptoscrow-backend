# Production Deployment Guide for EscrowServiceV3

This guide covers the complete deployment and configuration process for EscrowServiceV3 in production.

## Prerequisites

1. **Environment Variables**
   ```bash
   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
   ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
   POLYGON_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
   BACKEND_WALLET_PRIVATE_KEY=0x...
   ```

2. **Contract Ownership**
   - You must be the owner of the deployed OFT adapters
   - Have sufficient ETH on each chain for configuration transactions

## Step 1: Deploy Contracts

If not already deployed, deploy the UniversalEscrowServiceV3 and OFT adapters:

```bash
cd src/contract
npx hardhat deploy --network sepolia
npx hardhat deploy --network arbitrum-sepolia
npx hardhat deploy --network polygon-amoy
```

## Step 2: Configure OFT Adapters

### 2.1 Set Peers

Run the configuration script to set up peer relationships:

```bash
# Dry run first to see what will be configured
node src/services/scripts/configureOFTForProduction.js all --dry-run

# Apply configuration
node src/services/scripts/configureOFTForProduction.js all
```

This will:
- Set peer addresses on each OFT adapter
- Configure delegates for endpoint management
- Verify the configuration

### 2.2 Manual Peer Configuration (if needed)

If you need to manually configure peers:

```javascript
// Example for Sepolia OFT adapter
const oftAdapter = await ethers.getContractAt("PropertyOFTAdapter", SEPOLIA_OFT_ADDRESS);

// Set Polygon Amoy as peer
await oftAdapter.setPeer(
  40267, // Polygon Amoy endpoint ID
  "0x000000000000000000000000746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725" // Polygon OFT address as bytes32
);

// Set Arbitrum Sepolia as peer
await oftAdapter.setPeer(
  40231, // Arbitrum Sepolia endpoint ID
  "0x000000000000000000000000baa46938E3110187ED6a55EE139312b28c943d00" // Arbitrum OFT address as bytes32
);
```

## Step 3: Configure LayerZero Endpoints

### 3.1 Set Delegates

Each OFT adapter needs a delegate to manage endpoint configuration:

```javascript
await oftAdapter.setDelegate(ownerAddress);
```

### 3.2 Configure DVN (Decentralized Verifier Network)

Contact LayerZero support or use their configuration UI to:
- Set up required DVNs for each chain pair
- Configure executor settings
- Set gas limits for cross-chain calls

## Step 4: Verify Configuration

Run the production readiness checker:

```bash
node src/services/scripts/checkProductionReadiness.js
```

Expected output:
```
✅ Environment Configuration - PASS
✅ Network Connectivity - PASS
✅ Smart Contracts - PASS
✅ OFT Adapter Peers - PASS
✅ Cross-Chain Functionality - PASS
✅ Token Support - PASS
✅ Gas Estimation - PASS

✅ System is ready for production!
```

## Step 5: Integration Testing

Run the full test suite:

```bash
# Unit tests
npm test -- escrowServiceV3.test.js

# Integration tests
npm test -- escrowServiceV3.integration.test.js

# Cross-chain e2e tests
npm run test:cross-chain:all
```

## Step 6: Monitoring Setup

1. **LayerZero Scan**: Monitor cross-chain messages at https://layerzeroscan.com
2. **Contract Events**: Set up event listeners for escrow operations
3. **Error Tracking**: Implement error reporting for failed transactions

## Troubleshooting

### NoPeer Error
```
Error: NoPeer(40267)
```
**Solution**: Run `configureOFTForProduction.js` to set peers

### Endpoint Configuration Error
```
Error: 0x41705130
```
**Solution**: Ensure delegates are set and DVN is configured

### Insufficient Gas
```
Error: Insufficient gas for cross-chain execution
```
**Solution**: Increase gas limits in extraOptions or contact LayerZero support

## Production Checklist

- [ ] All environment variables configured
- [ ] Contracts deployed on all chains
- [ ] OFT adapter peers configured
- [ ] Delegates set for endpoint management
- [ ] DVN configuration complete
- [ ] Cross-chain quotes working
- [ ] Integration tests passing
- [ ] Monitoring setup complete
- [ ] Error handling tested
- [ ] Documentation updated

## Security Considerations

1. **Private Key Management**: Use hardware wallets or KMS for production keys
2. **Access Control**: Implement proper role-based access
3. **Rate Limiting**: Add rate limits to prevent abuse
4. **Monitoring**: Set up alerts for unusual activity
5. **Upgrades**: Plan for contract upgrades if needed

## Maintenance

Regular maintenance tasks:
- Monitor gas prices and adjust fee estimates
- Update LayerZero endpoint configurations as needed
- Review and update peer configurations for new chains
- Monitor contract events and user transactions
- Keep dependencies updated

## Support

For issues:
1. Check LayerZero documentation: https://docs.layerzero.network
2. Review contract logs and events
3. Contact LayerZero support for endpoint issues
4. File issues in the project repository
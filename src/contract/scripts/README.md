# Contract Scripts Organization

## Active Contracts
- **UniversalEscrowService.sol** - Main escrow contract with 2% fee, cross-chain support
- **SimplePropertyOFTAdapter.sol** - LayerZero V2 OFT adapter for WETH bridging
- **EscrowSwapComposer.sol** - Handles token swaps on destination chains

## Script Categories

### deployment-scripts/
- `deployUniversalEscrow.js` - Deploy the main escrow contract
- `deploySimplePropertyOFTAdapters.js` - Deploy OFT adapters for cross-chain
- `deployEscrowComposer.js` - Deploy swap composers
- `deployCompleteInfrastructure.js` - Deploy everything at once

### test-scripts/
- `testSimpleEscrow.js` - Basic same-chain escrow test
- `testCrossChainSimple.js` - Simple cross-chain transfer test
- `testUniversalEscrowEnhanced.js` - Comprehensive test suite
- Other test variations for different scenarios

### utility-scripts/
- Configuration scripts (configure*.js)
- Check/debug scripts (check*.js, debug*.js)
- Update scripts (update*.js)
- Fix scripts (fix*.js)

## Quick Start

1. Deploy infrastructure:
```bash
npx hardhat run deployment-scripts/deployCompleteInfrastructure.js --network sepolia
```

2. Run tests:
```bash
npx hardhat run test-scripts/testSimpleEscrow.js --network sepolia
npx hardhat run test-scripts/testCrossChainSimple.js --network sepolia
```

3. Check configuration:
```bash
npx hardhat run utility-scripts/checkDeployerBalances.js --network sepolia
npx hardhat run utility-scripts/checkOFTAdapterConfig.js --network sepolia
```

## Current Deployment Addresses

### Sepolia
- Escrow: 0x2ee79369D7cCb53550F1Ca61A1a3bf60B3C92f1E
- OFT Adapter: 0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4
- Composer: 0x3e6d2247055683d53a16Fc935E24D30065a6DB05

### Polygon Amoy
- Escrow: 0x53E4b9A8f7b1185768cef74d9564cbeD052a9682
- OFT Adapter: 0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725
- Composer: 0xeE455345205F0Ab563f67307bF37E618180da05c

### Arbitrum Sepolia
- Escrow: 0xd3b5A13C113328C4F4F1AbF646a2be2AaC8815B5
- OFT Adapter: 0xbaa46938E3110187ED6a55EE139312b28c943d00
- Composer: 0x8f65178A3281d72E1F50FA9E01D8B3884229ddC8
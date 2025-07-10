#!/usr/bin/env node
/**
 * Configure cross-chain settings for fixed escrow
 */
const hre = require('hardhat');
const chalk = require('chalk');

const CONFIG = {
  sepolia: {
    escrow: '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd',
    endpointId: 40161,
    chainId: 11155111
  },
  arbitrum: {
    escrow: '0x51383412506994Bc8C0cA59CD9D6be0167996E5D',
    endpointId: 40231,
    chainId: 421614
  }
};

async function configureOnChain(network, remoteNetwork) {
  console.log(chalk.blue(`\n📍 Configuring on ${network}...`));
  
  const [deployer] = await hre.ethers.getSigners();
  const config = CONFIG[network];
  const remoteConfig = CONFIG[remoteNetwork];
  
  const escrowAbi = [
    'function setOFTAdapter(uint32 endpointId, address adapter, string memory chainName)',
    'function setChainMapping(uint256 chainId, uint32 endpointId)',
    'function oftAdapters(uint32) view returns (address)',
    'function chainIdToEndpointId(uint256) view returns (uint32)'
  ];
  
  const escrow = new hre.ethers.Contract(config.escrow, escrowAbi, deployer);
  
  // Set OFT adapter for current chain (source)
  const sourceOftAdapter = network === 'sepolia' 
    ? '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE'  // Sepolia OFT
    : '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B'; // Arbitrum OFT
  
  console.log(`Setting source OFT adapter for ${network}: ${sourceOftAdapter}`);
  await escrow.setOFTAdapter(config.endpointId, sourceOftAdapter, network);
  
  // Also set the remote chain OFT adapter
  const remoteOftAdapter = remoteNetwork === 'arbitrum' 
    ? '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B'  // Arbitrum OFT
    : '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE'; // Sepolia OFT
  
  console.log(`Setting remote OFT adapter for ${remoteNetwork}: ${remoteOftAdapter}`);
  await escrow.setOFTAdapter(remoteConfig.endpointId, remoteOftAdapter, remoteNetwork);
  
  // Set chain mapping for remote chain
  console.log(`Setting chain mapping: ${remoteConfig.chainId} -> ${remoteConfig.endpointId}`);
  await escrow.setChainMapping(remoteConfig.chainId, remoteConfig.endpointId);
  
  // Verify configuration
  const storedAdapter = await escrow.oftAdapters(remoteConfig.endpointId);
  const storedEndpoint = await escrow.chainIdToEndpointId(remoteConfig.chainId);
  
  console.log(chalk.green('✅ Configuration verified:'));
  console.log(`├─ OFT Adapter: ${storedAdapter}`);
  console.log(`└─ Endpoint ID: ${storedEndpoint}`);
}

async function main() {
  console.log(chalk.blue('🔧 Configuring Fixed Escrow Cross-Chain'));
  console.log(chalk.blue('====================================='));
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  if (chainId === 11155111) {
    // On Sepolia, configure for Arbitrum
    await configureOnChain('sepolia', 'arbitrum');
  } else if (chainId === 421614) {
    // On Arbitrum, configure for Sepolia
    await configureOnChain('arbitrum', 'sepolia');
  } else {
    console.log(chalk.red('Unsupported network'));
    return;
  }
  
  console.log(chalk.green('\n✅ Configuration complete!'));
  console.log(chalk.yellow('\n⚠️  Next: Run this script on the other network'));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
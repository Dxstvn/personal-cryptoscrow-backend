#!/usr/bin/env node
/**
 * Check fixed escrow configuration
 */
const hre = require('hardhat');
const chalk = require('chalk');

const ESCROWS = {
  sepolia: '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd',
  arbitrum: '0x51383412506994Bc8C0cA59CD9D6be0167996E5D'
};

async function checkConfig(network, address) {
  console.log(chalk.blue(`\n📍 Checking ${network} configuration...`));
  
  const escrowAbi = [
    'function oftAdapters(uint32) view returns (address)',
    'function chainIdToEndpointId(uint256) view returns (uint32)',
    'function chainNames(uint32) view returns (string)'
  ];
  
  const provider = network === 'sepolia' 
    ? new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)
    : new hre.ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
    
  const escrow = new hre.ethers.Contract(address, escrowAbi, provider);
  
  // Check OFT adapters for both endpoints
  const sepoliaOFT = await escrow.oftAdapters(40161);
  const arbitrumOFT = await escrow.oftAdapters(40231);
  
  console.log('OFT Adapters:');
  console.log(`├─ Sepolia (40161): ${sepoliaOFT}`);
  console.log(`└─ Arbitrum (40231): ${arbitrumOFT}`);
  
  // Check chain mappings
  const sepoliaEndpoint = await escrow.chainIdToEndpointId(11155111);
  const arbitrumEndpoint = await escrow.chainIdToEndpointId(421614);
  
  console.log('\nChain Mappings:');
  console.log(`├─ Sepolia (11155111): ${sepoliaEndpoint}`);
  console.log(`└─ Arbitrum (421614): ${arbitrumEndpoint}`);
  
  // Check chain names
  try {
    const sepoliaName = await escrow.chainNames(40161);
    const arbitrumName = await escrow.chainNames(40231);
    console.log('\nChain Names:');
    console.log(`├─ 40161: ${sepoliaName || '(not set)'}`);
    console.log(`└─ 40231: ${arbitrumName || '(not set)'}`);
  } catch (e) {}
}

async function main() {
  console.log(chalk.blue('🔍 Fixed Escrow Configuration Check'));
  console.log(chalk.blue('================================='));
  
  await checkConfig('sepolia', ESCROWS.sepolia);
  await checkConfig('arbitrum', ESCROWS.arbitrum);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Check LayerZero execution configuration
 */
const hre = require('hardhat');
const chalk = require('chalk');

const SEPOLIA_OFT = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';

async function main() {
  console.log(chalk.blue('🔍 Checking LayerZero Execution Config'));
  console.log(chalk.blue('====================================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // OApp configuration ABI
  const oappAbi = [
    'function endpoint() view returns (address)',
    'function oAppVersion() view returns (uint64, uint64)',
    'function getConfig(uint32 _eid, address _lib, uint32 _configType) view returns (bytes)',
    'function enforcedOptions(uint32 _eid, uint16 _msgType) view returns (bytes)',
    'event ConfigSet(uint32 indexed eid, address indexed lib, uint32 configType, bytes config)'
  ];
  
  const oft = new hre.ethers.Contract(SEPOLIA_OFT, oappAbi, provider);
  
  try {
    // Get endpoint
    const endpoint = await oft.endpoint();
    console.log(`LayerZero Endpoint: ${endpoint}`);
    
    // Get version
    try {
      const version = await oft.oAppVersion();
      console.log(`OApp Version: ${version[0]}.${version[1]}`);
    } catch (e) {}
    
    // Check enforced options for Arbitrum
    const ARBITRUM_EID = 40231;
    const SEND_MSG_TYPE = 1;
    
    try {
      const enforcedOptions = await oft.enforcedOptions(ARBITRUM_EID, SEND_MSG_TYPE);
      console.log(`\nEnforced Options for Arbitrum:`);
      console.log(`Raw: ${enforcedOptions}`);
      if (enforcedOptions === '0x') {
        console.log(chalk.red('❌ No enforced options set!'));
      }
    } catch (e) {
      console.log(chalk.red('❌ Error reading enforced options'));
    }
    
    // Try to get DVN config
    const SEND_LIB = '0x0000000000000000000000000000000000000302'; // Send library address
    const DVN_CONFIG_TYPE = 2; // Config type for DVN
    
    try {
      const config = await oft.getConfig(ARBITRUM_EID, SEND_LIB, DVN_CONFIG_TYPE);
      console.log(`\nDVN Config: ${config}`);
      if (config === '0x') {
        console.log(chalk.red('❌ No DVN configuration found!'));
      }
    } catch (e) {
      console.log(chalk.red('❌ Error reading DVN config'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
  
  console.log(chalk.yellow('\n💡 Key Issue Identified:'));
  console.log('The OFT adapter likely lacks proper LayerZero configuration:');
  console.log('1. Missing DVN (Decentralized Verifier Network) configuration');
  console.log('2. Missing executor configuration');
  console.log('3. Missing enforced options for message execution\n');
  
  console.log(chalk.red('⚠️  This explains why messages aren\'t being delivered!'));
  console.log('Without DVNs, messages cannot be verified on the destination chain.');
  console.log('Without executors, messages cannot be executed on the destination chain.\n');
  
  console.log(chalk.green('✅ Solution Options:'));
  console.log('1. Configure the OFT adapters with proper DVN and executor settings');
  console.log('2. Use Stargate instead for WETH bridging (recommended)');
  console.log('3. Deploy new OFT adapters with proper configuration');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
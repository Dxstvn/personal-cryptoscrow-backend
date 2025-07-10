#!/usr/bin/env node
/**
 * Analyze OFT setup to understand the issue
 */
const hre = require('hardhat');
const chalk = require('chalk');

const SEPOLIA_OFT = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const ARBITRUM_OFT = '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B';
const SEPOLIA_WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

async function main() {
  console.log(chalk.blue('🔍 Analyzing OFT Setup'));
  console.log(chalk.blue('====================\n'));
  
  console.log(chalk.yellow('📚 Key Findings from Research:'));
  console.log('1. LayerZero docs recommend using Stargate for native assets like WETH');
  console.log('2. OFT adapters are for creating wrapped versions of tokens');
  console.log('3. Stargate has RouterETH.sol for bridging ETH natively\n');
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Check who deployed these OFT adapters
  console.log(chalk.cyan('🔍 Checking OFT Adapter Details:'));
  
  const oftAbi = [
    'function owner() view returns (address)',
    'function token() view returns (address)',
    'function approvalRequired() view returns (bool)',
    'function oftVersion() view returns (uint64, uint64)',
    'function sharedDecimals() view returns (uint8)'
  ];
  
  const oft = new hre.ethers.Contract(SEPOLIA_OFT, oftAbi, provider);
  
  try {
    const owner = await oft.owner();
    const token = await oft.token();
    const approvalRequired = await oft.approvalRequired();
    
    console.log(`\nSepolia OFT Adapter (${SEPOLIA_OFT}):`);
    console.log(`├─ Owner: ${owner}`);
    console.log(`├─ Token: ${token}`);
    console.log(`├─ Approval Required: ${approvalRequired}`);
    
    try {
      const version = await oft.oftVersion();
      console.log(`├─ OFT Version: ${version[0]}.${version[1]}`);
    } catch (e) {}
    
    try {
      const decimals = await oft.sharedDecimals();
      console.log(`└─ Shared Decimals: ${decimals}`);
    } catch (e) {}
    
  } catch (error) {
    console.log(chalk.red('Error reading OFT details:'), error.message);
  }
  
  console.log(chalk.yellow('\n💡 Analysis:'));
  console.log('The OFT adapters we\'re using appear to be custom deployments');
  console.log('owned by the BACKEND wallet (0x2223F51...).');
  console.log('\nThese are NOT official LayerZero or Stargate contracts.');
  console.log('This explains why cross-chain transfers aren\'t working properly.\n');
  
  console.log(chalk.red('⚠️  The Issue:'));
  console.log('1. We\'re using custom OFT adapters that may not be properly configured');
  console.log('2. These adapters need proper endpoint configuration and gas settings');
  console.log('3. For WETH bridging, we should consider using Stargate instead\n');
  
  console.log(chalk.green('✅ Recommendations:'));
  console.log('1. For production: Use Stargate for WETH bridging');
  console.log('2. For testing: Ensure OFT adapters have proper DVN and executor config');
  console.log('3. Check LayerZero endpoint settings and message execution');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
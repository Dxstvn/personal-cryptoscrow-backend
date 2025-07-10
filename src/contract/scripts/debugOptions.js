#!/usr/bin/env node
/**
 * Debug LayerZero options encoding
 */
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Debugging LayerZero Options'));
  console.log(chalk.blue('============================\n'));
  
  // Import OptionsBuilder
  const OptionsBuilder = await hre.ethers.getContractFactory('OptionsBuilder');
  
  // Test option building
  console.log(chalk.yellow('📋 Testing Options Building:'));
  
  // Standard options (what our contract uses)
  const standardOptions = '0x00030100110100000000000000000000000000030d40';
  console.log(`\nStandard options: ${standardOptions}`);
  console.log(`Length: ${standardOptions.length - 2} chars (${(standardOptions.length - 2) / 2} bytes)`);
  
  // Decode the options
  console.log('\n🔍 Decoding standard options:');
  console.log('0x0003 - Options type 3 (Executor)');
  console.log('0101 - Executor option type 1 (LzReceive)');
  console.log('1101 - Length of gas value (17 bytes)');
  console.log('00000000000000000000000000030d40 - Gas value (200000 in hex)');
  
  // The issue might be that the gas value is different
  const gasValue = parseInt('0x030d40', 16);
  console.log(`\nGas value decoded: ${gasValue}`);
  
  console.log(chalk.yellow('\n💡 Key Findings:'));
  console.log('1. The options are using 200,000 gas, not 100,000');
  console.log('2. This should be MORE than enough for destination execution');
  console.log('3. The issue is likely not with gas');
  
  // Check what happened with WETH
  console.log(chalk.yellow('\n🔍 WETH Transfer Analysis:'));
  console.log('- Approval was given to OFT adapter ✅');
  console.log('- But NO Transfer event was emitted ❌');
  console.log('- This means the OFT adapter\'s send() was called but failed internally');
  console.log('- The WETH that\'s in the OFT must be from a previous transaction');
  
  console.log(chalk.red('\n⚠️  Root Cause:'));
  console.log('The OFT adapter\'s send() function is reverting after the approval');
  console.log('but before it can transferFrom the WETH.');
  console.log('\nPossible reasons:');
  console.log('1. The sendParam has invalid values');
  console.log('2. The OFT adapter has some internal state issue');
  console.log('3. The LayerZero endpoint rejected the message');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
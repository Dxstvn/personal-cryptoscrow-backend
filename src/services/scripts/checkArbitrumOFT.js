#!/usr/bin/env node
/**
 * Check Arbitrum OFT configuration
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const ARBITRUM_ESCROW = '0x9749E4049F2cD6Df742E177ba1DeeAbA758eC686';
const ARBITRUM_OFT_CANDIDATES = [
  '0xf9a8e4b09b0dE88239e9159F81D0305D8Da4e505', // Production deployment
  '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B', // Standard deployment
  '0x5da4745a766D5EAbD30fFBDc32b3b953d399DD1F'  // From config
];

async function main() {
  console.log(chalk.blue('🔍 Checking Arbitrum OFT Configuration'));
  console.log(chalk.blue('=====================================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  
  // Check OFT adapters
  console.log(chalk.cyan('Checking Arbitrum OFT adapter candidates...'));
  let validOFT = null;
  
  for (const addr of ARBITRUM_OFT_CANDIDATES) {
    const code = await provider.getCode(addr);
    console.log(`├─ ${addr}: ${code !== '0x' ? '✅ Deployed' : '❌ Not deployed'}`);
    if (code !== '0x' && !validOFT) {
      validOFT = addr;
    }
  }
  
  if (!validOFT) {
    console.log(chalk.red('\n❌ No valid OFT adapter found on Arbitrum!'));
    return;
  }
  
  console.log(chalk.green(`\n✅ Valid OFT adapter found: ${validOFT}`));
  
  // Check escrow configuration
  const escrowAbi = [
    'function oftAdapters(uint32) view returns (address)'
  ];
  
  const escrow = new ethers.Contract(ARBITRUM_ESCROW, escrowAbi, provider);
  
  try {
    const currentOFT = await escrow.oftAdapters(40231); // Arbitrum endpoint ID
    console.log(`\nCurrent OFT adapter in escrow: ${currentOFT}`);
    
    if (currentOFT.toLowerCase() === validOFT.toLowerCase()) {
      console.log(chalk.green('✅ OFT adapter correctly configured'));
    } else if (currentOFT === '0x0000000000000000000000000000000000000000') {
      console.log(chalk.yellow('⚠️  OFT adapter not set'));
    } else {
      console.log(chalk.red('❌ OFT adapter mismatch'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
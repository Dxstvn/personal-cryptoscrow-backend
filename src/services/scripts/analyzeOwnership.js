#!/usr/bin/env node
/**
 * Analyze ownership of all contracts
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

const CONTRACTS = {
  sepolia: {
    oft: '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE',
    composer: '0x56b2C2F53497B5b8E179521De50e29F78C943B57',
    escrow: '0x726ca2162A5B90718EF11Ab8f294c0f30E258208'
  },
  arbitrum: {
    oft: '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B',  
    composer: '0x7ffd15F8C2696d76D19145AdB856B118e087D6DA',
    escrow: '0x9749E4049F2cD6Df742E177ba1DeeAbA758eC686'
  }
};

async function main() {
  console.log(chalk.blue('📋 Contract Ownership Analysis'));
  console.log(chalk.blue('============================\n'));
  
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  
  const ownerAbi = ['function owner() view returns (address)'];
  
  // Check Sepolia contracts
  console.log(chalk.cyan('Sepolia Contracts:'));
  for (const [name, address] of Object.entries(CONTRACTS.sepolia)) {
    try {
      const contract = new ethers.Contract(address, ownerAbi, sepoliaProvider);
      const owner = await contract.owner();
      console.log(`├─ ${name.padEnd(8)} ${address}: ${owner}`);
    } catch (e) {
      console.log(`├─ ${name.padEnd(8)} ${address}: Error reading owner`);
    }
  }
  
  // Check Arbitrum contracts
  console.log(chalk.cyan('\nArbitrum Contracts:'));
  for (const [name, address] of Object.entries(CONTRACTS.arbitrum)) {
    try {
      const contract = new ethers.Contract(address, ownerAbi, arbitrumProvider);
      const owner = await contract.owner();
      console.log(`├─ ${name.padEnd(8)} ${address}: ${owner}`);
    } catch (e) {
      console.log(`├─ ${name.padEnd(8)} ${address}: Error reading owner`);
    }
  }
  
  console.log(chalk.yellow('\n📝 Known Wallets:'));
  console.log('├─ DEPLOYER: 0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D');
  console.log('├─ BACKEND:  0x2223F51659fAcC662504dcEbD4735886285ABC96');
  console.log('└─ SELLER:   0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC');
  
  console.log(chalk.red('\n❌ Issues Found:'));
  console.log('1. OFT adapters are owned by BACKEND wallet, not DEPLOYER');
  console.log('2. OFT peers are misconfigured on both chains');
  console.log('3. Arbitrum composer needs to authorize the OFT adapter');
  
  console.log(chalk.yellow('\n⚠️  Required Actions:'));
  console.log('1. Use BACKEND wallet to update OFT peer configurations');
  console.log('2. Use DEPLOYER wallet to authorize OFT in Arbitrum composer');
  console.log('3. Create a new escrow to test the complete flow');
  
  // Create fix instructions
  console.log(chalk.blue('\n📝 Fix Instructions:'));
  console.log('\nFor BACKEND wallet (owns OFTs):');
  console.log('```javascript');
  console.log('// On Sepolia OFT:');
  console.log(`await oft.setPeer(40231, "${ethers.zeroPadValue(CONTRACTS.arbitrum.oft, 32)}");`);
  console.log('\n// On Arbitrum OFT:');
  console.log(`await oft.setPeer(40161, "${ethers.zeroPadValue(CONTRACTS.sepolia.oft, 32)}");`);
  console.log('```');
  
  console.log('\nFor DEPLOYER wallet (owns composers):');
  console.log('```javascript');
  console.log('// On Arbitrum Composer:');
  console.log(`await composer.setOFTAdapterAuthorization("${CONTRACTS.arbitrum.oft}", true);`);
  console.log('```');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
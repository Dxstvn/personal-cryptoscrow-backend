#!/usr/bin/env node
/**
 * Monitor OFT Authorization Status
 * Check if the current OFT owner has authorized your contract
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const OFT_ADAPTERS = {
  sepolia: {
    address: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4',
    chain: 'Sepolia',
    rpcUrl: process.env.SEPOLIA_RPC_URL
  },
  arbitrumSepolia: {
    address: '0xbaa46938E3110187ED6a55EE139312b28c943d00',
    chain: 'Arbitrum Sepolia',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL
  }
};

async function checkAuthorization() {
  console.log(chalk.blue('🔍 Monitoring OFT Authorization Status'));
  console.log(chalk.blue('====================================='));
  console.log(`Your Escrow Contract: ${chalk.yellow(YOUR_ESCROW_CONTRACT)}`);
  
  const abi = [
    'function authorizedReleaseCallers(address) view returns (bool)',
    'function owner() view returns (address)'
  ];
  
  let allAuthorized = true;
  
  for (const [key, config] of Object.entries(OFT_ADAPTERS)) {
    console.log(chalk.cyan(`\n📍 ${config.chain} OFT Adapter`));
    console.log(`Address: ${config.address}`);
    
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const oft = new ethers.Contract(config.address, abi, provider);
      
      const owner = await oft.owner();
      const isAuthorized = await oft.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
      
      console.log(`Owner: ${owner}`);
      console.log(`Status: ${isAuthorized ? chalk.green('✅ AUTHORIZED') : chalk.red('❌ NOT AUTHORIZED')}`);
      
      if (!isAuthorized) {
        allAuthorized = false;
      }
    } catch (error) {
      console.log(chalk.red(`Error checking ${config.chain}:`, error.message));
      allAuthorized = false;
    }
  }
  
  console.log(chalk.cyan('\n📊 Summary:'));
  if (allAuthorized) {
    console.log(chalk.green('🎉 Your contract is authorized on ALL OFT adapters!'));
    console.log(chalk.green('You can now run cross-chain tests:'));
    console.log(chalk.yellow('npm run verify:crosschain:yours'));
  } else {
    console.log(chalk.yellow('⏳ Waiting for authorization from OFT owner...'));
    console.log('\nThe OFT owner needs to execute:');
    console.log(chalk.gray(`setAuthorizedReleaseCaller('${YOUR_ESCROW_CONTRACT}', true)`));
    console.log('\nRun this script again to check status.');
  }
  
  return allAuthorized;
}

// Auto-refresh mode
async function monitor() {
  const args = process.argv.slice(2);
  const autoRefresh = args.includes('--watch') || args.includes('-w');
  
  if (autoRefresh) {
    console.log(chalk.yellow('\n👁️  Monitoring mode - checking every 30 seconds...'));
    console.log(chalk.gray('Press Ctrl+C to stop'));
    
    while (true) {
      const authorized = await checkAuthorization();
      if (authorized) {
        console.log(chalk.green('\n✅ Authorization complete! You can now run tests.'));
        break;
      }
      console.log(chalk.gray('\nChecking again in 30 seconds...'));
      await new Promise(resolve => setTimeout(resolve, 30000));
      console.clear();
    }
  } else {
    await checkAuthorization();
    console.log(chalk.gray('\nTip: Use --watch flag to monitor continuously'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  monitor().catch(console.error);
}
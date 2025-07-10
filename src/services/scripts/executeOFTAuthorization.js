#!/usr/bin/env node
/**
 * Execute OFT Authorization as the OFT Adapter Owner
 * This script authorizes your escrow contract on the OFT adapters
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Contract addresses
const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const OFT_ADAPTERS = {
  sepolia: {
    address: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4',
    chain: 'Sepolia',
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    explorer: 'https://sepolia.etherscan.io'
  },
  arbitrumSepolia: {
    address: '0xbaa46938E3110187ED6a55EE139312b28c943d00',
    chain: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    explorer: 'https://sepolia.arbiscan.io'
  }
};

async function executeAuthorization() {
  console.log(chalk.blue('🔐 Executing OFT Authorization'));
  console.log(chalk.blue('=============================='));
  
  // Check for OFT owner private key (using DEPLOYER_PRIVATE_KEY)
  const OFT_OWNER_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.OFT_OWNER_PRIVATE_KEY;
  
  if (!OFT_OWNER_KEY) {
    console.log(chalk.red('❌ DEPLOYER_PRIVATE_KEY not found in .env'));
    console.log(chalk.yellow('\nPlease add to your .env file:'));
    console.log(chalk.gray('DEPLOYER_PRIVATE_KEY=<private key for 0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D>'));
    process.exit(1);
  }
  
  const ownerWallet = new ethers.Wallet(OFT_OWNER_KEY);
  console.log(`OFT Owner Wallet: ${ownerWallet.address}`);
  
  // Verify this is the correct owner
  if (ownerWallet.address.toLowerCase() !== '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D'.toLowerCase()) {
    console.log(chalk.red('❌ Wrong wallet! This is not the OFT owner wallet.'));
    console.log(`Expected: 0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D`);
    console.log(`Got: ${ownerWallet.address}`);
    process.exit(1);
  }
  
  console.log(chalk.green('✅ Confirmed: This is the OFT owner wallet'));
  console.log(`\nAuthorizing escrow contract: ${chalk.yellow(YOUR_ESCROW_CONTRACT)}`);
  
  const abi = [
    'function setAuthorizedReleaseCaller(address caller, bool authorized)',
    'function authorizedReleaseCallers(address) view returns (bool)',
    'function owner() view returns (address)'
  ];
  
  const results = {
    sepolia: false,
    arbitrumSepolia: false
  };
  
  // Process each chain
  for (const [key, config] of Object.entries(OFT_ADAPTERS)) {
    console.log(chalk.cyan(`\n📍 Processing ${config.chain}...`));
    
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const signer = ownerWallet.connect(provider);
      const oftAdapter = new ethers.Contract(config.address, abi, signer);
      
      // Check current status
      console.log('   Checking current status...');
      const owner = await oftAdapter.owner();
      const isAlreadyAuthorized = await oftAdapter.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
      
      console.log(`   OFT Owner: ${owner}`);
      console.log(`   Current Authorization: ${isAlreadyAuthorized ? chalk.green('✅ Already Authorized') : chalk.yellow('❌ Not Authorized')}`);
      
      if (isAlreadyAuthorized) {
        console.log(chalk.green(`   ✅ ${config.chain} already authorized!`));
        results[key] = true;
        continue;
      }
      
      // Check wallet balance
      const balance = await provider.getBalance(ownerWallet.address);
      console.log(`   Wallet Balance: ${ethers.formatEther(balance)} ETH`);
      
      if (balance === 0n) {
        console.log(chalk.red(`   ❌ No ETH balance on ${config.chain}!`));
        console.log(chalk.yellow(`   Please fund the OFT owner wallet on ${config.chain}`));
        continue;
      }
      
      // Execute authorization
      console.log(chalk.yellow(`   🔄 Authorizing escrow contract...`));
      const tx = await oftAdapter.setAuthorizedReleaseCaller(YOUR_ESCROW_CONTRACT, true);
      
      console.log(`   TX Hash: ${tx.hash}`);
      console.log(`   Explorer: ${config.explorer}/tx/${tx.hash}`);
      console.log('   ⏳ Waiting for confirmation...');
      
      const receipt = await tx.wait();
      console.log(chalk.green(`   ✅ Authorization complete! (Block: ${receipt.blockNumber})`));
      
      // Verify authorization
      const nowAuthorized = await oftAdapter.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
      if (nowAuthorized) {
        console.log(chalk.green(`   ✅ Verified: Contract is now authorized on ${config.chain}`));
        results[key] = true;
      } else {
        console.log(chalk.red(`   ❌ Warning: Authorization may have failed on ${config.chain}`));
      }
      
    } catch (error) {
      console.log(chalk.red(`   ❌ Error on ${config.chain}:`), error.message);
      
      if (error.message.includes('insufficient funds')) {
        console.log(chalk.yellow(`   💰 Please fund the OFT owner wallet on ${config.chain}`));
        console.log(`   Address: ${ownerWallet.address}`);
      }
    }
  }
  
  // Summary
  console.log(chalk.cyan('\n📊 Authorization Summary:'));
  console.log(`Sepolia: ${results.sepolia ? chalk.green('✅ Authorized') : chalk.red('❌ Not Authorized')}`);
  console.log(`Arbitrum Sepolia: ${results.arbitrumSepolia ? chalk.green('✅ Authorized') : chalk.red('❌ Not Authorized')}`);
  
  if (results.sepolia && results.arbitrumSepolia) {
    console.log(chalk.green('\n🎉 SUCCESS! Your escrow contract is now authorized on both chains!'));
    console.log(chalk.green('You can now run cross-chain tests:'));
    console.log(chalk.yellow('\nnpm run verify:crosschain:yours'));
  } else {
    console.log(chalk.yellow('\n⚠️  Authorization incomplete. Please:'));
    if (!results.sepolia) {
      console.log(`1. Fund the OFT owner wallet on Sepolia`);
    }
    if (!results.arbitrumSepolia) {
      console.log(`2. Fund the OFT owner wallet on Arbitrum Sepolia`);
    }
    console.log(`3. Run this script again`);
  }
}

async function main() {
  console.log(chalk.blue('🚀 OFT Authorization Executor'));
  console.log(chalk.gray('This will authorize your escrow contract on the OFT adapters'));
  
  try {
    await executeAuthorization();
  } catch (error) {
    console.log(chalk.red('\n❌ Authorization failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
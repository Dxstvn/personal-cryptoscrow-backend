#!/usr/bin/env node
/**
 * Check Arbitrum balance and provide funding instructions
 */

import { ethers, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

async function checkBalance() {
  console.log(chalk.blue('💰 Checking Arbitrum Sepolia Balance'));
  console.log(chalk.blue('===================================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  const balance = await provider.getBalance(wallet.address);
  
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Balance: ${formatEther(balance)} ETH`);
  
  if (balance < ethers.parseEther('0.05')) {
    console.log(chalk.yellow('\n⚠️  Insufficient balance for deployment!'));
    console.log('\nYou need at least 0.05 ETH on Arbitrum Sepolia.');
    console.log('\n📝 How to get Arbitrum Sepolia ETH:');
    console.log('1. Bridge from Sepolia: https://bridge.arbitrum.io/');
    console.log('2. Faucet: https://www.alchemy.com/faucets/arbitrum-sepolia');
    console.log('3. Send some ETH to your wallet on Arbitrum Sepolia');
    console.log(`   Your address: ${wallet.address}`);
  } else {
    console.log(chalk.green('\n✅ Sufficient balance for deployment!'));
  }
  
  // Also check Sepolia
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const sepoliaBalance = await sepoliaProvider.getBalance(wallet.address);
  console.log(`\nSepolia Balance: ${formatEther(sepoliaBalance)} ETH`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkBalance().catch(console.error);
}
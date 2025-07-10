#!/usr/bin/env node
/**
 * Test same-chain escrow operations without OFT authorization
 * This allows testing all escrow features except cross-chain transfers
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { EscrowServiceV3 } from '../escrowServiceV3.js';

dotenv.config();

const YOUR_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const SEPOLIA_CHAIN_ID = 11155111;

async function testSameChain() {
  console.log(chalk.blue('🧪 Same-Chain Escrow Testing'));
  console.log(chalk.blue('============================'));
  console.log(chalk.yellow('\nThis script tests escrow operations on Sepolia only.'));
  console.log(chalk.yellow('No cross-chain transfers will be attempted.\n'));
  
  try {
    // Initialize service
    const service = new EscrowServiceV3();
    await service.initialize();
    
    // Get wallet
    const wallet = await service.getWallet(SEPOLIA_CHAIN_ID);
    console.log(`Testing wallet: ${wallet.address}`);
    
    // Get contract instance
    const contract = await service.getContract(SEPOLIA_CHAIN_ID);
    console.log(`Escrow contract: ${YOUR_CONTRACT}`);
    
    // Example test transaction data
    const testTx = {
      transactionId: `test-same-chain-${Date.now()}`,
      sender: wallet.address,
      receiver: '0x0000000000000000000000000000000000000001', // Test receiver
      tokenAddress: ethers.ZeroAddress, // ETH
      amount: ethers.parseEther('0.001'), // 0.001 ETH
      sourceChainId: SEPOLIA_CHAIN_ID,
      destChainId: SEPOLIA_CHAIN_ID, // Same chain!
      hashlock: ethers.keccak256(ethers.toUtf8Bytes('test-secret')),
      timelock: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      conditionType: 0, // Standard hashlock
      conditionData: '0x'
    };
    
    console.log(chalk.cyan('\n📝 Test Transaction Details:'));
    console.log(`Transaction ID: ${testTx.transactionId}`);
    console.log(`Amount: ${ethers.formatEther(testTx.amount)} ETH`);
    console.log(`Source Chain: Sepolia (${testTx.sourceChainId})`);
    console.log(`Destination Chain: Sepolia (${testTx.destChainId})`);
    console.log(chalk.green('✅ Same-chain transaction - No OFT authorization needed!'));
    
    console.log(chalk.cyan('\n🚀 To create this transaction:'));
    console.log('1. Use the EscrowServiceV3.createTransaction() method');
    console.log('2. Make sure sender and receiver chains are the same');
    console.log('3. The contract will handle it as a regular escrow without bridging');
    
    console.log(chalk.cyan('\n📋 Example code:'));
    console.log(chalk.gray(`
const service = new EscrowServiceV3();
await service.initialize();

const result = await service.createTransaction({
  transactionId: '${testTx.transactionId}',
  sender: '${testTx.sender}',
  receiver: '${testTx.receiver}',
  tokenAddress: '${testTx.tokenAddress}',
  amount: '${testTx.amount.toString()}',
  sourceChainId: ${testTx.sourceChainId},
  destChainId: ${testTx.destChainId},
  hashlock: '${testTx.hashlock}',
  timelock: ${testTx.timelock},
  conditionType: ${testTx.conditionType},
  conditionData: '${testTx.conditionData}'
});
    `));
    
    console.log(chalk.cyan('\n💡 Testing Tips:'));
    console.log('1. Start with small amounts (0.001 ETH or less)');
    console.log('2. Use short timelocks for quick testing (1 hour)');
    console.log('3. Keep track of your test secrets for releasing funds');
    console.log('4. Monitor transactions on Sepolia Etherscan');
    
    // Check contract balance
    const balance = await wallet.provider.getBalance(YOUR_CONTRACT);
    console.log(chalk.cyan('\n💰 Contract Status:'));
    console.log(`Contract balance: ${ethers.formatEther(balance)} ETH`);
    
    // Check if we're a condition updater
    try {
      const isUpdater = await contract.conditionUpdaters(wallet.address);
      console.log(`You are a condition updater: ${isUpdater ? '✅' : '❌'}`);
      
      if (!isUpdater) {
        console.log(chalk.yellow('\n⚠️  Note: You\'re not a condition updater.'));
        console.log('You can still create and release transactions you\'re involved in.');
      }
    } catch (error) {
      console.log('Unable to check condition updater status');
    }
    
  } catch (error) {
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  testSameChain().catch(console.error);
}
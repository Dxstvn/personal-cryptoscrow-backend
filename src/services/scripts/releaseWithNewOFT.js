#!/usr/bin/env node
/**
 * Release escrow using your new OFT adapters
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x2528c9dd1924d8850968d4b1c83d884754d891180c7f5cdbdc64cff9df35c6fd'; // Latest escrow

async function releaseEscrow() {
  console.log(chalk.blue('🚀 Releasing Escrow with YOUR OFT Adapters'));
  console.log(chalk.blue('=========================================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'function oftAdapters(uint32) view returns (address)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Check escrow state
    console.log(chalk.cyan('1. Checking Escrow State:'));
    const escrowData = await escrow.escrows(ESCROW_ID);
    
    console.log(`Seller: ${escrowData.seller}`);
    console.log(`Amount: ${formatEther(escrowData.depositAmount)} ETH`);
    console.log(`Released: ${escrowData.released ? '✅' : '❌'}`);
    console.log(`Condition Met: ${escrowData.conditionMet ? '✅' : '❌'}`);
    
    if (escrowData.released) {
      console.log(chalk.yellow('\n⚠️  This escrow has already been released!'));
      return;
    }
    
    // Check OFT configuration
    console.log(chalk.cyan('\n2. Checking OFT Configuration:'));
    const sepoliaOFT = await escrow.oftAdapters(40161);
    const arbitrumOFT = await escrow.oftAdapters(40231);
    
    console.log(`Sepolia OFT: ${sepoliaOFT}`);
    console.log(`Arbitrum OFT: ${arbitrumOFT}`);
    
    // Try to release with different gas amounts
    console.log(chalk.cyan('\n3. Attempting Release:'));
    
    const fees = [
      { amount: '0.005', description: 'Standard fee' },
      { amount: '0.01', description: 'Higher fee' },
      { amount: '0.02', description: 'Maximum fee' }
    ];
    
    for (const fee of fees) {
      try {
        console.log(`\nTrying with ${fee.amount} ETH (${fee.description})...`);
        
        // First do a static call
        await escrow.releaseEscrow.staticCall(ESCROW_ID, {
          value: parseEther(fee.amount),
          gasLimit: 1000000
        });
        
        console.log('✅ Static call succeeded!');
        
        // Execute the actual transaction
        const tx = await escrow.releaseEscrow(ESCROW_ID, {
          value: parseEther(fee.amount),
          gasLimit: 1000000
        });
        
        console.log(`TX: https://sepolia.etherscan.io/tx/${tx.hash}`);
        console.log('⏳ Waiting for confirmation...');
        
        const receipt = await tx.wait();
        console.log(chalk.green('✅ Transaction confirmed!'));
        
        // Check for events
        console.log('\nTransaction Events:');
        for (const log of receipt.logs) {
          console.log(`- Event at ${log.address}`);
        }
        
        console.log(chalk.green('\n🎉 ESCROW RELEASED SUCCESSFULLY!'));
        console.log('The cross-chain transfer is now in progress.');
        console.log('Check the seller\'s WETH balance on Arbitrum in 3-5 minutes.');
        
        return;
      } catch (error) {
        console.log(`❌ Failed with ${fee.amount} ETH:`, error.message.substring(0, 100));
      }
    }
    
    // If all attempts failed, check what might be wrong
    console.log(chalk.red('\n❌ All release attempts failed'));
    console.log('\nPossible issues:');
    console.log('1. The escrow contract might not have enough ETH');
    console.log('2. There might be an issue with WETH approval');
    console.log('3. The OFT adapter configuration might be incomplete');
    
    // Check contract balance
    const contractBalance = await provider.getBalance(YOUR_ESCROW_CONTRACT);
    console.log(`\nContract ETH balance: ${formatEther(contractBalance)} ETH`);
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  releaseEscrow().catch(console.error);
}
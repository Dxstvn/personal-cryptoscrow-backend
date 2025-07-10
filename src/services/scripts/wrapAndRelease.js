#!/usr/bin/env node
/**
 * Wrap ETH to WETH and then release
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';
const WETH_SEPOLIA = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

async function wrapAndRelease() {
  console.log(chalk.blue('🔄 ETH to WETH Wrap and Release'));
  console.log(chalk.blue('================================'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  // Check if the contract has a wrap function or if we need to handle it differently
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function releaseEscrow(bytes32 escrowId) payable returns (bytes32 guid)',
    'function oftAdapters(uint32) view returns (address)',
    'function owner() view returns (address)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Get escrow details
    const escrowData = await escrow.escrows(ESCROW_ID);
    console.log('Escrow Details:');
    console.log(`Amount: ${formatEther(escrowData.depositAmount)} ETH`);
    console.log(`Target Token: ${escrowData.targetToken} (WETH on Arbitrum)`);
    
    // Check contract ETH balance
    const contractBalance = await provider.getBalance(YOUR_ESCROW_CONTRACT);
    console.log(`\nContract ETH Balance: ${formatEther(contractBalance)} ETH`);
    
    // The issue is that the contract has ETH but needs to convert it to WETH
    // The OFT adapter should handle this conversion
    
    // Check OFT adapter
    const oftAdapter = await escrow.oftAdapters(40231); // Arbitrum endpoint
    console.log(`\nOFT Adapter: ${oftAdapter}`);
    
    // Let's try the release with proper gas and value
    console.log(chalk.cyan('\n🚀 Attempting Release with Higher Gas:'));
    
    try {
      // First try a static call to see if it works
      console.log('Testing with static call...');
      const result = await escrow.releaseEscrow.staticCall(ESCROW_ID, {
        value: parseEther('0.005'), // Higher fee
        gasLimit: 1000000 // Higher gas limit
      });
      console.log('✅ Static call succeeded!');
      console.log('Expected GUID:', result);
      
      // Now do the actual transaction
      console.log('\nExecuting actual transaction...');
      const tx = await escrow.releaseEscrow(ESCROW_ID, {
        value: parseEther('0.005'),
        gasLimit: 1000000
      });
      
      console.log(`TX Hash: ${tx.hash}`);
      console.log(`Explorer: https://sepolia.etherscan.io/tx/${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(chalk.green('✅ Transaction confirmed!'));
      
      // Parse events
      console.log('\nTransaction Events:');
      for (const log of receipt.logs) {
        console.log(`Event at ${log.address}`);
      }
      
    } catch (error) {
      console.log('❌ Release failed:', error.message);
      
      // If it's failing, let's check what the OFT adapter expects
      console.log(chalk.cyan('\n🔍 Checking OFT Adapter Requirements:'));
      
      const oftAbi = [
        'function authorizedReleaseCallers(address) view returns (bool)',
        'function convertAndSend(address,uint256,uint256,(uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address,address) payable returns (address,uint256)'
      ];
      
      const oft = new ethers.Contract(oftAdapter, oftAbi, provider);
      const isAuth = await oft.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
      console.log(`Contract authorized on OFT: ${isAuth ? '✅' : '❌'}`);
      
      if (!isAuth) {
        console.log(chalk.red('\n❌ The escrow contract is not authorized on the OFT adapter!'));
        console.log('This is why the release is failing.');
        console.log('The OFT adapter needs to authorize your contract.');
      }
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  wrapAndRelease().catch(console.error);
}
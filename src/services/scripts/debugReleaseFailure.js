#!/usr/bin/env node
/**
 * Debug why the release is failing
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';

async function debug() {
  console.log(chalk.blue('🔍 Debugging Release Failure'));
  console.log(chalk.blue('==========================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  // Full ABI for debugging
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'function serviceWallet() view returns (address)',
    'function oftAdapters(uint32) view returns (address)',
    'function weth() view returns (address)',
    'function owner() view returns (address)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Check escrow data
    console.log(chalk.cyan('1. Escrow Data:'));
    const data = await escrow.escrows(ESCROW_ID);
    console.log(`Buyer: ${data.buyer}`);
    console.log(`Seller: ${data.seller}`);
    console.log(`Released: ${data.released ? '✅' : '❌'}`);
    console.log(`Condition Met: ${data.conditionMet ? '✅' : '❌'}`);
    console.log(`Target Chain: ${data.targetChainId}`);
    
    // Check service wallet
    console.log(chalk.cyan('\n2. Service Configuration:'));
    const serviceWallet = await escrow.serviceWallet();
    console.log(`Service Wallet: ${serviceWallet}`);
    console.log(`Your Wallet: ${wallet.address}`);
    console.log(`Match: ${serviceWallet.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
    
    // Check WETH
    console.log(chalk.cyan('\n3. WETH Configuration:'));
    const weth = await escrow.weth();
    console.log(`WETH Address: ${weth}`);
    
    // Check OFT
    console.log(chalk.cyan('\n4. OFT Configuration:'));
    const oftArbitrum = await escrow.oftAdapters(40231); // Arbitrum endpoint
    console.log(`Arbitrum OFT: ${oftArbitrum}`);
    console.log(`Is set: ${oftArbitrum !== ethers.ZeroAddress ? '✅' : '❌'}`);
    
    // Try static call to see revert reason
    console.log(chalk.cyan('\n5. Simulating Release:'));
    try {
      await escrow.releaseEscrow.staticCall(ESCROW_ID, {
        value: ethers.parseEther('0.003')
      });
      console.log('✅ Static call succeeded');
    } catch (error) {
      console.log('❌ Static call failed:', error.message);
      if (error.data) {
        console.log('Error data:', error.data);
      }
    }
    
    // Check WETH balance
    console.log(chalk.cyan('\n6. Checking WETH Balance:'));
    const wethContract = new ethers.Contract(weth, ['function balanceOf(address) view returns (uint256)'], provider);
    const escrowWethBalance = await wethContract.balanceOf(YOUR_ESCROW_CONTRACT);
    console.log(`Escrow WETH Balance: ${ethers.formatEther(escrowWethBalance)}`);
    
    // Check if escrow has ETH
    const escrowEthBalance = await provider.getBalance(YOUR_ESCROW_CONTRACT);
    console.log(`Escrow ETH Balance: ${ethers.formatEther(escrowEthBalance)}`);
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  debug().catch(console.error);
}
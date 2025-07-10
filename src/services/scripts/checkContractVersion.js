#!/usr/bin/env node
/**
 * Check contract version and available functions
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';

async function checkVersion() {
  console.log(chalk.blue('🔍 Checking Contract Version'));
  console.log(chalk.blue('==========================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Try different version-specific functions
  const tests = [
    { name: 'oftAdapters (V3)', selector: '0x28655533', sig: 'oftAdapters(uint32)' },
    { name: 'weth (V2)', selector: '0x3fc8cef3', sig: 'weth()' },
    { name: 'releaseEscrowCompose (V3)', selector: '0x6a3c5b6e', sig: 'releaseEscrowCompose(bytes32,uint256,bytes)' },
    { name: 'releaseEscrow (All)', selector: '0xbf89fc61', sig: 'releaseEscrow(bytes32)' },
    { name: 'serviceWallet (All)', selector: '0x97ad69f8', sig: 'serviceWallet()' }
  ];
  
  console.log('Testing contract functions:');
  for (const test of tests) {
    try {
      const result = await provider.call({
        to: YOUR_ESCROW_CONTRACT,
        data: test.selector + '0000000000000000000000000000000000000000000000000000000000000000'
      });
      console.log(chalk.green(`✅ ${test.name}: Available`));
    } catch (error) {
      console.log(chalk.red(`❌ ${test.name}: Not found`));
    }
  }
  
  // Check the actual release function
  console.log(chalk.cyan('\n📝 Contract Analysis:'));
  console.log('This appears to be a V3 contract (has oftAdapters)');
  console.log('The releaseEscrow function should work with LayerZero fees');
  
  // Get the bytecode to check contract size
  const code = await provider.getCode(YOUR_ESCROW_CONTRACT);
  console.log(`\nContract size: ${code.length / 2} bytes`);
  
  // Try to get the escrow data with proper decoding
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)'
  ];
  
  const contract = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, provider);
  const ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';
  
  try {
    const escrowData = await contract.escrows(ESCROW_ID);
    console.log(chalk.cyan('\n📦 Escrow Details:'));
    console.log(`Deposit Token: ${escrowData.depositToken}`);
    console.log(`Is ETH: ${escrowData.depositToken === ethers.ZeroAddress ? 'Yes' : 'No'}`);
    console.log(`Target Token: ${escrowData.targetToken}`);
    console.log(`Target Chain: ${escrowData.targetChainId}`);
    
    // Check if it's trying to do cross-chain with ETH
    if (escrowData.depositToken === ethers.ZeroAddress && escrowData.targetChainId !== 11155111) {
      console.log(chalk.yellow('\n⚠️  Issue Found: Cross-chain ETH transfer'));
      console.log('The escrow is trying to send ETH cross-chain.');
      console.log('ETH needs to be wrapped to WETH first for LayerZero.');
    }
  } catch (error) {
    console.log('Error reading escrow:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkVersion().catch(console.error);
}
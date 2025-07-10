#!/usr/bin/env node
/**
 * Find the correct release function
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';

async function findRelease() {
  console.log(chalk.blue('🔍 Finding Release Function'));
  console.log(chalk.blue('=========================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Common function selectors for release functions
  const releaseFunctions = [
    { selector: '0xbf89fc61', name: 'releaseEscrow(bytes32)', params: '3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a' },
    { selector: '0x6a3c5b6e', name: 'releaseEscrowCompose(bytes32,uint256,bytes)', params: '3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a0000000000000000000000000000000000000000000000000000000000000000' },
    { selector: '0x7c93dcb1', name: 'releaseEscrowCrossChain(bytes32)', params: '3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a' },
    { selector: '0xf3fef3a3', name: 'withdraw(address,uint256)', params: '0000000000000000000000002223f51659facc662504dcebd4735886285abc960000000000000000000000000000000000000000000000000000000000000000' }
  ];
  
  console.log('Testing release functions:');
  for (const func of releaseFunctions) {
    try {
      const result = await provider.call({
        to: YOUR_ESCROW_CONTRACT,
        data: func.selector + func.params,
        value: ethers.parseEther('0.003')
      });
      console.log(chalk.green(`✅ ${func.name}: Success (${result})`));
    } catch (error) {
      const reason = error.message.match(/reason="([^"]+)"/) || ['', 'Unknown'];
      console.log(chalk.red(`❌ ${func.name}: ${reason[1]}`));
    }
  }
  
  // Try to decode the contract bytecode for function signatures
  console.log(chalk.cyan('\n📝 Checking Contract Interface:'));
  
  // Get the contract code
  const code = await provider.getCode(YOUR_ESCROW_CONTRACT);
  
  // Look for function signatures in the bytecode
  const signatures = [
    '70a08231', // balanceOf
    'a9059cbb', // transfer
    '23b872dd', // transferFrom
    'bf89fc61', // releaseEscrow
    '6a3c5b6e', // releaseEscrowCompose
    '28655533', // oftAdapters
    '97ad69f8', // serviceWallet
    '8da5cb5b', // owner
  ];
  
  console.log('Found function signatures:');
  for (const sig of signatures) {
    if (code.includes(sig)) {
      console.log(`✅ ${sig}`);
    }
  }
  
  // Try the V3 ABI
  console.log(chalk.cyan('\n🔧 Testing with V3 ABI:'));
  
  const v3Abi = [
    'function releaseEscrow(bytes32 escrowId) external payable',
    'function escrows(bytes32) view returns (tuple(address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId))',
    'function serviceWallet() view returns (address)'
  ];
  
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(YOUR_ESCROW_CONTRACT, v3Abi, wallet);
  
  try {
    // Check service wallet
    const serviceWallet = await contract.serviceWallet();
    console.log(`Service Wallet: ${serviceWallet}`);
    console.log(`Your Wallet: ${wallet.address}`);
    console.log(`Match: ${serviceWallet.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
  } catch (error) {
    console.log('Error checking service wallet:', error.message);
  }
  
  // Final check - is this even the right escrow ID?
  console.log(chalk.cyan('\n🔍 Verifying Escrow ID:'));
  console.log(`Using Escrow ID: ${ESCROW_ID}`);
  console.log('This should match the escrow created in your test');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  findRelease().catch(console.error);
}
#!/usr/bin/env node
/**
 * Check if escrow was already released
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';

async function checkStatus() {
  console.log(chalk.blue('📊 Checking All Escrows'));
  console.log(chalk.blue('======================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Check recent events
  const filter = {
    address: YOUR_ESCROW_CONTRACT,
    fromBlock: 8702000, // Recent blocks
    toBlock: 'latest'
  };
  
  const logs = await provider.getLogs(filter);
  console.log(`Found ${logs.length} events`);
  
  // Event signatures
  const eventSigs = {
    EscrowCreated: '0x2c7c89bbaa5e7fd866b1b0c6e8c6e3e2f38c3dc37f7a9e0b5c4c8f0a3f8c4d5b',
    EscrowReleased: '0x5a5c5e4e7b1e7c5f3d6e8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c'
  };
  
  // Parse the interface to get proper event signatures
  const iface = new ethers.Interface([
    'event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address finalToken, uint256 finalAmount, string method, bool withCompose)',
    'event ConditionUpdated(bytes32 indexed escrowId, bool conditionMet)'
  ]);
  
  console.log(chalk.cyan('\nRecent Events:'));
  for (const log of logs.slice(-10)) { // Last 10 events
    try {
      const parsed = iface.parseLog(log);
      if (parsed) {
        console.log(`\n${chalk.green(parsed.name)}:`);
        if (parsed.name === 'EscrowCreated') {
          console.log(`  Escrow ID: ${parsed.args.escrowId}`);
          console.log(`  Amount: ${ethers.formatEther(parsed.args.amount)} ETH`);
        } else if (parsed.name === 'EscrowReleased') {
          console.log(`  Escrow ID: ${parsed.args.escrowId}`);
          console.log(`  Amount: ${ethers.formatEther(parsed.args.finalAmount)}`);
          console.log(`  Method: ${parsed.args.method}`);
        } else if (parsed.name === 'ConditionUpdated') {
          console.log(`  Escrow ID: ${parsed.args.escrowId}`);
          console.log(`  Condition: ${parsed.args.conditionMet ? '✅' : '❌'}`);
        }
      }
    } catch (e) {
      // Not one of our events
    }
  }
  
  // Check specific escrow IDs
  const escrowIds = [
    '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a',
    '0xca5a3b576aca680f63bc76275197bd8c81fc0de10317b5f9d70ecf1992f3f3a8'
  ];
  
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)'
  ];
  
  const contract = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, provider);
  
  console.log(chalk.cyan('\n📦 Checking Escrow States:'));
  for (const id of escrowIds) {
    try {
      const escrow = await contract.escrows(id);
      if (escrow.buyer !== ethers.ZeroAddress) {
        console.log(`\nEscrow ${id.slice(0, 10)}...:`);
        console.log(`  Amount: ${ethers.formatEther(escrow.depositAmount)} ETH`);
        console.log(`  Released: ${escrow.released ? '✅' : '❌'}`);
        console.log(`  Condition: ${escrow.conditionMet ? '✅' : '❌'}`);
        console.log(`  Target Chain: ${escrow.targetChainId}`);
      }
    } catch (e) {
      // Escrow doesn't exist
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkStatus().catch(console.error);
}
#!/usr/bin/env node
/**
 * Check and manage condition updaters for UniversalEscrowServiceV3
 */

import { Contract, Wallet } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ABI = [
  'function owner() view returns (address)',
  'function conditionUpdaters(address) view returns (bool)',
  'function setConditionUpdater(address updater, bool authorized)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)'
];

async function checkConditionUpdaters() {
  const service = new EscrowServiceV3();
  await service.initialize();
  
  console.log(chalk.blue('🔍 Checking Condition Updater Configuration'));
  console.log(chalk.blue('=========================================='));
  
  const chains = service.getSupportedChains();
  
  for (const chain of chains) {
    console.log(chalk.cyan(`\n📍 ${chain.name} (${chain.chainId})`));
    
    try {
      const provider = await service.getProvider(chain.chainId);
      const contract = new Contract(chain.contractAddress, CONTRACT_ABI, provider);
      
      // Check owner
      const owner = await contract.owner();
      console.log(`Contract: ${chain.contractAddress}`);
      console.log(`Owner: ${owner}`);
      
      // Check if backend wallet is authorized
      if (process.env.BACKEND_WALLET_PRIVATE_KEY) {
        const wallet = new Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
        const isAuthorized = await contract.conditionUpdaters(wallet.address);
        
        console.log(`Backend wallet: ${wallet.address}`);
        console.log(`Is condition updater: ${isAuthorized ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
        console.log(`Is owner: ${owner.toLowerCase() === wallet.address.toLowerCase() ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
        
        if (!isAuthorized && owner.toLowerCase() !== wallet.address.toLowerCase()) {
          console.log(chalk.yellow('\n⚠️  Backend wallet is not authorized to update conditions'));
          console.log(chalk.gray('To authorize, the contract owner must run:'));
          console.log(chalk.gray(`contract.setConditionUpdater("${wallet.address}", true)`));
        }
      }
      
      // Check some known addresses
      const knownAddresses = [
        '0x2223F51659fAcC662504dcEbD4735886285ABC96', // Your wallet from the test
        '0x0000000000000000000000000000000000000000'  // Zero address (should be false)
      ];
      
      console.log(chalk.gray('\nChecking known addresses:'));
      for (const addr of knownAddresses) {
        const isAuth = await contract.conditionUpdaters(addr);
        console.log(`${addr}: ${isAuth ? '✅' : '❌'}`);
      }
      
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
    }
  }
  
  console.log(chalk.cyan('\n📋 Summary:'));
  console.log('1. Only the contract owner or authorized updaters can set conditions');
  console.log('2. The buyer who creates an escrow can release it (after condition is met)');
  console.log('3. The contract owner can always release any escrow');
  console.log('\nTo run a successful cross-chain test, you need either:');
  console.log('- Be the contract owner');
  console.log('- Have your address added as a condition updater');
  console.log('- Create a separate service/bot wallet that is pre-authorized');
}

async function setConditionUpdater(chainId, updaterAddress, authorized = true) {
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('❌ No private key provided'));
    return;
  }
  
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const chain = service.getChainConfig(chainId);
  if (!chain) {
    console.log(chalk.red('❌ Invalid chain ID'));
    return;
  }
  
  console.log(chalk.blue(`\n🔧 Setting Condition Updater on ${chain.name}`));
  
  try {
    const wallet = await service.getWallet(chainId);
    const contract = new Contract(chain.contractAddress, CONTRACT_ABI, wallet);
    
    // Check if we're the owner
    const owner = await contract.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log(chalk.red('❌ You are not the contract owner'));
      console.log(`Owner: ${owner}`);
      console.log(`Your address: ${wallet.address}`);
      return;
    }
    
    // Set condition updater
    console.log(`Setting ${updaterAddress} as condition updater: ${authorized}`);
    const tx = await contract.setConditionUpdater(updaterAddress, authorized);
    console.log(`TX: ${service.getExplorerUrl(chainId, tx.hash)}`);
    
    const receipt = await tx.wait();
    console.log(chalk.green('✅ Transaction confirmed!'));
    
    // Verify
    const isAuth = await contract.conditionUpdaters(updaterAddress);
    console.log(`Verified: ${updaterAddress} is ${isAuth ? 'authorized' : 'not authorized'}`);
    
  } catch (error) {
    console.log(chalk.red(`❌ Error: ${error.message}`));
  }
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('\nUsage: node checkConditionUpdaters.js [options]');
    console.log('\nOptions:');
    console.log('  --check              Check current configuration (default)');
    console.log('  --set <chain> <addr> Set address as condition updater');
    console.log('  --unset <chain> <addr> Remove address as condition updater');
    console.log('\nExamples:');
    console.log('  node checkConditionUpdaters.js');
    console.log('  node checkConditionUpdaters.js --set 11155111 0x123...');
    console.log('  node checkConditionUpdaters.js --unset 11155111 0x123...');
    return;
  }
  
  if (args[0] === '--set' && args[1] && args[2]) {
    await setConditionUpdater(parseInt(args[1]), args[2], true);
  } else if (args[0] === '--unset' && args[1] && args[2]) {
    await setConditionUpdater(parseInt(args[1]), args[2], false);
  } else {
    await checkConditionUpdaters();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { checkConditionUpdaters, setConditionUpdater };
#!/usr/bin/env node
/**
 * Script to help authorize your escrow contract on the OFT adapter
 * This will check if you're the owner and provide the transaction to authorize
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import readline from 'readline';
import { EscrowServiceV3 } from '../escrowServiceV3.js';

dotenv.config();

const YOUR_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const OFT_ADAPTER_ADDRESS = '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4';
const OFT_OWNER_ADDRESS = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D';
const SEPOLIA_CHAIN_ID = 11155111;

// OFT adapter ABI with the authorization function
const OFT_ABI = [
  'function owner() view returns (address)',
  'function escrowContracts(address) view returns (bool)',
  'function authorizeEscrowContract(address escrow, bool authorized)',
  'event EscrowContractAuthorized(address indexed escrow, bool authorized)'
];

// Helper to ask user confirmation
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  console.log(chalk.blue('🔐 OFT Adapter Authorization Helper'));
  console.log(chalk.blue('==================================='));
  
  try {
    // Initialize EscrowServiceV3 to get proper provider and wallet
    const service = new EscrowServiceV3();
    await service.initialize();
    
    // Get provider and wallet through the service
    const provider = await service.getProvider(SEPOLIA_CHAIN_ID);
    const wallet = await service.getWallet(SEPOLIA_CHAIN_ID);
    
    console.log(chalk.cyan('\n📊 Current Status:'));
    console.log(`Your wallet address: ${wallet.address}`);
    console.log(`Your escrow contract: ${YOUR_CONTRACT}`);
    console.log(`OFT adapter address: ${OFT_ADAPTER_ADDRESS}`);
    console.log(`OFT adapter owner: ${OFT_OWNER_ADDRESS}`);
    
    // Create OFT adapter contract instance
    const oftAdapter = new ethers.Contract(OFT_ADAPTER_ADDRESS, OFT_ABI, provider);
    
    // Try to check current authorization status
    let isAuthorized = false;
    let canCheckAuth = true;
    
    try {
      isAuthorized = await oftAdapter.escrowContracts(YOUR_CONTRACT);
      console.log(`\nAuthorization status: ${isAuthorized ? chalk.green('✅ Authorized') : chalk.red('❌ Not Authorized')}`);
    } catch (error) {
      canCheckAuth = false;
      console.log(chalk.yellow('\n⚠️  Unable to check authorization status'));
      console.log('The OFT adapter might be using a different interface or be unavailable.');
      console.log(`Error: ${error.message}`);
    }
    
    if (canCheckAuth && isAuthorized) {
      console.log(chalk.green('\n✅ Your contract is already authorized!'));
      console.log('You should be able to use cross-chain functionality.');
      return;
    }
    
    // Check if we're the owner
    const isOwner = wallet.address.toLowerCase() === OFT_OWNER_ADDRESS.toLowerCase();
    
    if (isOwner) {
      console.log(chalk.green('\n✅ Good news! You ARE the OFT adapter owner!'));
      console.log('You can authorize your contract directly.');
      
      // Show gas estimate
      const oftWithSigner = oftAdapter.connect(wallet);
      try {
        const gasEstimate = await oftWithSigner.authorizeEscrowContract.estimateGas(YOUR_CONTRACT, true);
        const gasPrice = await provider.getFeeData();
        const estimatedCost = gasEstimate * gasPrice.gasPrice;
        
        console.log(chalk.yellow('\n💰 Transaction estimate:'));
        console.log(`Gas estimate: ${gasEstimate.toString()}`);
        console.log(`Gas price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
        console.log(`Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);
        
        const answer = await askQuestion('\nDo you want to authorize your contract now? (yes/no): ');
        
        if (answer.toLowerCase() === 'yes') {
          console.log(chalk.yellow('\n🚀 Sending authorization transaction...'));
          
          const tx = await oftWithSigner.authorizeEscrowContract(YOUR_CONTRACT, true);
          console.log(`Transaction hash: ${tx.hash}`);
          console.log('Waiting for confirmation...');
          
          const receipt = await tx.wait();
          console.log(chalk.green(`\n✅ Transaction confirmed in block ${receipt.blockNumber}`));
          console.log('Your contract is now authorized!');
          
          // Verify authorization
          const newAuthStatus = await oftAdapter.escrowContracts(YOUR_CONTRACT);
          console.log(`Verification: ${newAuthStatus ? chalk.green('✅ Authorized') : chalk.red('❌ Still not authorized')}`);
        } else {
          console.log(chalk.yellow('\n📝 Manual authorization instructions:'));
          console.log('Run this transaction when ready:');
          console.log(chalk.gray(`await oftAdapter.authorizeEscrowContract("${YOUR_CONTRACT}", true)`));
        }
      } catch (error) {
        console.log(chalk.red(`\n❌ Error estimating gas: ${error.message}`));
        console.log('There might be an issue with the authorization.');
      }
      
    } else {
      console.log(chalk.red('\n❌ You are NOT the OFT adapter owner'));
      console.log(`The owner is: ${OFT_OWNER_ADDRESS}`);
      console.log(`Your address is: ${wallet.address}`);
      
      console.log(chalk.yellow('\n📋 What you need to do:'));
      console.log('1. Contact the OFT adapter owner and request authorization');
      console.log('2. Provide them with this command:');
      console.log(chalk.gray(`   await oftAdapter.authorizeEscrowContract("${YOUR_CONTRACT}", true)`));
      console.log('\n3. Or they can use this script if they have access to the owner wallet');
      
      console.log(chalk.cyan('\n🔄 Alternative Options:'));
      console.log('While waiting for authorization, you can:');
      console.log('\n1. Test same-chain operations only (no cross-chain):');
      console.log('   - Create transactions on Sepolia only');
      console.log('   - All escrow functionality works except cross-chain transfers');
      
      console.log('\n2. Deploy your own OFT adapters:');
      console.log('   - More complex setup but gives you full control');
      console.log('   - Requires deploying and configuring OFT on each chain');
      
      console.log('\n3. Use a test contract that\'s already authorized:');
      console.log('   - The original V3 contract: 0xBA10d8d3A09439eA5984F545C925d61958fa14E9');
      console.log('   - But you won\'t have condition updater permissions there');
    }
    
    console.log(chalk.blue('\n📚 Additional Information:'));
    console.log('The OFT adapter maintains a whitelist of authorized escrow contracts.');
    console.log('This security measure prevents unauthorized contracts from using the bridge.');
    console.log('Once authorized, your contract can freely transfer tokens cross-chain.');
    
    console.log(chalk.cyan('\n🧪 Testing Without Authorization:'));
    console.log('You can still test your escrow contract with these approaches:');
    console.log('\n1. Same-chain testing (recommended):');
    console.log('   - Create transactions on Sepolia only');
    console.log('   - Test all escrow features except cross-chain transfers');
    console.log('   - Use the following test script:');
    console.log(chalk.gray('   node src/services/scripts/checkYourEscrow.js'));
    
    console.log('\n2. Simulate cross-chain locally:');
    console.log('   - Create transactions with same sender/receiver but different chains');
    console.log('   - The contract will work but tokens won\'t actually bridge');
    
    console.log('\n3. Fork and test:');
    console.log('   - Use Hardhat/Foundry to fork mainnet');
    console.log('   - Deploy your own test OFT adapters');
    console.log('   - Full control but more complex setup');
    
    if (!canCheckAuth) {
      console.log(chalk.yellow('\n⚠️  Note: The OFT adapter might have a different interface.'));
      console.log('Consider checking the actual contract on Etherscan for the correct ABI.');
      console.log(`https://sepolia.etherscan.io/address/${OFT_ADAPTER_ADDRESS}#code`);
    }
    
  } catch (error) {
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
    console.log('Make sure your RPC URL and private key are correctly configured.');
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
#!/usr/bin/env node
/**
 * Check the status of your created escrow
 * This helps verify what state the escrow is in
 */

import { Contract } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Your escrow from the failed test
const YOUR_ESCROW_ID = '0xc2a6ce11b08adc0dbfcaee8d03a74f0d0fd6ae94de2def613d582d7d0bd63a2d';
const YOUR_ESCROW_TX = '0x5a0f6d4e8f2624076b6de162d12cc0dde0777158b4718425a5fe65e2a9cb6c5e';

async function checkYourEscrow() {
  const service = new EscrowServiceV3();
  await service.initialize();
  
  console.log(chalk.blue('🔍 Checking Your Escrow Status'));
  console.log(chalk.blue('================================'));
  
  const chainId = 11155111; // Sepolia
  
  try {
    // Get escrow details
    const escrowDetails = await service.getEscrowDetails(chainId, YOUR_ESCROW_ID);
    
    console.log(chalk.cyan('\n📋 Escrow Details:'));
    console.log(`Escrow ID: ${YOUR_ESCROW_ID}`);
    console.log(`Creation TX: ${service.getExplorerUrl(chainId, YOUR_ESCROW_TX)}`);
    console.log(`\nBuyer: ${escrowDetails.buyer}`);
    console.log(`Seller: ${escrowDetails.seller}`);
    console.log(`Deposit Amount: ${escrowDetails.depositAmount} ETH`);
    console.log(`Service Fee (2%): ${(parseFloat(escrowDetails.depositAmount) * 0.02).toFixed(6)} ETH`);
    console.log(`Net Amount: ${escrowDetails.netAmount} ETH`);
    console.log(`Target Chain: ${escrowDetails.targetChainId} (Arbitrum Sepolia)`);
    console.log(`Target Token: ${escrowDetails.targetToken}`);
    console.log(`\nCondition Met: ${escrowDetails.conditionMet ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
    console.log(`Released: ${escrowDetails.released ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
    
    // Calculate what would happen
    console.log(chalk.cyan('\n💰 What Would Happen If Released:'));
    console.log(`1. Service fee (2%) goes to service wallet`);
    console.log(`2. ${escrowDetails.netAmount} ETH converted to WETH`);
    console.log(`3. WETH bridged via LayerZero to Arbitrum Sepolia`);
    console.log(`4. Seller receives ${escrowDetails.netAmount} WETH on Arbitrum`);
    
    // Check authorization
    console.log(chalk.cyan('\n🔐 Authorization Status:'));
    
    const provider = await service.getProvider(chainId);
    const contractAbi = [
      'function owner() view returns (address)',
      'function conditionUpdaters(address) view returns (bool)'
    ];
    const contract = new Contract(service.getChainConfig(chainId).contractAddress, contractAbi, provider);
    
    const owner = await contract.owner();
    const yourWallet = escrowDetails.buyer;
    const isOwner = owner.toLowerCase() === yourWallet.toLowerCase();
    const isConditionUpdater = await contract.conditionUpdaters(yourWallet);
    
    console.log(`Contract Owner: ${owner}`);
    console.log(`You are owner: ${isOwner ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
    console.log(`You are condition updater: ${isConditionUpdater ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
    console.log(`You are buyer: ${chalk.green('✅ YES')} (can release after condition is set)`);
    
    // What needs to happen
    console.log(chalk.cyan('\n📝 Next Steps:'));
    
    if (!escrowDetails.conditionMet) {
      console.log(chalk.yellow('1. Condition needs to be set to true'));
      console.log('   Options:');
      console.log(`   a) Have contract owner (${owner}) run:`);
      console.log(`      ${chalk.gray(`contract.updateCondition("${YOUR_ESCROW_ID}", true)`)}`);
      console.log(`   b) Have owner add you as condition updater:`);
      console.log(`      ${chalk.gray(`contract.setConditionUpdater("${yourWallet}", true)`)}`);
    }
    
    if (escrowDetails.conditionMet && !escrowDetails.released) {
      console.log(chalk.green('1. Condition is met! You can release the escrow'));
      
      // Get fee quote
      const targetChainId = parseInt(escrowDetails.targetChainId);
      const amount = escrowDetails.depositAmount;
      const feeQuote = await service.quoteCrossChainFee(chainId, targetChainId, amount);
      
      console.log(`\n2. Get LayerZero fees: ${feeQuote.recommended} ETH`);
      console.log(`\n3. Release the escrow:`);
      console.log(`   ${chalk.gray(`await contract.releaseEscrow("${YOUR_ESCROW_ID}", { value: parseEther("${feeQuote.recommended}") })`)}`);
    }
    
    if (escrowDetails.released) {
      console.log(chalk.green('✅ Escrow has been released!'));
      console.log('Check the destination chain for the WETH transfer.');
    }
    
    // Manual verification commands
    console.log(chalk.cyan('\n🛠️  Manual Verification Commands:'));
    console.log('Check escrow on Etherscan:');
    console.log(`${chalk.gray(`https://sepolia.etherscan.io/address/${service.getChainConfig(chainId).contractAddress}#readContract`)}`);
    console.log(`Function: escrows`);
    console.log(`Input: ${YOUR_ESCROW_ID}`);
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
  }
}

// Main
async function main() {
  await checkYourEscrow();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
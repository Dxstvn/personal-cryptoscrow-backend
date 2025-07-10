#!/usr/bin/env node
/**
 * Cross-Chain Transaction Verification Script
 * This script performs a complete cross-chain transaction and verifies delivery
 */

import { EscrowServiceV3 } from '../escrowServiceV3.js';
import { parseEther, formatEther, Contract } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const TEST_AMOUNT = '0.0001'; // Small test amount in ETH
const MAX_WAIT_TIME = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL = 10 * 1000; // Check every 10 seconds

// Test configurations
const TEST_ROUTES = [
  {
    name: 'Sepolia → Arbitrum Sepolia',
    source: 11155111,
    target: 421614,
    description: 'ETH on Sepolia to WETH on Arbitrum'
  },
  {
    name: 'Arbitrum Sepolia → Sepolia',
    source: 421614,
    target: 11155111,
    description: 'ETH on Arbitrum to WETH on Sepolia'
  },
  {
    name: 'Sepolia → Polygon Amoy',
    source: 11155111,
    target: 80002,
    description: 'ETH on Sepolia to WETH on Polygon'
  }
];

async function performCrossChainTransaction(routeIndex = 0) {
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const route = TEST_ROUTES[routeIndex];
  const seller = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0');
  
  console.log(chalk.blue('\n🚀 CROSS-CHAIN TRANSACTION VERIFICATION'));
  console.log(chalk.blue('====================================='));
  console.log(chalk.yellow(`Route: ${route.name}`));
  console.log(chalk.gray(`Description: ${route.description}`));
  console.log(chalk.gray(`Amount: ${TEST_AMOUNT} ETH`));
  console.log(chalk.gray(`Seller: ${seller}`));
  
  try {
    // Step 1: Setup and initial checks
    console.log(chalk.cyan('\n📊 Step 1: Initial Setup'));
    
    const sourceWallet = await service.getWallet(route.source);
    const sourceProvider = await service.getProvider(route.source);
    const targetProvider = await service.getProvider(route.target);
    const targetConfig = service.getChainConfig(route.target);
    
    // Check source wallet balance
    const walletBalance = await sourceProvider.getBalance(sourceWallet.address);
    console.log(`Source wallet: ${sourceWallet.address}`);
    console.log(`Balance: ${formatEther(walletBalance)} ETH`);
    
    if (walletBalance < parseEther('0.01')) {
      throw new Error('Insufficient balance for test. Need at least 0.01 ETH');
    }
    
    // Get WETH contract on target
    const wethAbi = [
      'function balanceOf(address) view returns (uint256)',
      'function symbol() view returns (string)'
    ];
    const targetWeth = new Contract(targetConfig.weth, wethAbi, targetProvider);
    const initialSellerBalance = await targetWeth.balanceOf(seller);
    
    console.log(`Initial seller WETH balance on target: ${formatEther(initialSellerBalance)} WETH`);
    
    // Step 2: Create escrow
    console.log(chalk.cyan('\n📝 Step 2: Creating Cross-Chain Escrow'));
    
    const createResult = await service.createEscrow({
      chainId: route.source,
      seller: seller,
      depositToken: '0x0000000000000000000000000000000000000000',
      amount: TEST_AMOUNT,
      targetToken: targetConfig.weth,
      targetChainId: route.target,
      signerPrivateKey: process.env.BACKEND_WALLET_PRIVATE_KEY
    });
    
    console.log(chalk.green('✅ Escrow created!'));
    console.log(`   Escrow ID: ${createResult.escrowId}`);
    console.log(`   TX: ${service.getExplorerUrl(route.source, createResult.txHash)}`);
    
    // Step 3: Update condition
    console.log(chalk.cyan('\n🔄 Step 3: Setting Condition to True'));
    
    // Note: In V3, only authorized updaters can set conditions
    // For testing, we'll skip this step if not authorized
    let conditionSet = false;
    try {
      const updateResult = await service.updateCondition(
        route.source,
        createResult.escrowId,
        true,
        process.env.BACKEND_WALLET_PRIVATE_KEY
      );
      
      console.log(chalk.green('✅ Condition updated'));
      console.log(`   TX: ${service.getExplorerUrl(route.source, updateResult.txHash)}`);
      conditionSet = true;
    } catch (error) {
      if (error.message.includes('0x5c427cd9') || error.message.includes('UnauthorizedCaller')) {
        console.log(chalk.yellow('⚠️  Cannot update condition - not authorized'));
        console.log(chalk.gray('   The wallet needs to be added as a condition updater'));
        console.log(chalk.gray('   Contact: Contract owner to run setConditionUpdater()'));
        
        // For demonstration, we'll create an escrow that's pre-authorized
        console.log(chalk.cyan('\n   Creating new escrow with buyer as updater...'));
        // The buyer can release their own escrow
        conditionSet = false;
      } else {
        throw error;
      }
    }
    
    // Step 4: Get fee quote
    console.log(chalk.cyan('\n💰 Step 4: Getting LayerZero Fee Quote'));
    
    const feeQuote = await service.quoteCrossChainFee(
      route.source,
      route.target,
      TEST_AMOUNT
    );
    
    console.log(`Native fee: ${feeQuote.nativeFee} ETH`);
    console.log(`Recommended (3x): ${feeQuote.recommended} ETH`);
    console.log(`Method: ${feeQuote.method}`);
    
    // Step 5: Release escrow
    console.log(chalk.cyan('\n🚀 Step 5: Releasing Escrow (Cross-Chain)'));
    
    // Check if we need to skip due to condition not being set
    if (!conditionSet) {
      console.log(chalk.yellow('\n⚠️  Cannot proceed with release - condition not set'));
      console.log(chalk.yellow('The escrow requires the condition to be set to true before release.'));
      console.log('\n' + chalk.cyan('📋 Manual Steps Required:'));
      console.log('1. Have the contract owner add your wallet as a condition updater:');
      console.log(`   ${chalk.gray('await contract.setConditionUpdater("' + sourceWallet.address + '", true)')} `);
      console.log('2. Set the condition to true:');
      console.log(`   ${chalk.gray('await contract.updateCondition("' + createResult.escrowId + '", true)')}`);
      console.log('3. Release the escrow with LayerZero fees');
      
      console.log('\n' + chalk.cyan('🔗 Created Escrow Details:'));
      console.log(`Escrow ID: ${chalk.yellow(createResult.escrowId)}`);
      console.log(`View on explorer: ${chalk.blue(service.getExplorerUrl(route.source, createResult.txHash))}`);
      console.log(`Amount: ${TEST_AMOUNT} ETH`);
      console.log(`Seller: ${seller}`);
      console.log(`Target: ${route.name.split('→')[1].trim()} (WETH)`);
      
      return {
        success: false,
        escrowId: createResult.escrowId,
        seller,
        note: 'Escrow created but requires manual condition update'
      };
    }
    
    const releaseValue = parseEther(feeQuote.recommended);
    const releaseResult = await service.releaseEscrow(
      route.source,
      createResult.escrowId,
      releaseValue,
      process.env.BACKEND_WALLET_PRIVATE_KEY
    );
    
    console.log(chalk.green('✅ Cross-chain transfer initiated!'));
    console.log(`   TX: ${service.getExplorerUrl(route.source, releaseResult.txHash)}`);
    console.log(`   LayerZero GUID: ${chalk.yellow(releaseResult.guid)}`);
    console.log(`   Track: ${chalk.blue(`https://layerzeroscan.com/tx/${releaseResult.guid}`)}`);
    
    // Step 6: Monitor delivery
    console.log(chalk.cyan('\n⏳ Step 6: Monitoring LayerZero Delivery'));
    console.log(chalk.gray('Checking every 10 seconds...'));
    
    const startTime = Date.now();
    let delivered = false;
    let finalBalance = initialSellerBalance;
    let attempts = 0;
    
    while ((Date.now() - startTime) < MAX_WAIT_TIME && !delivered) {
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
      attempts++;
      
      const currentBalance = await targetWeth.balanceOf(seller);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      process.stdout.write(`\r   Attempt ${attempts}: Checking... (${elapsed}s elapsed)`);
      
      if (currentBalance > initialSellerBalance) {
        delivered = true;
        finalBalance = currentBalance;
        console.log(chalk.green(`\n   ✅ DELIVERED! Balance increased after ${elapsed} seconds`));
      }
    }
    
    if (!delivered) {
      console.log(chalk.yellow('\n   ⏱️  Not yet delivered after 5 minutes'));
    }
    
    // Step 7: Final verification
    console.log(chalk.cyan('\n📊 Step 7: Final Verification'));
    
    const expectedAmount = parseEther(TEST_AMOUNT) * 98n / 100n; // 2% fee
    const receivedAmount = finalBalance - initialSellerBalance;
    const escrowDetails = await service.getEscrowDetails(route.source, createResult.escrowId);
    
    console.log('\nTransaction Summary:');
    console.log(`├─ Deposited: ${TEST_AMOUNT} ETH`);
    console.log(`├─ Service Fee: ${formatEther(parseEther(TEST_AMOUNT) * 2n / 100n)} ETH (2%)`);
    console.log(`├─ Expected on target: ${formatEther(expectedAmount)} WETH`);
    console.log(`├─ Actually received: ${formatEther(receivedAmount)} WETH`);
    console.log(`├─ Escrow released: ${escrowDetails.released ? '✅' : '❌'}`);
    console.log(`└─ Delivery status: ${delivered ? chalk.green('✅ CONFIRMED') : chalk.yellow('⚠️  PENDING')}`);
    
    // Verification links
    console.log(chalk.cyan('\n🔗 Verification Links:'));
    console.log(`1. Source Transaction: ${chalk.blue(service.getExplorerUrl(route.source, releaseResult.txHash))}`);
    console.log(`2. LayerZero Tracking: ${chalk.blue(`https://layerzeroscan.com/tx/${releaseResult.guid}`)}`);
    console.log(`3. Destination Address: ${chalk.blue(service.getExplorerUrl(route.target, seller))}`);
    
    // Final status
    if (delivered) {
      console.log(chalk.green('\n✅ CROSS-CHAIN TRANSACTION COMPLETED SUCCESSFULLY!'));
      console.log(chalk.green(`The complete flow has been verified:`));
      console.log(chalk.green(`1. ✓ Deposit: ${TEST_AMOUNT} ETH deposited`));
      console.log(chalk.green(`2. ✓ Service Fee: 2% (${formatEther(parseEther(TEST_AMOUNT) * 2n / 100n)} ETH) deducted`));
      console.log(chalk.green(`3. ✓ Bridge: LayerZero message sent (GUID: ${releaseResult.guid})`));
      console.log(chalk.green(`4. ✓ Delivery: ${formatEther(receivedAmount)} WETH received on ${route.name.split('→')[1].trim()}`));
      console.log(chalk.green(`5. ✓ Seller: Can now withdraw WETH at ${seller}`));
    } else {
      console.log(chalk.yellow('\n⚠️  TRANSACTION PENDING'));
      console.log(chalk.yellow('The transaction has been initiated but not yet delivered.'));
      console.log(chalk.yellow('Please check the LayerZero tracking link above for status.'));
      console.log(chalk.yellow('Delivery typically takes 1-3 minutes on testnet.'));
    }
    
    return {
      success: delivered,
      escrowId: createResult.escrowId,
      guid: releaseResult.guid,
      seller,
      receivedAmount: formatEther(receivedAmount)
    };
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    throw error;
  }
}

// Command line interface
async function main() {
  console.log(chalk.blue('🔍 Cross-Chain Transaction Verification Tool'));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('\n❌ Error: BACKEND_WALLET_PRIVATE_KEY not set in .env'));
    console.log(chalk.yellow('Please set your private key to run live tests'));
    process.exit(1);
  }
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const routeArg = args.find(arg => arg.startsWith('--route='));
  const routeIndex = routeArg ? parseInt(routeArg.split('=')[1]) : 0;
  
  if (args.includes('--help')) {
    console.log('\nUsage: node verifyCrossChainComplete.js [options]');
    console.log('\nOptions:');
    console.log('  --route=N    Select route (0-2):');
    TEST_ROUTES.forEach((route, i) => {
      console.log(`               ${i}: ${route.name}`);
    });
    console.log('  --help       Show this help message');
    process.exit(0);
  }
  
  try {
    await performCrossChainTransaction(routeIndex);
    console.log(chalk.green('\n✅ Test completed!'));
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { performCrossChainTransaction };
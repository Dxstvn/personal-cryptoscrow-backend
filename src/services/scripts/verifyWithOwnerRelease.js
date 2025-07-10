#!/usr/bin/env node
/**
 * Alternative Cross-Chain Verification
 * This version uses the fact that the escrow buyer can release their own escrow
 */

import { EscrowServiceV3 } from '../escrowServiceV3.js';
import { parseEther, formatEther, Contract, Wallet } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const ESCROW_ABI = [
  'function owner() view returns (address)',
  'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
  'function updateCondition(bytes32 escrowId, bool conditionMet)',
  'function releaseEscrow(bytes32 escrowId) payable',
  'event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address finalToken, uint256 finalAmount, string method, bool withCompose)',
  'event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 targetChainId, address oftAdapter, bytes32 guid, bool withCompose)'
];

async function performOwnerReleaseTest() {
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const sourceChainId = 11155111; // Sepolia
  const targetChainId = 421614;   // Arbitrum Sepolia
  const amount = '0.0001';
  const seller = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0');
  
  console.log(chalk.blue('\n🚀 CROSS-CHAIN VERIFICATION (Owner Release Method)'));
  console.log(chalk.blue('================================================'));
  console.log(chalk.yellow('This method allows the contract owner to set conditions'));
  
  try {
    // Get wallet and check if it's the owner
    const sourceWallet = await service.getWallet(sourceChainId);
    const sourceProvider = await service.getProvider(sourceChainId);
    const targetProvider = await service.getProvider(targetChainId);
    const sourceConfig = service.getChainConfig(sourceChainId);
    const targetConfig = service.getChainConfig(targetChainId);
    
    const escrowContract = new Contract(sourceConfig.contractAddress, ESCROW_ABI, sourceProvider);
    const contractOwner = await escrowContract.owner();
    
    console.log(`\n📊 Wallet Status:`);
    console.log(`Your wallet: ${sourceWallet.address}`);
    console.log(`Contract owner: ${contractOwner}`);
    console.log(`Are you owner: ${contractOwner.toLowerCase() === sourceWallet.address.toLowerCase() ? chalk.green('✅ YES') : chalk.yellow('❌ NO')}`);
    
    // Step 1: Create escrow
    console.log(chalk.cyan('\n📝 Step 1: Creating Cross-Chain Escrow'));
    console.log(`Seller: ${seller}`);
    console.log(`Amount: ${amount} ETH`);
    
    const createResult = await service.createEscrow({
      chainId: sourceChainId,
      seller: seller,
      depositToken: '0x0000000000000000000000000000000000000000',
      amount: amount,
      targetToken: targetConfig.weth,
      targetChainId: targetChainId,
      signerPrivateKey: process.env.BACKEND_WALLET_PRIVATE_KEY
    });
    
    console.log(chalk.green('✅ Escrow created!'));
    console.log(`   Escrow ID: ${createResult.escrowId}`);
    console.log(`   TX: ${service.getExplorerUrl(sourceChainId, createResult.txHash)}`);
    
    // Step 2: Check escrow details
    console.log(chalk.cyan('\n🔍 Step 2: Verifying Escrow State'));
    const escrowDetails = await service.getEscrowDetails(sourceChainId, createResult.escrowId);
    console.log(`Buyer: ${escrowDetails.buyer}`);
    console.log(`Condition Met: ${escrowDetails.conditionMet}`);
    console.log(`Released: ${escrowDetails.released}`);
    
    // Step 3: Set condition (different approaches based on authorization)
    console.log(chalk.cyan('\n🔄 Step 3: Setting Condition'));
    
    if (contractOwner.toLowerCase() === sourceWallet.address.toLowerCase()) {
      // We are the owner, can set condition directly
      console.log(chalk.green('✅ You are the contract owner - setting condition...'));
      
      const updateResult = await service.updateCondition(
        sourceChainId,
        createResult.escrowId,
        true,
        process.env.BACKEND_WALLET_PRIVATE_KEY
      );
      
      console.log(chalk.green('✅ Condition updated!'));
      console.log(`   TX: ${service.getExplorerUrl(sourceChainId, updateResult.txHash)}`);
      
    } else {
      // Not the owner - need manual intervention
      console.log(chalk.yellow('⚠️  You are not the contract owner'));
      console.log(chalk.yellow('The escrow has been created but requires the owner to set the condition.'));
      
      console.log('\n' + chalk.cyan('📋 Manual Steps Required:'));
      console.log('1. Contact the contract owner to set the condition:');
      console.log(`   ${chalk.gray('Owner address: ' + contractOwner)}`);
      console.log(`   ${chalk.gray('Escrow ID: ' + createResult.escrowId)}`);
      console.log('\n2. Have them run:');
      console.log(`   ${chalk.gray('await contract.updateCondition("' + createResult.escrowId + '", true)')}`);
      
      console.log('\n3. Then anyone can release with:');
      console.log(`   ${chalk.gray('await contract.releaseEscrow("' + createResult.escrowId + '", { value: layerZeroFees })')}`);
      
      console.log('\n' + chalk.cyan('🔗 Escrow Details for Manual Completion:'));
      console.log(`Contract: ${sourceConfig.contractAddress}`);
      console.log(`Escrow ID: ${chalk.yellow(createResult.escrowId)}`);
      console.log(`Amount: ${amount} ETH → ${formatEther(parseEther(amount) * 98n / 100n)} WETH`);
      console.log(`Target: ${targetConfig.name} (Chain ${targetChainId})`);
      console.log(`Seller receives on: ${seller}`);
      
      return {
        success: false,
        escrowId: createResult.escrowId,
        seller,
        requiresOwnerAction: true
      };
    }
    
    // Step 4: Get fee quote and release
    console.log(chalk.cyan('\n💰 Step 4: Getting LayerZero Fee Quote'));
    
    const feeQuote = await service.quoteCrossChainFee(
      sourceChainId,
      targetChainId,
      amount
    );
    
    console.log(`Fee: ${feeQuote.recommended} ETH (${feeQuote.method})`);
    
    // Step 5: Release escrow
    console.log(chalk.cyan('\n🚀 Step 5: Releasing Escrow'));
    
    const releaseValue = parseEther(feeQuote.recommended);
    const releaseResult = await service.releaseEscrow(
      sourceChainId,
      createResult.escrowId,
      releaseValue,
      process.env.BACKEND_WALLET_PRIVATE_KEY
    );
    
    console.log(chalk.green('✅ Cross-chain transfer initiated!'));
    console.log(`   TX: ${service.getExplorerUrl(sourceChainId, releaseResult.txHash)}`);
    console.log(`   LayerZero GUID: ${chalk.yellow(releaseResult.guid)}`);
    console.log(`   Track: ${chalk.blue(`https://layerzeroscan.com/tx/${releaseResult.guid}`)}`);
    
    // Step 6: Monitor delivery
    console.log(chalk.cyan('\n⏳ Step 6: Monitoring Delivery'));
    
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const targetWeth = new Contract(targetConfig.weth, wethAbi, targetProvider);
    const initialBalance = await targetWeth.balanceOf(seller);
    
    const maxWaitTime = 3 * 60 * 1000; // 3 minutes
    const checkInterval = 10 * 1000;
    const startTime = Date.now();
    let delivered = false;
    let finalBalance = initialBalance;
    
    while ((Date.now() - startTime) < maxWaitTime && !delivered) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      const currentBalance = await targetWeth.balanceOf(seller);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      
      process.stdout.write(`\r   Checking... (${elapsed}s elapsed)`);
      
      if (currentBalance > initialBalance) {
        delivered = true;
        finalBalance = currentBalance;
        console.log(chalk.green(`\n   ✅ DELIVERED! Balance increased`));
      }
    }
    
    // Final verification
    const expectedAmount = parseEther(amount) * 98n / 100n;
    const receivedAmount = finalBalance - initialBalance;
    
    console.log(chalk.cyan('\n📊 Final Verification:'));
    console.log(`Expected: ${formatEther(expectedAmount)} WETH`);
    console.log(`Received: ${formatEther(receivedAmount)} WETH`);
    console.log(`Status: ${delivered ? chalk.green('✅ COMPLETE') : chalk.yellow('⏳ PENDING')}`);
    
    console.log(chalk.cyan('\n🔗 Verification Links:'));
    console.log(`Source TX: ${chalk.blue(service.getExplorerUrl(sourceChainId, releaseResult.txHash))}`);
    console.log(`LayerZero: ${chalk.blue(`https://layerzeroscan.com/tx/${releaseResult.guid}`)}`);
    console.log(`Destination: ${chalk.blue(service.getExplorerUrl(targetChainId, seller))}`);
    
    if (delivered) {
      console.log(chalk.green('\n✅ CROSS-CHAIN TRANSACTION FULLY VERIFIED!'));
      console.log(chalk.green('Complete flow: Deposit → Service Fee → Bridge → Delivery'));
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

// Main
async function main() {
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('\n❌ Error: BACKEND_WALLET_PRIVATE_KEY not set'));
    console.log('Please set your private key in .env file');
    process.exit(1);
  }
  
  console.log(chalk.blue('🔍 Cross-Chain Verification (Owner Release Method)'));
  console.log('\nFirst, let\'s check your authorization status...');
  
  // Run the condition updater check first
  await import('./checkConditionUpdaters.js').then(module => 
    module.checkConditionUpdaters()
  );
  
  console.log('\n' + chalk.yellow('Press Ctrl+C to cancel or wait 5 seconds to continue...'));
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    await performOwnerReleaseTest();
    console.log(chalk.green('\n✅ Test completed!'));
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
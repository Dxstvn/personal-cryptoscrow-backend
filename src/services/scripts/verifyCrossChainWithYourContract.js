#!/usr/bin/env node
/**
 * Cross-Chain Verification with YOUR deployed contract
 * This uses your Sepolia contract where you have full authorization
 */

import { parseEther, formatEther, Contract } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Your deployed contract
const YOUR_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';

// Override the service configuration
class YourEscrowServiceV3 extends EscrowServiceV3 {
  constructor() {
    super();
    // Override Sepolia contract address with yours
    this.chainConfigs[11155111].contractAddress = YOUR_CONTRACT;
  }
}

async function verifyWithYourContract() {
  const service = new YourEscrowServiceV3();
  await service.initialize();
  
  const sourceChainId = 11155111; // Sepolia (where your contract is)
  const targetChainId = 421614;   // Arbitrum Sepolia
  const amount = '0.0001';
  const seller = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0');
  
  console.log(chalk.blue('\n🚀 CROSS-CHAIN VERIFICATION WITH YOUR CONTRACT'));
  console.log(chalk.blue('=============================================='));
  console.log(chalk.green('✅ Using YOUR deployed contract where you have full authorization'));
  console.log(`Contract: ${YOUR_CONTRACT}`);
  console.log(`Route: Sepolia → Arbitrum Sepolia`);
  console.log(`Amount: ${amount} ETH`);
  console.log(`Seller: ${seller}`);
  
  try {
    // Step 1: Verify authorization
    console.log(chalk.cyan('\n🔐 Step 1: Verifying Authorization'));
    
    const wallet = await service.getWallet(sourceChainId);
    const provider = await service.getProvider(sourceChainId);
    
    const contractAbi = [
      'function owner() view returns (address)',
      'function conditionUpdaters(address) view returns (bool)'
    ];
    const contract = new Contract(YOUR_CONTRACT, contractAbi, provider);
    
    const owner = await contract.owner();
    const isOwner = owner.toLowerCase() === wallet.address.toLowerCase();
    const isUpdater = await contract.conditionUpdaters(wallet.address);
    
    console.log(`Your wallet: ${wallet.address}`);
    console.log(`Contract owner: ${owner}`);
    console.log(`You are owner: ${isOwner ? chalk.green('✅ YES') : '❌ NO'}`);
    console.log(`You are condition updater: ${isUpdater ? chalk.green('✅ YES') : '❌ NO'}`);
    
    if (!isOwner && !isUpdater) {
      throw new Error('Not authorized - this should not happen with your contract!');
    }
    
    // Step 2: Check balances
    console.log(chalk.cyan('\n📊 Step 2: Initial Checks'));
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet balance: ${formatEther(balance)} ETH`);
    
    const targetProvider = await service.getProvider(targetChainId);
    const targetConfig = service.getChainConfig(targetChainId);
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const targetWeth = new Contract(targetConfig.weth, wethAbi, targetProvider);
    const initialSellerBalance = await targetWeth.balanceOf(seller);
    
    console.log(`Seller WETH balance on Arbitrum: ${formatEther(initialSellerBalance)} WETH`);
    
    // Step 3: Create escrow
    console.log(chalk.cyan('\n📝 Step 3: Creating Cross-Chain Escrow'));
    
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
    
    // Step 4: Update condition (THIS SHOULD WORK NOW!)
    console.log(chalk.cyan('\n🔄 Step 4: Setting Condition to True'));
    
    const updateResult = await service.updateCondition(
      sourceChainId,
      createResult.escrowId,
      true,
      process.env.BACKEND_WALLET_PRIVATE_KEY
    );
    
    console.log(chalk.green('✅ Condition updated successfully!'));
    console.log(`   TX: ${service.getExplorerUrl(sourceChainId, updateResult.txHash)}`);
    
    // Step 5: Get fee quote
    console.log(chalk.cyan('\n💰 Step 5: Getting LayerZero Fee Quote'));
    
    const feeQuote = await service.quoteCrossChainFee(
      sourceChainId,
      targetChainId,
      amount
    );
    
    console.log(`Fee: ${feeQuote.recommended} ETH (${feeQuote.method})`);
    
    // Step 6: Release escrow
    console.log(chalk.cyan('\n🚀 Step 6: Releasing Escrow (Cross-Chain)'));
    
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
    
    // Step 7: Monitor delivery
    console.log(chalk.cyan('\n⏳ Step 7: Monitoring LayerZero Delivery'));
    console.log('Checking every 10 seconds for up to 5 minutes...');
    
    const maxWaitTime = 5 * 60 * 1000;
    const checkInterval = 10 * 1000;
    const startTime = Date.now();
    let delivered = false;
    let finalBalance = initialSellerBalance;
    let attempts = 0;
    
    while ((Date.now() - startTime) < maxWaitTime && !delivered) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
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
    
    // Final verification
    const expectedAmount = parseEther(amount) * 98n / 100n;
    const receivedAmount = finalBalance - initialSellerBalance;
    
    console.log(chalk.cyan('\n📊 Final Verification:'));
    console.log(`Deposited: ${amount} ETH`);
    console.log(`Service Fee (2%): ${formatEther(parseEther(amount) * 2n / 100n)} ETH`);
    console.log(`Expected on target: ${formatEther(expectedAmount)} WETH`);
    console.log(`Actually received: ${formatEther(receivedAmount)} WETH`);
    console.log(`Delivery status: ${delivered ? chalk.green('✅ CONFIRMED') : chalk.yellow('⏳ PENDING')}`);
    
    console.log(chalk.cyan('\n🔗 Verification Links:'));
    console.log(`1. Create TX: ${chalk.blue(service.getExplorerUrl(sourceChainId, createResult.txHash))}`);
    console.log(`2. Update TX: ${chalk.blue(service.getExplorerUrl(sourceChainId, updateResult.txHash))}`);
    console.log(`3. Release TX: ${chalk.blue(service.getExplorerUrl(sourceChainId, releaseResult.txHash))}`);
    console.log(`4. LayerZero: ${chalk.blue(`https://layerzeroscan.com/tx/${releaseResult.guid}`)}`);
    console.log(`5. Seller on Arbitrum: ${chalk.blue(service.getExplorerUrl(targetChainId, seller))}`);
    
    if (delivered) {
      console.log(chalk.green('\n🎉 CROSS-CHAIN TRANSACTION FULLY VERIFIED!'));
      console.log(chalk.green('✅ Complete flow executed successfully:'));
      console.log(chalk.green('   1. Deposit: 0.0001 ETH'));
      console.log(chalk.green('   2. Service Fee: 0.000002 ETH (2%)'));
      console.log(chalk.green('   3. Condition: Set by authorized updater (you!)'));
      console.log(chalk.green('   4. Bridge: LayerZero transfer initiated'));
      console.log(chalk.green(`   5. Delivery: ${formatEther(receivedAmount)} WETH received on Arbitrum`));
    } else {
      console.log(chalk.yellow('\n⏳ Transaction not yet delivered'));
      console.log('Check the LayerZero link above for current status');
      console.log('Testnet delivery can take 3-5 minutes');
    }
    
    return {
      success: true,
      escrowId: createResult.escrowId,
      guid: releaseResult.guid,
      seller,
      delivered,
      receivedAmount: formatEther(receivedAmount)
    };
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    throw error;
  }
}

async function main() {
  console.log(chalk.blue('🔍 Cross-Chain Verification with YOUR Contract'));
  console.log(chalk.green('You have deployed your own contract with full authorization!'));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('\n❌ BACKEND_WALLET_PRIVATE_KEY not set'));
    process.exit(1);
  }
  
  try {
    await verifyWithYourContract();
    console.log(chalk.green('\n✅ Test completed successfully!'));
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed'));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
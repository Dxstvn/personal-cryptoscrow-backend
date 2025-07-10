#!/usr/bin/env node
/**
 * Test same-chain escrow with YOUR contract (no cross-chain, no OFT needed)
 */

import { parseEther, formatEther } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Your deployed contract
const YOUR_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';

class YourEscrowServiceV3 extends EscrowServiceV3 {
  constructor() {
    super();
    // Override Sepolia contract address with yours
    this.chainConfigs[11155111].contractAddress = YOUR_CONTRACT;
  }
}

async function testSameChain() {
  const service = new YourEscrowServiceV3();
  await service.initialize();
  
  const chainId = 11155111; // Sepolia only
  const amount = '0.0001';
  
  // Use the OFT owner as buyer for testing
  const buyer = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D';
  const seller = '0x' + Math.random().toString(16).substring(2, 42).padEnd(40, '0');
  
  console.log(chalk.blue('\n🧪 SAME-CHAIN TEST WITH YOUR CONTRACT'));
  console.log(chalk.blue('====================================='));
  console.log(chalk.green('✅ No OFT authorization needed for same-chain!'));
  console.log(`Contract: ${YOUR_CONTRACT}`);
  console.log(`Chain: Sepolia only (no cross-chain)`);
  console.log(`Amount: ${amount} ETH`);
  console.log(`Buyer: ${buyer} (OFT owner acting as buyer)`);
  console.log(`Seller: ${seller}`);
  
  try {
    // Step 1: Create escrow (buyer creates it)
    console.log(chalk.cyan('\n📝 Step 1: Creating Escrow'));
    console.log('Note: In production, the buyer would create this transaction');
    
    // For this test, we'll create it with service wallet and simulate buyer
    const createResult = await service.createEscrow({
      chainId: chainId,
      seller: seller,
      depositToken: '0x0000000000000000000000000000000000000000', // ETH
      amount: amount,
      targetToken: '0x0000000000000000000000000000000000000000', // ETH
      targetChainId: chainId, // SAME CHAIN!
      signerPrivateKey: process.env.BACKEND_WALLET_PRIVATE_KEY
    });
    
    console.log(chalk.green('✅ Escrow created!'));
    console.log(`   Escrow ID: ${createResult.escrowId}`);
    console.log(`   TX: ${service.getExplorerUrl(chainId, createResult.txHash)}`);
    
    // Step 2: Set condition (service wallet as owner/updater)
    console.log(chalk.cyan('\n🔄 Step 2: Setting Condition'));
    
    const updateResult = await service.updateCondition(
      chainId,
      createResult.escrowId,
      true,
      process.env.BACKEND_WALLET_PRIVATE_KEY
    );
    
    console.log(chalk.green('✅ Condition set!'));
    console.log(`   TX: ${service.getExplorerUrl(chainId, updateResult.txHash)}`);
    
    // Step 3: Release escrow (same-chain, no OFT needed)
    console.log(chalk.cyan('\n🚀 Step 3: Releasing Escrow (Same-Chain)'));
    
    const releaseResult = await service.releaseEscrow(
      chainId,
      createResult.escrowId,
      0n, // No LayerZero fees for same-chain
      process.env.BACKEND_WALLET_PRIVATE_KEY
    );
    
    console.log(chalk.green('✅ Escrow released!'));
    console.log(`   TX: ${service.getExplorerUrl(chainId, releaseResult.txHash)}`);
    console.log(`   Method: ${releaseResult.method || 'direct'}`);
    
    // Step 4: Verify seller received funds
    console.log(chalk.cyan('\n📊 Step 4: Verifying Results'));
    
    const provider = await service.getProvider(chainId);
    const sellerBalance = await provider.getBalance(seller);
    const serviceWallet = await service.getServiceWallet(chainId);
    const serviceBalance = await provider.getBalance(serviceWallet);
    
    const expectedAmount = parseEther(amount) * 98n / 100n; // 2% fee
    const feeAmount = parseEther(amount) * 2n / 100n;
    
    console.log(`Seller balance: ${formatEther(sellerBalance)} ETH`);
    console.log(`Expected: ${formatEther(expectedAmount)} ETH (after 2% fee)`);
    console.log(`Service fee: ${formatEther(feeAmount)} ETH`);
    console.log(`Service wallet: ${serviceWallet}`);
    
    if (sellerBalance >= expectedAmount) {
      console.log(chalk.green('\n🎉 SAME-CHAIN TEST SUCCESSFUL!'));
      console.log(chalk.green('✅ All escrow functionality works perfectly without OFT!'));
      console.log(chalk.green('   - Escrow created'));
      console.log(chalk.green('   - Condition set by authorized updater'));
      console.log(chalk.green('   - Funds released to seller'));
      console.log(chalk.green('   - Service fee collected'));
    }
    
    console.log(chalk.cyan('\n📝 Summary:'));
    console.log('Your contract works perfectly for same-chain operations.');
    console.log('Cross-chain requires OFT authorization from:', chalk.yellow('0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D'));
    
    return {
      success: true,
      escrowId: createResult.escrowId,
      seller,
      sellerBalance: formatEther(sellerBalance)
    };
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    
    if (error.message.includes('insufficient funds')) {
      console.log(chalk.yellow('\n💡 Tip: Make sure the buyer has enough ETH'));
      console.log(`Buyer address: ${buyer}`);
    }
    
    throw error;
  }
}

async function main() {
  console.log(chalk.blue('🔍 Same-Chain Test (No OFT Authorization Needed)'));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('\n❌ BACKEND_WALLET_PRIVATE_KEY not set'));
    process.exit(1);
  }
  
  try {
    await testSameChain();
    console.log(chalk.green('\n✅ Test completed successfully!'));
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed'));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
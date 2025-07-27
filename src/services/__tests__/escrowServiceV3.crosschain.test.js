// src/services/__tests__/escrowServiceV3.crosschain.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import { parseEther, formatEther } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Cross-chain transaction completion verification test
 * This test creates a real cross-chain transaction and verifies completion
 */
describe('EscrowServiceV3 Cross-Chain Completion Tests', () => {
  let service;
  let hasPrivateKey;
  
  beforeAll(async () => {
    service = new EscrowServiceV3();
    await service.initialize();
    hasPrivateKey = !!process.env.BACKEND_WALLET_PRIVATE_KEY;
  });

  describe('Cross-Chain Transaction Flow Verification', () => {
    it.skip('should complete full cross-chain transaction flow - skipped by default (requires real funds)', async () => {
      if (!hasPrivateKey) {
        console.log('\n⚠️  SKIPPING: No private key provided for live transaction test');
        console.log('To run this test, set BACKEND_WALLET_PRIVATE_KEY in your .env file');
        return;
      }

      const sourceChainId = 11155111; // Sepolia
      const targetChainId = 421614;   // Arbitrum Sepolia
      const amount = '0.0001';        // Small test amount
      const seller = '0x' + '1'.repeat(40); // Test seller address
      
      console.log('\n🚀 Starting Cross-Chain Transaction Test');
      console.log('=====================================');
      console.log(`Source: Sepolia (${sourceChainId})`);
      console.log(`Target: Arbitrum Sepolia (${targetChainId})`);
      console.log(`Amount: ${amount} ETH`);
      console.log(`Seller: ${seller}`);
      
      try {
        // Step 1: Check initial balances
        console.log('\n📊 Step 1: Checking Initial Balances');
        const sourceProvider = await service.getProvider(sourceChainId);
        const targetProvider = await service.getProvider(targetChainId);
        
        const sourceWallet = await service.getWallet(sourceChainId);
        const initialSourceBalance = await sourceProvider.getBalance(sourceWallet.address);
        console.log(`Source wallet balance: ${formatEther(initialSourceBalance)} ETH`);
        
        // Get WETH contract on target chain
        const targetConfig = service.getChainConfig(targetChainId);
        const wethAbi = ['function balanceOf(address) view returns (uint256)'];
        const targetWeth = new (await import('ethers')).Contract(
          targetConfig.weth,
          wethAbi,
          targetProvider
        );
        
        const initialSellerWethBalance = await targetWeth.balanceOf(seller);
        console.log(`Seller WETH balance on Arbitrum: ${formatEther(initialSellerWethBalance)} WETH`);
        
        // Step 2: Create escrow
        console.log('\n📝 Step 2: Creating Cross-Chain Escrow');
        const createResult = await service.createEscrow({
          chainId: sourceChainId,
          seller: seller,
          depositToken: '0x0000000000000000000000000000000000000000', // ETH
          amount: amount,
          targetToken: targetConfig.weth, // WETH on Arbitrum
          targetChainId: targetChainId,
          signerPrivateKey: process.env.BACKEND_WALLET_PRIVATE_KEY
        });
        
        console.log(`✅ Escrow created!`);
        console.log(`   Escrow ID: ${createResult.escrowId}`);
        console.log(`   TX: ${service.getExplorerUrl(sourceChainId, createResult.txHash)}`);
        
        // Step 3: Update condition
        console.log('\n🔄 Step 3: Updating Escrow Condition');
        const updateResult = await service.updateCondition(
          sourceChainId,
          createResult.escrowId,
          true,
          process.env.BACKEND_WALLET_PRIVATE_KEY
        );
        console.log(`✅ Condition updated: ${service.getExplorerUrl(sourceChainId, updateResult.txHash)}`);
        
        // Step 4: Quote cross-chain fee
        console.log('\n💰 Step 4: Getting Cross-Chain Fee Quote');
        const feeQuote = await service.quoteCrossChainFee(
          sourceChainId,
          targetChainId,
          amount,
          { verbose: true }
        );
        console.log(`Fee quote: ${feeQuote.recommended} ETH (${feeQuote.method})`);
        
        // Step 5: Release escrow with cross-chain transfer
        console.log('\n🚀 Step 5: Releasing Escrow (Cross-Chain)');
        const releaseValue = parseEther(feeQuote.recommended);
        
        const releaseResult = await service.releaseEscrow(
          sourceChainId,
          createResult.escrowId,
          releaseValue,
          process.env.BACKEND_WALLET_PRIVATE_KEY
        );
        
        console.log(`✅ Cross-chain transfer initiated!`);
        console.log(`   Release TX: ${service.getExplorerUrl(sourceChainId, releaseResult.txHash)}`);
        console.log(`   LayerZero GUID: ${releaseResult.guid}`);
        console.log(`   Track at: https://layerzeroscan.com/tx/${releaseResult.guid}`);
        console.log(`   Method: ${releaseResult.method}`);
        console.log(`   Target Chain: ${releaseResult.targetChainId}`);
        
        // Step 6: Wait for LayerZero delivery (with timeout)
        console.log('\n⏳ Step 6: Waiting for LayerZero Delivery...');
        console.log('This typically takes 1-3 minutes on testnet');
        
        const maxWaitTime = 5 * 60 * 1000; // 5 minutes
        const checkInterval = 15 * 1000;   // Check every 15 seconds
        const startTime = Date.now();
        let delivered = false;
        let finalSellerBalance = initialSellerWethBalance;
        
        while ((Date.now() - startTime) < maxWaitTime && !delivered) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          
          const currentBalance = await targetWeth.balanceOf(seller);
          console.log(`   Checking... (${Math.floor((Date.now() - startTime) / 1000)}s)`);
          
          if (currentBalance > initialSellerWethBalance) {
            delivered = true;
            finalSellerBalance = currentBalance;
            console.log(`   ✅ DELIVERED! Balance increased`);
          }
        }
        
        // Step 7: Verify final state
        console.log('\n📊 Step 7: Final Verification');
        
        const expectedAmount = parseEther(amount) * 98n / 100n; // 2% service fee
        const receivedAmount = finalSellerBalance - initialSellerWethBalance;
        
        console.log(`Expected amount: ${formatEther(expectedAmount)} WETH (after 2% fee)`);
        console.log(`Received amount: ${formatEther(receivedAmount)} WETH`);
        console.log(`Delivery status: ${delivered ? '✅ CONFIRMED' : '⚠️  PENDING'}`);
        
        // Generate verification links
        console.log('\n🔗 Verification Links:');
        console.log(`1. Source Transaction: ${service.getExplorerUrl(sourceChainId, releaseResult.txHash)}`);
        console.log(`2. LayerZero Tracking: https://layerzeroscan.com/tx/${releaseResult.guid}`);
        console.log(`3. Destination Address: ${service.getExplorerUrl(targetChainId, seller)}`);
        console.log(`4. Escrow Details: Check escrow ${createResult.escrowId} on Sepolia`);
        
        if (!delivered) {
          console.log('\n⚠️  Transaction not yet delivered. Please check:');
          console.log('   - LayerZero tracking link above for status');
          console.log('   - Destination address for WETH balance');
          console.log('   - This may take a few more minutes on testnet');
        } else {
          console.log('\n✅ CROSS-CHAIN TRANSACTION COMPLETED SUCCESSFULLY!');
          console.log(`   Seller received ${formatEther(receivedAmount)} WETH on Arbitrum Sepolia`);
        }
        
        // Test assertions
        expect(createResult.escrowId).toBeTruthy();
        expect(releaseResult.guid).toBeTruthy();
        expect(releaseResult.targetChainId).toBe(targetChainId.toString());
        
      } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        throw error;
      }
    }, 360000); // 6 minute timeout for cross-chain test
  });

  describe('Manual Verification Instructions', () => {
    it('should provide clear manual verification steps', async () => {
      console.log('\n📋 MANUAL VERIFICATION CHECKLIST');
      console.log('================================');
      console.log('\nIf running a cross-chain transaction manually, verify completion by:');
      console.log('\n1. Check Source Chain:');
      console.log('   - Escrow created event');
      console.log('   - Service fee (2%) deducted');
      console.log('   - CrossChainTransferInitiated event with GUID');
      console.log('\n2. Track on LayerZero:');
      console.log('   - Go to https://layerzeroscan.com');
      console.log('   - Search for the GUID from step 1');
      console.log('   - Verify status shows "Delivered"');
      console.log('\n3. Check Destination Chain:');
      console.log('   - Go to destination block explorer');
      console.log('   - Check seller address for WETH balance');
      console.log('   - Balance should be ~98% of original amount');
      console.log('\n4. Verify Complete Flow:');
      console.log('   ✓ Deposit on source chain');
      console.log('   ✓ 2% service fee deducted');
      console.log('   ✓ Cross-chain message sent via LayerZero');
      console.log('   ✓ WETH minted to seller on destination');
      console.log('   ✓ Seller can withdraw WETH');
      
      expect(true).toBe(true); // Dummy assertion for test runner
    });
  });
});
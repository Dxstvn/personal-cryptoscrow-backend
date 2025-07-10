// src/services/examples/escrowServiceV3.example.js
/**
 * Example usage of EscrowServiceV3
 * Demonstrates how to interact with V3 contracts using the unified service
 */

import { EscrowServiceV3 } from '../escrowServiceV3.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n=== EscrowServiceV3 Example ===\n');
  
  // Create service instance
  const escrowService = new EscrowServiceV3();
  
  try {
    // Initialize service
    await escrowService.initialize();
    console.log('✅ Service initialized\n');
    
    // 1. Get supported chains
    console.log('📍 Supported Chains:');
    const chains = escrowService.getSupportedChains();
    chains.forEach(chain => {
      console.log(`  - ${chain.name} (${chain.chainId}): ${chain.contractAddress}`);
    });
    
    // 2. Calculate fees
    console.log('\n💰 Fee Calculations:');
    const amount = '100'; // 100 ETH
    const serviceFee = escrowService.calculateServiceFee(amount);
    console.log(`  - Service Fee (2%): ${serviceFee} ETH`);
    
    // 3. Estimate total fees for cross-chain transaction
    console.log('\n🌉 Cross-Chain Fee Estimate:');
    const fees = await escrowService.estimateTotalFees({
      amount,
      sourceChainId: 11155111, // Sepolia
      targetChainId: 80002,    // Polygon Amoy
      requiresSwap: true
    });
    console.log(`  - Service Fee: ${fees.serviceFee} ETH`);
    console.log(`  - Cross-Chain Fee: ${fees.crossChainFee} ETH`);
    console.log(`  - Gas Estimate: ${fees.gasEstimate} ETH`);
    console.log(`  - Total: ${fees.total} ETH`);
    
    // 4. Get chain configurations
    console.log('\n⚙️  Chain Configuration (Sepolia):');
    const sepoliaConfig = escrowService.getChainConfig(11155111);
    console.log(`  - OFT Adapter: ${sepoliaConfig.oftAdapter}`);
    console.log(`  - Composer: ${sepoliaConfig.composer}`);
    console.log(`  - WETH: ${sepoliaConfig.weth}`);
    console.log(`  - Uniswap Router: ${sepoliaConfig.uniswapRouter}`);
    
    // 5. Example: How to create an escrow (commented out to avoid actual transaction)
    console.log('\n📝 Example: Create Escrow (not executed):');
    console.log(`
    const result = await escrowService.createEscrow({
      chainId: 11155111,
      seller: '0x742d35Cc6634C0532925a3b844Bc9e7595f5b8E0',
      depositToken: '0x0000000000000000000000000000000000000000', // ETH
      amount: '1',
      targetToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      targetChainId: 80002, // Polygon Amoy
      signerPrivateKey: process.env.USER_PRIVATE_KEY
    });
    
    console.log('Escrow ID:', result.escrowId);
    console.log('Transaction:', result.txHash);
    `);
    
    // 6. Example: How to release an escrow
    console.log('\n🔓 Example: Release Escrow (not executed):');
    console.log(`
    // For cross-chain, need to provide LayerZero fees
    const crossChainFees = await escrowService.quoteCrossChainFee(11155111, 80002, '1');
    const value = parseEther(crossChainFees.recommended); // 3x buffer
    
    const releaseResult = await escrowService.releaseEscrow(
      11155111,
      escrowId,
      value,
      process.env.AUTHORIZED_PRIVATE_KEY
    );
    
    console.log('Release TX:', releaseResult.txHash);
    console.log('LayerZero GUID:', releaseResult.guid);
    `);
    
    // 7. Track LayerZero transfer
    console.log('\n🔍 Example LayerZero Tracking:');
    const mockGuid = '0x7e037acbb2667df60e69d7a6518786f3f76d9216e3ca0fef9eea8cdb96633679';
    const tracking = await escrowService.trackLayerZeroTransfer(mockGuid);
    console.log(`  - Status: ${tracking.status}`);
    console.log(`  - Track at: ${tracking.scanUrl}`);
    
    // 8. Get explorer URLs
    console.log('\n🔗 Explorer URLs:');
    const txHash = '0x1234567890abcdef';
    chains.forEach(chain => {
      const url = escrowService.getExplorerUrl(chain.chainId, txHash);
      console.log(`  - ${chain.name}: ${url}`);
    });
    
    console.log('\n✅ Example completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Run the example
main().catch(console.error);
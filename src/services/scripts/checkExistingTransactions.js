#!/usr/bin/env node
/**
 * Check Existing Cross-Chain Transactions
 * This script verifies known cross-chain transactions from previous tests
 */

import { EscrowServiceV3 } from '../escrowServiceV3.js';
import { Contract, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Known test transactions from the codebase
const KNOWN_TRANSACTIONS = [
  {
    route: 'Arbitrum Sepolia → Sepolia',
    guid: '0xbcab3c617b8822dfd14e472d74131931d655608588eb4908f2849f1c09600acc',
    seller: '0x6Deb7c0886b94b289F891bC1C0D6c447F74f3BaA',
    expectedAmount: '0.000098',
    targetChain: 11155111,
    targetToken: 'WETH',
    sourceTx: '0xb51424ed01fdd8cc03831bef15fe6dd250a766f902c8a0386f28b8be1a200625'
  },
  {
    route: 'Arbitrum Sepolia → Sepolia (Compose)',
    guid: '0x7e037acbb2667df60e69d7a6518786f3f76d9216e3ca0fef9eea8cdb96633679',
    seller: '0x1D6daDFDE0e84E69bab6466d4Ad2B2D72ed60FCC',
    targetChain: 11155111,
    targetToken: 'USDC',
    note: 'Compose swap to USDC'
  },
  {
    route: 'Sepolia → Polygon Amoy',
    guid: '0xb690a71dc7caa38c5982d4d78c8538082000c71f562bda9ddca370945ced08df',
    seller: '0x7fFA8De598e503491e33DB6CAe6ebac1AF71C07e',
    expectedAmount: '0.000098',
    targetChain: 80002,
    targetToken: 'WETH'
  }
];

async function checkTransaction(tx) {
  const service = new EscrowServiceV3();
  await service.initialize();
  
  console.log(chalk.blue(`\n📋 Checking: ${tx.route}`));
  console.log(chalk.gray('─'.repeat(50)));
  
  try {
    // Get providers and contracts
    const targetProvider = await service.getProvider(tx.targetChain);
    const targetConfig = service.getChainConfig(tx.targetChain);
    
    // Check seller balance
    if (tx.targetToken === 'WETH') {
      const wethAbi = ['function balanceOf(address) view returns (uint256)'];
      const weth = new Contract(targetConfig.weth, wethAbi, targetProvider);
      const balance = await weth.balanceOf(tx.seller);
      
      console.log(`Seller: ${tx.seller}`);
      console.log(`WETH Balance: ${formatEther(balance)} WETH`);
      
      if (tx.expectedAmount) {
        const expected = parseFloat(tx.expectedAmount);
        const actual = parseFloat(formatEther(balance));
        
        if (actual >= expected) {
          console.log(chalk.green(`✅ VERIFIED: Balance matches expected (${tx.expectedAmount} WETH)`));
        } else if (actual > 0) {
          console.log(chalk.yellow(`⚠️  PARTIAL: Balance is ${formatEther(balance)} WETH`));
        } else {
          console.log(chalk.red(`❌ NOT RECEIVED: Balance is 0`));
        }
      }
    } else if (tx.targetToken === 'USDC') {
      // Check USDC balance
      const usdcAddresses = {
        11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia
        421614: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'    // Arbitrum Sepolia
      };
      
      const usdcAddress = usdcAddresses[tx.targetChain];
      if (usdcAddress) {
        const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
        const usdc = new Contract(usdcAddress, usdcAbi, targetProvider);
        const balance = await usdc.balanceOf(tx.seller);
        
        console.log(`Seller: ${tx.seller}`);
        console.log(`USDC Balance: ${formatUnits(balance, 6)} USDC`);
        console.log(balance > 0 ? chalk.green('✅ RECEIVED') : chalk.yellow('⏳ PENDING'));
      }
    }
    
    // Generate tracking links
    console.log(chalk.cyan('\n🔗 Tracking Links:'));
    console.log(`LayerZero: ${chalk.blue(`https://layerzeroscan.com/tx/${tx.guid}`)}`);
    console.log(`Destination: ${chalk.blue(service.getExplorerUrl(tx.targetChain, tx.seller))}`);
    
    if (tx.sourceTx) {
      const sourceChain = tx.route.includes('Arbitrum') ? 421614 : 11155111;
      console.log(`Source TX: ${chalk.blue(service.getExplorerUrl(sourceChain, tx.sourceTx))}`);
    }
    
    if (tx.note) {
      console.log(chalk.gray(`\nNote: ${tx.note}`));
    }
    
  } catch (error) {
    console.log(chalk.red(`❌ Error checking transaction: ${error.message}`));
  }
}

async function checkAllTransactions() {
  console.log(chalk.blue('🔍 Checking Known Cross-Chain Transactions'));
  console.log(chalk.blue('========================================='));
  
  for (const tx of KNOWN_TRANSACTIONS) {
    await checkTransaction(tx);
  }
  
  console.log(chalk.cyan('\n📊 Summary:'));
  console.log('These are known test transactions from the V3 contract testing.');
  console.log('Use the LayerZero links above to check delivery status.');
  console.log('If status shows "Delivered" but balance is 0, the transaction may have failed.');
  
  console.log(chalk.cyan('\n💡 To run a new verified transaction:'));
  console.log(chalk.gray('node src/services/scripts/verifyCrossChainComplete.js'));
}

// Add missing import
import { formatUnits } from 'ethers';

// Main execution
async function main() {
  try {
    await checkAllTransactions();
    console.log(chalk.green('\n✅ Check completed!'));
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
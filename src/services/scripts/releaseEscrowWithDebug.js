#!/usr/bin/env node
/**
 * Release escrow with detailed debugging
 */

import { ethers, formatEther, parseEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const ESCROW_ADDRESS = '0x726ca2162A5B90718EF11Ab8f294c0f30E258208';
const ESCROW_ID = '0x1b81e1faaf7525a3c3572504e54b475c7b5e0b83eb12f696155ac8b5fbddb50a';

async function main() {
  console.log(chalk.blue('🚀 Releasing Escrow with Debug'));
  console.log(chalk.blue('=============================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  console.log(`Wallet address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet balance: ${formatEther(balance)} ETH\n`);
  
  const escrowAbi = [
    'function releaseEscrow(bytes32 escrowId) payable',
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed recipient, address token, uint256 amount, string method, bool isCompose)',
    'event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 indexed targetChainId, address indexed oftAdapter, bytes32 guid, bool useCompose)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, wallet);
  
  try {
    // Check escrow state first
    const details = await escrow.escrows(ESCROW_ID);
    if (details.released) {
      console.log(chalk.yellow('⚠️  Escrow already released'));
      return;
    }
    
    console.log(chalk.cyan('Attempting release with different fee amounts...\n'));
    
    // Try different fee amounts
    const feeAmounts = ['0.001', '0.005', '0.01', '0.02'];
    
    for (const feeAmount of feeAmounts) {
      console.log(chalk.yellow(`\nTrying with fee: ${feeAmount} ETH`));
      
      try {
        // Try to simulate the transaction
        console.log('Simulating transaction...');
        const tx = await escrow.releaseEscrow.populateTransaction(ESCROW_ID);
        tx.value = parseEther(feeAmount);
        tx.gasLimit = 3000000; // High gas limit
        
        // Try to estimate gas
        try {
          const gasEstimate = await provider.estimateGas(tx);
          console.log(`Gas estimate: ${gasEstimate.toString()}`);
        } catch (e) {
          console.log('Gas estimation failed, using fixed gas limit');
        }
        
        // Send transaction
        console.log('Sending transaction...');
        const sentTx = await wallet.sendTransaction(tx);
        console.log(`Transaction hash: ${sentTx.hash}`);
        
        console.log('Waiting for confirmation...');
        const receipt = await sentTx.wait();
        
        if (receipt.status === 1) {
          console.log(chalk.green('✅ Transaction successful!'));
          
          // Parse events
          for (const log of receipt.logs) {
            try {
              const parsed = escrow.interface.parseLog(log);
              if (parsed) {
                console.log(`\nEvent: ${parsed.name}`);
                Object.entries(parsed.args.toObject()).forEach(([key, value]) => {
                  console.log(`  ${key}: ${value}`);
                });
              }
            } catch (e) {}
          }
          
          break;
        } else {
          console.log(chalk.red('❌ Transaction failed'));
        }
        
      } catch (error) {
        console.log(chalk.red(`Failed with ${feeAmount} ETH:`, error.message));
        
        // If it's a specific revert message, show it
        if (error.reason) {
          console.log(chalk.red('Revert reason:', error.reason));
        }
        if (error.data) {
          try {
            const decodedError = escrow.interface.parseError(error.data);
            if (decodedError) {
              console.log(chalk.red('Decoded error:', decodedError.name));
            }
          } catch (e) {}
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Fatal error:'), error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
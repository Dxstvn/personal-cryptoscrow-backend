#!/usr/bin/env node

import { ethers } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Your specific contract and escrow
const YOUR_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const YOUR_ESCROW_ID = '0xca5a3b576aca680f63bc76275197bd8c81fc0de10317b5f9d70ecf1992f3f3a8';

// Extend the service to use your contract
class YourEscrowServiceV3 extends EscrowServiceV3 {
  constructor() {
    super();
    // Override the Sepolia contract address with yours
    this.chainConfigs[11155111].contractAddress = YOUR_CONTRACT;
  }
}

async function main() {
  console.log(chalk.blue('=== Escrow V3 Release Script ===\n'));

  const service = new YourEscrowServiceV3();
  await service.initialize();

  const chainId = 11155111; // Sepolia
  
  try {
    // Step 1: Check escrow details
    console.log(chalk.cyan('Step 1: Checking escrow details...'));
    const escrowDetails = await service.getEscrowDetails(chainId, YOUR_ESCROW_ID);
    
    console.log('Escrow ID:', YOUR_ESCROW_ID);
    console.log('Buyer:', escrowDetails.buyer);
    console.log('Seller:', escrowDetails.seller);
    console.log('Amount:', escrowDetails.depositAmount, 'ETH');
    console.log('Net Amount (after 2% fee):', escrowDetails.netAmount, 'ETH');
    console.log('Target Chain:', escrowDetails.targetChainId);
    console.log('Condition Met:', escrowDetails.conditionMet ? chalk.green('✅') : chalk.red('❌'));
    console.log('Released:', escrowDetails.released ? chalk.green('✅') : chalk.red('❌'));
    console.log('');

    if (escrowDetails.released) {
      console.log(chalk.yellow('⚠️  Escrow has already been released!'));
      return;
    }

    if (!escrowDetails.conditionMet) {
      console.log(chalk.red('❌ Escrow condition not met! Cannot release.'));
      return;
    }

    // Step 2: Quote the release fee
    console.log(chalk.cyan('Step 2: Getting release fee quote...'));
    const quotedFee = await service.quoteEscrowRelease(chainId, YOUR_ESCROW_ID);
    console.log('Quoted LayerZero fee:', quotedFee, 'ETH');
    
    // Add 20% buffer
    const feeInWei = ethers.parseEther(quotedFee);
    const feeWithBuffer = feeInWei * 120n / 100n;
    console.log('Fee with 20% buffer:', ethers.formatEther(feeWithBuffer), 'ETH');

    // Step 3: Check wallet balance
    console.log(chalk.cyan('\nStep 3: Checking wallet balance...'));
    const provider = await service.getProvider(chainId);
    const privateKey = process.env.BACKEND_WALLET_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
    
    if (!privateKey) {
      console.log(chalk.red('❌ No private key found in environment!'));
      return;
    }
    
    const wallet = new ethers.Wallet(privateKey.replace(/['"]/g, ''), provider);
    const balance = await provider.getBalance(wallet.address);
    
    console.log('Wallet address:', wallet.address);
    console.log('Wallet balance:', ethers.formatEther(balance), 'ETH');
    
    if (balance < feeWithBuffer) {
      console.log(chalk.red('❌ Insufficient balance! Need at least:', ethers.formatEther(feeWithBuffer), 'ETH'));
      return;
    }

    // Step 4: Release the escrow
    console.log(chalk.cyan('\nStep 4: Releasing escrow...'));
    console.log(chalk.yellow('Press Ctrl+C to cancel, or wait 5 seconds to continue...'));
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\nSending release transaction...');
    
    try {
      const result = await service.releaseEscrow(
        chainId, 
        YOUR_ESCROW_ID, 
        feeWithBuffer,
        privateKey.replace(/['"]/g, '')
      );
      
      console.log(chalk.green('\n✅ Transaction confirmed!'));
      console.log('Transaction hash:', result.txHash);
      console.log('Block number:', result.blockNumber);
      console.log('Gas used:', result.gasUsed);
      
      if (result.method) {
        console.log('Release method:', result.method);
      }
      
      if (result.guid) {
        console.log('LayerZero GUID:', result.guid);
        console.log('\nMonitor cross-chain transfer at:');
        console.log(`https://layerzeroscan.com/tx/${result.txHash}`);
      }
      
      console.log(chalk.cyan('\n🎉 Escrow released successfully!'));
      console.log('The funds should arrive on the target chain in 1-3 minutes.');
      
    } catch (error) {
      console.error(chalk.red('\n❌ Error releasing escrow:'), error.message);
      
      // Try to parse the error for more details
      if (error.data) {
        try {
          const iface = new ethers.Interface([
            'error InsufficientFee(uint256 required, uint256 provided)',
            'error UnauthorizedAccess()',
            'error InvalidEndpointId()',
            'error NoOFTAdapter()'
          ]);
          
          const decoded = iface.parseError(error.data);
          if (decoded) {
            console.error(chalk.red('Contract error:'), decoded.name);
            if (decoded.args) {
              console.error('Error details:', decoded.args);
            }
          }
        } catch (parseError) {
          // Couldn't parse error, show raw data
          console.error('Error data:', error.data);
        }
      }
    }

  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run the script
main().catch(console.error);
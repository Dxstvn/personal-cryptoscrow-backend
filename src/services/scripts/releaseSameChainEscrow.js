#!/usr/bin/env node

import { ethers } from 'ethers';
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

async function main() {
  console.log(chalk.blue('=== Same-Chain Escrow Release ===\n'));
  console.log(chalk.yellow('⚠️  Note: This will release funds on the same chain (Sepolia), not cross-chain\n'));

  // Setup provider with a different RPC to avoid rate limits
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  
  // Setup wallet
  const privateKey = process.env.BACKEND_WALLET_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log(chalk.red('❌ No private key found in environment!'));
    return;
  }
  
  const wallet = new ethers.Wallet(privateKey.replace(/['"]/g, ''), provider);
  console.log('Using wallet:', wallet.address);

  // Contract ABI
  const contractAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'function serviceWallet() view returns (address)',
    'function owner() view returns (address)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address finalToken, uint256 finalAmount, string method, bool withCompose)'
  ];
  
  const contract = new ethers.Contract(YOUR_CONTRACT, contractAbi, wallet);

  try {
    // Step 1: Check escrow details
    console.log(chalk.cyan('\nStep 1: Checking escrow state...'));
    const escrow = await contract.escrows(YOUR_ESCROW_ID);
    
    console.log('Buyer:', escrow.buyer);
    console.log('Seller:', escrow.seller);
    console.log('Amount:', ethers.formatEther(escrow.depositAmount), 'ETH');
    console.log('Net Amount:', ethers.formatEther(escrow.netAmount), 'ETH');
    console.log('Target Chain:', escrow.targetChainId.toString());
    console.log('Condition Met:', escrow.conditionMet ? chalk.green('✅') : chalk.red('❌'));
    console.log('Released:', escrow.released ? chalk.green('✅') : chalk.red('❌'));

    if (escrow.released) {
      console.log(chalk.yellow('\n⚠️  Escrow already released!'));
      return;
    }

    if (!escrow.conditionMet) {
      console.log(chalk.red('\n❌ Condition not met! Cannot release.'));
      return;
    }

    // Step 2: Check authorization
    console.log(chalk.cyan('\nStep 2: Checking authorization...'));
    const serviceWallet = await contract.serviceWallet();
    console.log('Service wallet:', serviceWallet);
    console.log('Your wallet:', wallet.address);
    console.log('Authorized:', serviceWallet.toLowerCase() === wallet.address.toLowerCase() ? chalk.green('✅') : chalk.red('❌'));

    // Step 3: Attempt release
    console.log(chalk.cyan('\nStep 3: Attempting release...'));
    console.log(chalk.yellow('This will release funds on Sepolia (same chain)'));
    console.log(chalk.yellow('Press Ctrl+C to cancel, or wait 5 seconds...'));
    await new Promise(resolve => setTimeout(resolve, 5000));

    // For same-chain release, we don't need to send any ETH value
    console.log('\nSending release transaction...');
    const tx = await contract.releaseEscrow(YOUR_ESCROW_ID, {
      gasLimit: 300000
    });
    
    console.log('Transaction hash:', tx.hash);
    console.log('Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log(chalk.green('\n✅ Transaction confirmed!'));
    console.log('Block number:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
    
    // Parse events
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowReleased') {
          console.log(chalk.green('\n🎉 Escrow Released!'));
          console.log('Seller received:', ethers.formatEther(parsed.args.finalAmount), parsed.args.finalToken === ethers.ZeroAddress ? 'ETH' : 'tokens');
          console.log('Method:', parsed.args.method);
          break;
        }
      } catch {}
    }
    
    // Check final balance
    const sellerBalance = await provider.getBalance(escrow.seller);
    console.log('\nSeller balance:', ethers.formatEther(sellerBalance), 'ETH');

  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    
    // Try to decode the error
    if (error.data) {
      try {
        const errorAbi = [
          'error OnlyServiceWallet()',
          'error EscrowNotFound()',
          'error ConditionNotMet()',
          'error AlreadyReleased()',
          'error TransferFailed()'
        ];
        
        const iface = new ethers.Interface(errorAbi);
        const decoded = iface.parseError(error.data);
        if (decoded) {
          console.error(chalk.red('Contract error:'), decoded.name);
        }
      } catch {
        console.error('Raw error data:', error.data);
      }
    }
    
    if (error.reason) {
      console.error('Reason:', error.reason);
    }
  }
}

// Run the script
main().catch(console.error);
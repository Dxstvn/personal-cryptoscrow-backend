#!/usr/bin/env node
/**
 * Release escrow now that we have WETH in the contract
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
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

async function main() {
  console.log(chalk.blue('🚀 Releasing Escrow with WETH'));
  console.log(chalk.blue('============================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  // Check current state
  const wethContract = new ethers.Contract(WETH_ADDRESS, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  
  const wethBalance = await wethContract.balanceOf(ESCROW_ADDRESS);
  console.log(chalk.cyan(`Escrow WETH balance: ${formatEther(wethBalance)}\n`));
  
  // Escrow contract
  const escrowAbi = [
    'function releaseEscrow(bytes32 escrowId) payable',
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed recipient, address token, uint256 amount, string method, bool isCompose)',
    'event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 indexed targetChainId, address indexed oftAdapter, bytes32 guid, bool useCompose)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, wallet);
  
  try {
    // Check if already released
    const details = await escrow.escrows(ESCROW_ID);
    if (details.released) {
      console.log(chalk.yellow('⚠️  Escrow already released'));
      return;
    }
    
    console.log(chalk.cyan('Escrow Details:'));
    console.log(`├─ Seller: ${details.seller}`);
    console.log(`├─ Target Token: ${details.targetToken}`);
    console.log(`├─ Target Chain: ${details.targetChainId}`);
    console.log(`└─ Net Amount: ${formatEther(details.netAmount)}\n`);
    
    // Try to release with recommended fee
    const fee = parseEther('0.003'); // Based on LayerZero quote
    console.log(chalk.yellow(`Attempting release with ${formatEther(fee)} ETH fee...\n`));
    
    const tx = await escrow.releaseEscrow(ESCROW_ID, {
      value: fee,
      gasLimit: 2000000
    });
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log('Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(chalk.green('\n✅ Transaction successful!'));
      
      // Parse events
      for (const log of receipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed) {
            console.log(chalk.cyan(`\nEvent: ${parsed.name}`));
            if (parsed.name === 'CrossChainTransferInitiated') {
              console.log(`├─ Escrow ID: ${parsed.args.escrowId}`);
              console.log(`├─ Target Chain: ${parsed.args.targetChainId}`);
              console.log(`├─ OFT Adapter: ${parsed.args.oftAdapter}`);
              console.log(`├─ LayerZero GUID: ${parsed.args.guid}`);
              console.log(`└─ Using Composer: ${parsed.args.useCompose}`);
            } else if (parsed.name === 'EscrowReleased') {
              console.log(`├─ Recipient: ${parsed.args.recipient}`);
              console.log(`├─ Token: ${parsed.args.token}`);
              console.log(`├─ Amount: ${formatEther(parsed.args.amount)}`);
              console.log(`├─ Method: ${parsed.args.method}`);
              console.log(`└─ Is Compose: ${parsed.args.isCompose}`);
            }
          }
        } catch (e) {}
      }
      
      console.log(chalk.blue('\n📋 Summary'));
      console.log(chalk.blue('========='));
      console.log('✅ Escrow successfully released!');
      console.log('✅ Cross-chain transfer initiated via LayerZero');
      console.log('✅ Composer will automatically convert WETH → USDC on Arbitrum');
      console.log(`✅ Seller (${details.seller}) will receive USDC`);
      
      console.log(chalk.cyan('\n🔍 Track on LayerZero Scan:'));
      console.log(`https://testnet.layerzeroscan.com/tx/${tx.hash}`);
      
    } else {
      console.log(chalk.red('❌ Transaction failed'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    if (error.data) {
      console.log('Error data:', error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
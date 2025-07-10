#!/usr/bin/env node
/**
 * Check escrow state and debug release issues
 */

import { ethers, formatEther } from 'ethers';
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
  console.log(chalk.blue('🔍 Checking Escrow State'));
  console.log(chalk.blue('=======================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function oftAdapters(uint32) view returns (address)',
    'function swapComposers(uint32) view returns (address)',
    'function chainIdToEndpointId(uint256) view returns (uint32)',
    'function releaseEscrow(bytes32 escrowId) payable'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, wallet);
  
  try {
    // Check escrow details
    const details = await escrow.escrows(ESCROW_ID);
    console.log(chalk.cyan('Escrow Details:'));
    console.log(`├─ Buyer: ${details.buyer}`);
    console.log(`├─ Seller: ${details.seller}`);
    console.log(`├─ Deposit Token: ${details.depositToken}`);
    console.log(`├─ Deposit Amount: ${formatEther(details.depositAmount)} ETH`);
    console.log(`├─ Net Amount: ${formatEther(details.netAmount)} ETH`);
    console.log(`├─ Target Token: ${details.targetToken}`);
    console.log(`├─ Target Chain ID: ${details.targetChainId}`);
    console.log(`├─ Released: ${details.released}`);
    console.log(`└─ Condition Met: ${details.conditionMet}\n`);
    
    // Check endpoint mapping
    const endpointId = await escrow.chainIdToEndpointId(details.targetChainId);
    console.log(chalk.cyan('Chain Configuration:'));
    console.log(`├─ Target Endpoint ID: ${endpointId}`);
    
    // Check OFT adapter
    const sourceEndpointId = await escrow.chainIdToEndpointId(11155111); // Sepolia
    const oftAdapter = await escrow.oftAdapters(sourceEndpointId);
    console.log(`├─ Source Endpoint ID: ${sourceEndpointId}`);
    console.log(`├─ OFT Adapter: ${oftAdapter}`);
    
    // Check composer
    const composer = await escrow.swapComposers(endpointId);
    console.log(`└─ Composer: ${composer}\n`);
    
    // Check if ready to release
    if (details.released) {
      console.log(chalk.yellow('⚠️  Escrow already released'));
    } else if (!details.conditionMet) {
      console.log(chalk.yellow('⚠️  Condition not met'));
    } else {
      console.log(chalk.green('✅ Ready to release'));
      
      // Try to estimate gas
      console.log(chalk.cyan('\nEstimating release gas...'));
      try {
        const gasEstimate = await escrow.releaseEscrow.estimateGas(ESCROW_ID, {
          value: ethers.parseEther('0.01')
        });
        console.log(`Estimated gas: ${gasEstimate.toString()}`);
      } catch (error) {
        console.log(chalk.red('❌ Gas estimation failed:'), error.message);
        if (error.reason) console.log('Reason:', error.reason);
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
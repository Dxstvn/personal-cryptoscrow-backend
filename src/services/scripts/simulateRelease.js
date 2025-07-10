#!/usr/bin/env node
/**
 * Simulate release to get exact error
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
  console.log(chalk.blue('🔬 Simulating Release'));
  console.log(chalk.blue('===================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  // Full escrow ABI including error definitions
  const escrowAbi = [
    'function releaseEscrow(bytes32 escrowId) payable',
    'error UnauthorizedCaller()',
    'error EscrowNotFound()',
    'error EscrowAlreadyReleased()',
    'error ConditionNotMet()',
    'error InvalidRecipient()',
    'error InvalidAmount()',
    'error InvalidChainId()',
    'error InsufficientFee()'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, wallet);
  
  try {
    console.log(chalk.cyan('Attempting static call first...'));
    
    // Try a static call to see if it would revert
    try {
      await escrow.releaseEscrow.staticCall(ESCROW_ID, { value: parseEther('0.01') });
      console.log(chalk.green('✅ Static call succeeded'));
    } catch (error) {
      console.log(chalk.red('❌ Static call failed:'));
      console.log('Error:', error.message);
      
      if (error.data) {
        console.log('Error data:', error.data);
        
        // Try to decode the error
        try {
          const decodedError = escrow.interface.parseError(error.data);
          if (decodedError) {
            console.log(chalk.yellow('Decoded error:', decodedError.name));
          }
        } catch (e) {
          console.log('Could not decode error');
        }
      }
      
      // Check if it's a custom error
      if (error.reason) {
        console.log(chalk.yellow('Revert reason:', error.reason));
      }
    }
    
    // Try with eth_call to get more details
    console.log(chalk.cyan('\nTrying eth_call directly...'));
    
    const txData = escrow.interface.encodeFunctionData('releaseEscrow', [ESCROW_ID]);
    
    try {
      const result = await provider.call({
        to: ESCROW_ADDRESS,
        data: txData,
        value: parseEther('0.01'),
        from: wallet.address
      });
      console.log('Call result:', result);
    } catch (error) {
      console.log(chalk.red('eth_call failed:'));
      console.log('Error:', error);
      
      // Try to get revert reason from error
      if (error.data) {
        // Remove '0x' and check if it's a string revert
        const errorData = error.data.slice(2);
        
        // Check for Error(string) selector (08c379a0)
        if (errorData.startsWith('08c379a0')) {
          // Decode string error
          const stringData = '0x' + errorData.slice(8);
          try {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], stringData);
            console.log(chalk.yellow('Revert message:', decoded[0]));
          } catch (e) {}
        }
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
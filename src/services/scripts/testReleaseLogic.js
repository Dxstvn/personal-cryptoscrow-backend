#!/usr/bin/env node
/**
 * Test the release logic step by step
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
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const ESCROW_ID = '0x1b81e1faaf7525a3c3572504e54b475c7b5e0b83eb12f696155ac8b5fbddb50a';

async function main() {
  console.log(chalk.blue('🔬 Testing Release Logic'));
  console.log(chalk.blue('======================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  // Check balances
  console.log(chalk.cyan('Balance Check:'));
  const escrowETHBalance = await provider.getBalance(ESCROW_ADDRESS);
  console.log(`├─ Escrow ETH: ${formatEther(escrowETHBalance)}`);
  
  const wethContract = new ethers.Contract(WETH_ADDRESS, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  
  const escrowWETHBalance = await wethContract.balanceOf(ESCROW_ADDRESS);
  console.log(`└─ Escrow WETH: ${formatEther(escrowWETHBalance)}\n`);
  
  // The issue is likely that WETH.deposit{value: escrow.netAmount}() is being called
  // but the ETH is in the contract, not being sent with the transaction
  
  console.log(chalk.yellow('Issue Analysis:'));
  console.log('The contract holds 0.00098 ETH from the deposit');
  console.log('But WETH.deposit{value: escrow.netAmount}() expects ETH to be sent with the call');
  console.log('This is a contract bug - it should use the contract\'s balance\n');
  
  // Let's try to manually wrap the ETH for the escrow
  console.log(chalk.cyan('Attempting Manual WETH Wrap for Escrow:'));
  
  const wethAbi = [
    'function deposit() payable',
    'function transfer(address to, uint256 amount) returns (bool)'
  ];
  
  const weth = new ethers.Contract(WETH_ADDRESS, wethAbi, wallet);
  
  try {
    // Send ETH to escrow and wrap it
    const wrapAmount = parseEther('0.00098');
    console.log(`Wrapping ${formatEther(wrapAmount)} ETH to WETH for escrow...`);
    
    const tx = await weth.deposit({ value: wrapAmount });
    console.log(`Wrap tx: ${tx.hash}`);
    await tx.wait();
    
    // Transfer WETH to escrow
    console.log('Transferring WETH to escrow...');
    const transferTx = await weth.transfer(ESCROW_ADDRESS, wrapAmount);
    console.log(`Transfer tx: ${transferTx.hash}`);
    await transferTx.wait();
    
    // Check new balance
    const newWETHBalance = await wethContract.balanceOf(ESCROW_ADDRESS);
    console.log(`\n✅ Escrow WETH balance: ${formatEther(newWETHBalance)}`);
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
  }
  
  console.log(chalk.yellow('\n📝 Contract Fix Needed:'));
  console.log('The _prepareWETHForBridge function should be:');
  console.log('```solidity');
  console.log('if (escrow.depositToken == address(0)) {');
  console.log('    // The ETH is already in the contract from deposit');
  console.log('    IWETH(WETH).deposit{value: escrow.netAmount}();');
  console.log('    return escrow.netAmount;');
  console.log('}');
  console.log('```\n');
  console.log('The contract needs to be redeployed with this fix.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
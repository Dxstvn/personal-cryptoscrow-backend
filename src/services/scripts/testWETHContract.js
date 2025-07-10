#!/usr/bin/env node
/**
 * Test WETH contract functionality
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

const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const ESCROW_ADDRESS = '0x726ca2162A5B90718EF11Ab8f294c0f30E258208';

async function main() {
  console.log(chalk.blue('🔍 Testing WETH Contract'));
  console.log(chalk.blue('======================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  const wethAbi = [
    'function deposit() payable',
    'function withdraw(uint256) external',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)'
  ];
  
  const weth = new ethers.Contract(WETH_ADDRESS, wethAbi, wallet);
  
  try {
    // Check if WETH contract exists
    const code = await provider.getCode(WETH_ADDRESS);
    console.log(chalk.cyan('WETH contract exists:'), code !== '0x' ? 'Yes' : 'No');
    
    if (code === '0x') {
      console.log(chalk.red('❌ WETH contract not found at address!'));
      
      // Try alternative WETH addresses for Sepolia
      const alternativeWETH = [
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Mainnet WETH
        '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // Another Sepolia WETH
        '0xD0dF82dE051244f04BfF3A8bB1f62E1cD39eED92'  // Yet another
      ];
      
      console.log(chalk.yellow('\nChecking alternative WETH addresses...'));
      for (const addr of alternativeWETH) {
        const altCode = await provider.getCode(addr);
        if (altCode !== '0x') {
          console.log(chalk.green(`✅ Found WETH at: ${addr}`));
        }
      }
      return;
    }
    
    // Test deposit function
    console.log(chalk.cyan('\nTesting WETH deposit...'));
    const depositAmount = parseEther('0.0001');
    
    const balanceBefore = await weth.balanceOf(wallet.address);
    console.log(`WETH balance before: ${formatEther(balanceBefore)}`);
    
    const tx = await weth.deposit({ value: depositAmount });
    console.log(`Deposit tx: ${tx.hash}`);
    await tx.wait();
    
    const balanceAfter = await weth.balanceOf(wallet.address);
    console.log(`WETH balance after: ${formatEther(balanceAfter)}`);
    console.log(chalk.green('✅ WETH deposit successful!'));
    
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
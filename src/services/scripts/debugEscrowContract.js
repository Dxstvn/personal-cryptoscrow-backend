#!/usr/bin/env node
/**
 * Debug escrow contract state
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
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const OFT_ADAPTER = '0x7612fc49B82D42623468BB966E0d59a7D35eA8b9';

async function main() {
  console.log(chalk.blue('🔍 Debugging Escrow Contract'));
  console.log(chalk.blue('==========================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Check ETH balance
  const ethBalance = await provider.getBalance(ESCROW_ADDRESS);
  console.log(chalk.cyan('Escrow ETH Balance:'), formatEther(ethBalance), 'ETH');
  
  // Check WETH balance
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)'
  ];
  
  const weth = new ethers.Contract(WETH_ADDRESS, wethAbi, provider);
  
  const wethBalance = await weth.balanceOf(ESCROW_ADDRESS);
  console.log(chalk.cyan('Escrow WETH Balance:'), formatEther(wethBalance), 'WETH');
  
  // Check WETH allowance to OFT adapter
  const allowance = await weth.allowance(ESCROW_ADDRESS, OFT_ADAPTER);
  console.log(chalk.cyan('WETH Allowance to OFT:'), formatEther(allowance), 'WETH');
  
  // Check contract bytecode
  const bytecode = await provider.getCode(ESCROW_ADDRESS);
  console.log(chalk.cyan('\nContract deployed:'), bytecode !== '0x' ? 'Yes' : 'No');
  console.log(chalk.cyan('Bytecode length:'), bytecode.length);
  
  // Try to get more error details by calling the contract directly
  console.log(chalk.yellow('\n📝 Checking contract interfaces...'));
  
  const escrowAbi = [
    'function WETH() view returns (address)',
    'function uniswapRouter() view returns (address)',
    'function serviceWallet() view returns (address)',
    'function owner() view returns (address)',
    'function maxSlippageBps() view returns (uint256)',
    'function lzReceiveGas() view returns (uint128)',
    'function lzComposeGas() view returns (uint128)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, provider);
  
  try {
    const wethAddr = await escrow.WETH();
    console.log(`WETH address: ${wethAddr}`);
    
    const router = await escrow.uniswapRouter();
    console.log(`Uniswap Router: ${router}`);
    
    const serviceWallet = await escrow.serviceWallet();
    console.log(`Service Wallet: ${serviceWallet}`);
    
    const owner = await escrow.owner();
    console.log(`Owner: ${owner}`);
    
    const slippage = await escrow.maxSlippageBps();
    console.log(`Max Slippage: ${slippage.toString()} bps`);
    
    const lzReceive = await escrow.lzReceiveGas();
    console.log(`LZ Receive Gas: ${lzReceive.toString()}`);
    
    const lzCompose = await escrow.lzComposeGas();
    console.log(`LZ Compose Gas: ${lzCompose.toString()}`);
    
  } catch (error) {
    console.log(chalk.red('Error reading contract state:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
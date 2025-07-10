#!/usr/bin/env node
/**
 * Debug WETH balance issue
 */
const hre = require('hardhat');
const chalk = require('chalk');

const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

async function main() {
  console.log(chalk.blue('🔍 Debugging WETH Balance'));
  console.log(chalk.blue('========================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // WETH ABI
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Deposit(address indexed dst, uint256 wad)'
  ];
  
  const weth = new hre.ethers.Contract(WETH_ADDRESS, wethAbi, provider);
  
  // Check balances
  const wethBalance = await weth.balanceOf(ESCROW_ADDRESS);
  const ethBalance = await provider.getBalance(ESCROW_ADDRESS);
  
  console.log(`Contract: ${ESCROW_ADDRESS}`);
  console.log(`├─ ETH Balance: ${hre.ethers.formatEther(ethBalance)} ETH`);
  console.log(`└─ WETH Balance: ${hre.ethers.formatEther(wethBalance)} WETH`);
  
  // Get recent blocks to check for WETH events
  const currentBlock = await provider.getBlockNumber();
  console.log(`\n📋 Checking recent WETH events (blocks ${currentBlock - 100} to ${currentBlock})...`);
  
  // Check Deposit events TO the escrow
  const depositFilter = weth.filters.Deposit(ESCROW_ADDRESS);
  const deposits = await weth.queryFilter(depositFilter, currentBlock - 100, currentBlock);
  
  console.log(`\n💰 WETH Deposits to Escrow: ${deposits.length}`);
  for (const event of deposits) {
    console.log(`├─ Block ${event.blockNumber}: ${hre.ethers.formatEther(event.args.wad)} WETH`);
    console.log(`│  Tx: ${event.transactionHash}`);
  }
  
  // Check Transfer events FROM the escrow
  const transferFromFilter = weth.filters.Transfer(ESCROW_ADDRESS, null);
  const transfersFrom = await weth.queryFilter(transferFromFilter, currentBlock - 100, currentBlock);
  
  console.log(`\n📤 WETH Transfers from Escrow: ${transfersFrom.length}`);
  for (const event of transfersFrom) {
    console.log(`├─ Block ${event.blockNumber}: ${hre.ethers.formatEther(event.args.value)} WETH to ${event.args.to}`);
    console.log(`│  Tx: ${event.transactionHash}`);
  }
  
  // Check Transfer events TO the escrow
  const transferToFilter = weth.filters.Transfer(null, ESCROW_ADDRESS);
  const transfersTo = await weth.queryFilter(transferToFilter, currentBlock - 100, currentBlock);
  
  console.log(`\n📥 WETH Transfers to Escrow: ${transfersTo.length}`);
  for (const event of transfersTo) {
    console.log(`├─ Block ${event.blockNumber}: ${hre.ethers.formatEther(event.args.value)} WETH from ${event.args.from}`);
    console.log(`│  Tx: ${event.transactionHash}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
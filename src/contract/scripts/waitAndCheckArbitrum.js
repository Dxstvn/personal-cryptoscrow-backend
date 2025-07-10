#!/usr/bin/env node
/**
 * Wait and check Arbitrum for WETH arrival
 */
const hre = require('hardhat');
const chalk = require('chalk');

const SELLER_ADDRESS = '0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC';
const ARBITRUM_WETH = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';
const TX_HASH = '0x6b7d8eaaa5259187b694e4c631df59d02dd9e3653ef93fcfc3b2572832c0e60d';

async function checkBalance() {
  const provider = new hre.ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const weth = new hre.ethers.Contract(ARBITRUM_WETH, ['function balanceOf(address) view returns (uint256)'], provider);
  const balance = await weth.balanceOf(SELLER_ADDRESS);
  return hre.ethers.formatEther(balance);
}

async function main() {
  console.log(chalk.blue('⏳ Monitoring Arbitrum WETH Balance'));
  console.log(chalk.blue('==================================\n'));
  
  console.log(`Transaction: ${TX_HASH}`);
  console.log(chalk.cyan('🔍 Track on LayerZero:'));
  console.log(`https://testnet.layerzeroscan.com/tx/${TX_HASH}\n`);
  
  console.log(`Monitoring ${SELLER_ADDRESS} on Arbitrum...`);
  
  let previousBalance = '0.0';
  let attempts = 0;
  const maxAttempts = 12; // 2 minutes
  
  const interval = setInterval(async () => {
    attempts++;
    const currentBalance = await checkBalance();
    
    if (currentBalance !== previousBalance) {
      console.log(chalk.green(`\n✅ Balance changed! New balance: ${currentBalance} WETH`));
      clearInterval(interval);
    } else if (attempts >= maxAttempts) {
      console.log(chalk.yellow(`\n⏱️  Timeout after ${attempts * 10} seconds`));
      console.log(`Final balance: ${currentBalance} WETH`);
      console.log('\nCheck LayerZero scan for transaction status');
      clearInterval(interval);
    } else {
      process.stdout.write('.');
    }
    
    previousBalance = currentBalance;
  }, 10000); // Check every 10 seconds
  
  // Initial check
  const initialBalance = await checkBalance();
  console.log(`Starting balance: ${initialBalance} WETH`);
  console.log('Checking every 10 seconds...');
}

main().catch((error) => {
  console.error(chalk.red('❌ Error:'), error);
  process.exit(1);
});
#!/usr/bin/env node
/**
 * Check WETH balance on Arbitrum
 */
const hre = require('hardhat');
const chalk = require('chalk');

const SELLER_ADDRESS = '0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC';
const ARBITRUM_WETH = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';
const ARBITRUM_OFT = '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B';

async function main() {
  console.log(chalk.blue('💰 Checking Arbitrum WETH Balances'));
  console.log(chalk.blue('================================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  ];
  
  const weth = new hre.ethers.Contract(ARBITRUM_WETH, wethAbi, provider);
  
  // Check balances
  const sellerBalance = await weth.balanceOf(SELLER_ADDRESS);
  const oftBalance = await weth.balanceOf(ARBITRUM_OFT);
  
  console.log(`Seller (${SELLER_ADDRESS}):`);
  console.log(`└─ WETH: ${hre.ethers.formatEther(sellerBalance)}`);
  
  console.log(`\nOFT Adapter (${ARBITRUM_OFT}):`);
  console.log(`└─ WETH: ${hre.ethers.formatEther(oftBalance)}`);
  
  // Check recent transfer events
  const currentBlock = await provider.getBlockNumber();
  console.log(`\n📋 Recent WETH transfers to seller (last 100 blocks):`);
  
  const transferFilter = weth.filters.Transfer(null, SELLER_ADDRESS);
  const transfers = await weth.queryFilter(transferFilter, currentBlock - 100, currentBlock);
  
  if (transfers.length > 0) {
    for (const event of transfers) {
      console.log(`\n✅ Transfer found!`);
      console.log(`├─ From: ${event.args.from}`);
      console.log(`├─ Amount: ${hre.ethers.formatEther(event.args.value)} WETH`);
      console.log(`├─ Block: ${event.blockNumber}`);
      console.log(`└─ Tx: ${event.transactionHash}`);
    }
  } else {
    console.log('No recent transfers found');
    
    // Check OFT events
    console.log(`\n📋 Recent WETH transfers from OFT (last 100 blocks):`);
    const oftTransferFilter = weth.filters.Transfer(ARBITRUM_OFT, null);
    const oftTransfers = await weth.queryFilter(oftTransferFilter, currentBlock - 100, currentBlock);
    
    if (oftTransfers.length > 0) {
      for (const event of oftTransfers) {
        console.log(`\n📤 OFT Transfer:`);
        console.log(`├─ To: ${event.args.to}`);
        console.log(`├─ Amount: ${hre.ethers.formatEther(event.args.value)} WETH`);
        console.log(`└─ Tx: ${event.transactionHash}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
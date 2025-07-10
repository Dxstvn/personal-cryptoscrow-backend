#!/usr/bin/env node
/**
 * Check Uniswap liquidity on testnets
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Check Uniswap Liquidity'));
  console.log('==========================\n');
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let config;
  if (chainId === 11155111) {
    config = {
      name: 'Sepolia',
      weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
      usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590'
    };
  } else if (chainId === 421614) {
    config = {
      name: 'Arbitrum Sepolia',
      weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
      uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      usdc: '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773'
    };
  } else {
    throw new Error('Unsupported network');
  }
  
  console.log('📍 Network:', config.name);
  console.log('├─ WETH:', config.weth);
  console.log('├─ USDC:', config.usdc);
  console.log('└─ Router:', config.uniswapRouter);
  
  const router = await hre.ethers.getContractAt([
    'function factory() external view returns (address)',
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
    'function WETH() external view returns (address)'
  ], config.uniswapRouter);
  
  // Check factory
  console.log(chalk.blue('\n1️⃣ Router Configuration:'));
  try {
    const factory = await router.factory();
    const wethFromRouter = await router.WETH();
    console.log('├─ Factory:', factory);
    console.log('└─ WETH from Router:', wethFromRouter);
  } catch (error) {
    console.log(chalk.red('❌ Error getting router config:'), error.message);
  }
  
  // Check if there's a pair
  console.log(chalk.blue('\n2️⃣ Check WETH/USDC Pair:'));
  try {
    const factory = await hre.ethers.getContractAt([
      'function getPair(address, address) external view returns (address)'
    ], await router.factory());
    
    const pair = await factory.getPair(config.weth, config.usdc);
    console.log('├─ Pair address:', pair);
    
    if (pair !== hre.ethers.ZeroAddress) {
      // Get pair reserves
      const pairContract = await hre.ethers.getContractAt([
        'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() external view returns (address)',
        'function token1() external view returns (address)'
      ], pair);
      
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      const reserves = await pairContract.getReserves();
      
      console.log('├─ Token0:', token0);
      console.log('├─ Token1:', token1);
      console.log('├─ Reserve0:', reserves.reserve0.toString());
      console.log('└─ Reserve1:', reserves.reserve1.toString());
      
      // Calculate rough price
      if (token0.toLowerCase() === config.weth.toLowerCase()) {
        const wethReserve = hre.ethers.formatEther(reserves.reserve0);
        const usdcReserve = hre.ethers.formatUnits(reserves.reserve1, 6);
        console.log('\n📊 Liquidity:');
        console.log('├─ WETH:', wethReserve);
        console.log('├─ USDC:', usdcReserve);
        if (Number(wethReserve) > 0) {
          console.log('└─ Price: ~$', (Number(usdcReserve) / Number(wethReserve)).toFixed(2), 'per ETH');
        }
      }
    } else {
      console.log(chalk.yellow('⚠️  No WETH/USDC pair found!'));
    }
  } catch (error) {
    console.log(chalk.red('❌ Error checking pair:'), error.message);
  }
  
  // Try different paths
  console.log(chalk.blue('\n3️⃣ Test Swap Quotes:'));
  
  // Test direct WETH → USDC
  console.log('\n📈 Direct WETH → USDC:');
  try {
    const path = [config.weth, config.usdc];
    const amountIn = hre.ethers.parseEther('0.01');
    const amounts = await router.getAmountsOut(amountIn, path);
    console.log('├─ Input:', hre.ethers.formatEther(amounts[0]), 'WETH');
    console.log('└─ Output:', hre.ethers.formatUnits(amounts[1], 6), 'USDC');
  } catch (error) {
    console.log(chalk.red('❌ No direct path available'));
  }
  
  // Check token balances for context
  console.log(chalk.blue('\n4️⃣ Check Token Balances:'));
  const [signer] = await hre.ethers.getSigners();
  
  try {
    const weth = await hre.ethers.getContractAt('IERC20', config.weth);
    const usdc = await hre.ethers.getContractAt('IERC20', config.usdc);
    
    const ethBalance = await signer.provider.getBalance(signer.address);
    const wethBalance = await weth.balanceOf(signer.address);
    const usdcBalance = await usdc.balanceOf(signer.address);
    
    console.log('├─ ETH:', hre.ethers.formatEther(ethBalance));
    console.log('├─ WETH:', hre.ethers.formatEther(wethBalance));
    console.log('└─ USDC:', hre.ethers.formatUnits(usdcBalance, 6));
  } catch (error) {
    console.log(chalk.red('❌ Error checking balances:'), error.message);
  }
  
  // Summary
  console.log(chalk.yellow('\n📋 Summary:'));
  console.log('├─ Network:', config.name);
  console.log('├─ Uniswap V2 deployment:', config.uniswapRouter);
  console.log('└─ Note: Testnet liquidity may be limited or non-existent');
  console.log('\n💡 For testing swaps, you may need to:');
  console.log('   1. Add liquidity to WETH/USDC pair');
  console.log('   2. Use a different DEX with testnet liquidity');
  console.log('   3. Mock the swap functionality for testing');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
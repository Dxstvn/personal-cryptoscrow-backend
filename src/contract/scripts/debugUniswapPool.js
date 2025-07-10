#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Debug Uniswap Pool'));
  
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    pair: '0xD34398848d35b2bD2CA373c809dC4D8E0523B00f'
  };
  
  // Get pair info
  const pair = await hre.ethers.getContractAt([
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)',
    'function totalSupply() external view returns (uint256)'
  ], config.pair);
  
  const token0 = await pair.token0();
  const token1 = await pair.token1();
  const reserves = await pair.getReserves();
  const totalSupply = await pair.totalSupply();
  
  console.log('\nPair Info:');
  console.log('Token0:', token0, token0.toLowerCase() === config.usdc.toLowerCase() ? '(USDC)' : '(WETH)');
  console.log('Token1:', token1, token1.toLowerCase() === config.usdc.toLowerCase() ? '(USDC)' : '(WETH)');
  console.log('Total LP Supply:', hre.ethers.formatEther(totalSupply));
  
  // Calculate correct reserves
  const reserve0 = BigInt(reserves.reserve0.toString());
  const reserve1 = BigInt(reserves.reserve1.toString());
  
  console.log('\nRaw Reserves:');
  console.log('Reserve0:', reserve0.toString());
  console.log('Reserve1:', reserve1.toString());
  
  // Format based on token order
  if (token0.toLowerCase() === config.usdc.toLowerCase()) {
    console.log('\nFormatted Reserves:');
    console.log('USDC:', hre.ethers.formatUnits(reserve0, 6));
    console.log('WETH:', hre.ethers.formatEther(reserve1));
    
    const price = Number(hre.ethers.formatUnits(reserve0, 6)) / Number(hre.ethers.formatEther(reserve1));
    console.log('Price:', price.toFixed(2), 'USDC/ETH');
  } else {
    console.log('\nFormatted Reserves:');
    console.log('WETH:', hre.ethers.formatEther(reserve0));
    console.log('USDC:', hre.ethers.formatUnits(reserve1, 6));
    
    const price = Number(hre.ethers.formatUnits(reserve1, 6)) / Number(hre.ethers.formatEther(reserve0));
    console.log('Price:', price.toFixed(2), 'USDC/ETH');
  }
  
  // Test router with small amounts
  const router = await hre.ethers.getContractAt([
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
    'function WETH() external view returns (address)'
  ], config.router);
  
  console.log('\nRouter Info:');
  const routerWETH = await router.WETH();
  console.log('Router WETH:', routerWETH);
  
  // Try different swap amounts
  console.log('\nTesting Swap Quotes:');
  const amounts = ['0.0001', '0.001', '0.01'];
  
  for (const amount of amounts) {
    try {
      const amountIn = hre.ethers.parseEther(amount);
      const path = [config.weth, config.usdc];
      const quote = await router.getAmountsOut(amountIn, path);
      
      console.log(`\n${amount} ETH → USDC:`);
      console.log('└─ Output:', hre.ethers.formatUnits(quote[1], 6), 'USDC');
    } catch (error) {
      console.log(`\n${amount} ETH → USDC: ❌ Failed`);
      console.log('└─ Error:', error.reason || error.message);
    }
  }
  
  // Check if we can swap USDC to ETH
  console.log('\nReverse Quote (100 USDC → ETH):');
  try {
    const usdcAmount = hre.ethers.parseUnits('100', 6);
    const reversePath = [config.usdc, config.weth];
    const reverseQuote = await router.getAmountsOut(usdcAmount, reversePath);
    console.log('└─ Output:', hre.ethers.formatEther(reverseQuote[1]), 'ETH');
  } catch (error) {
    console.log('└─ Error:', error.reason || error.message);
  }
}

main().catch(console.error);
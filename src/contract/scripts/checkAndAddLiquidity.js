#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Check Pool & Add Liquidity'));
  
  const [signer] = await hre.ethers.getSigners();
  
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6'
  };
  
  // Check if pool exists
  const factory = await hre.ethers.getContractAt([
    'function getPair(address, address) external view returns (address)'
  ], config.factory);
  
  const pairAddress = await factory.getPair(config.weth, config.usdc);
  console.log('Pair address:', pairAddress);
  
  if (pairAddress === hre.ethers.ZeroAddress) {
    console.log('No pool exists, creating new pool...');
    
    // Get contracts
    const weth = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', config.weth);
    const usdc = await hre.ethers.getContractAt('IERC20', config.usdc);
    const router = await hre.ethers.getContractAt([
      'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)'
    ], config.router);
    
    // Smaller amounts for testing
    const wethAmount = hre.ethers.parseEther('0.01'); // 0.01 WETH
    const usdcAmount = hre.ethers.parseUnits('25', 6); // 25 USDC
    
    // Wrap ETH if needed
    const wethBalance = await weth.balanceOf(signer.address);
    if (wethBalance < wethAmount) {
      console.log('Wrapping ETH...');
      await (await weth.deposit({ value: wethAmount - wethBalance })).wait();
    }
    
    // Approve
    console.log('Approving tokens...');
    await (await weth.approve(config.router, wethAmount)).wait();
    await (await usdc.approve(config.router, usdcAmount)).wait();
    
    // Add liquidity with very flexible parameters
    try {
      const tx = await router.addLiquidity(
        config.weth,
        config.usdc,
        wethAmount,
        usdcAmount,
        1, // Accept almost any amount
        1, // Accept almost any amount
        signer.address,
        Math.floor(Date.now() / 1000) + 3600
      );
      
      console.log('Adding liquidity...');
      console.log('Tx:', tx.hash);
      await tx.wait();
      console.log('✅ Liquidity added!');
    } catch (error) {
      console.log('Error details:', error);
      
      // Try to decode the error
      if (error.data) {
        console.log('Error data:', error.data);
      }
    }
  } else {
    console.log('Pool already exists at:', pairAddress);
    
    // Check pool reserves
    const pair = await hre.ethers.getContractAt([
      'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
      'function token0() external view returns (address)',
      'function token1() external view returns (address)'
    ], pairAddress);
    
    const reserves = await pair.getReserves();
    const token0 = await pair.token0();
    const token1 = await pair.token1();
    
    console.log('\nPool Info:');
    console.log('Token0:', token0);
    console.log('Token1:', token1);
    console.log('Reserve0:', reserves.reserve0.toString());
    console.log('Reserve1:', reserves.reserve1.toString());
  }
}

main().catch(console.error);
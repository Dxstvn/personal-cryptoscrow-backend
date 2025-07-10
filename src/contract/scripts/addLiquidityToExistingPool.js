#!/usr/bin/env node
/**
 * Add liquidity to existing WETH/USDC pool
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('💧 Add Liquidity to Existing Pool'));
  console.log('================================\n');
  
  const [signer] = await hre.ethers.getSigners();
  
  // Configuration
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    pair: '0xD34398848d35b2bD2CA373c809dC4D8E0523B00f' // Existing pool
  };
  
  // Get contracts
  const weth = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', config.weth);
  const usdc = await hre.ethers.getContractAt('IERC20', config.usdc);
  const router = await hre.ethers.getContractAt([
    'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)'
  ], config.router);
  
  // Check pool current state
  const pair = await hre.ethers.getContractAt([
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)'
  ], config.pair);
  
  const reserves = await pair.getReserves();
  const token0 = await pair.token0();
  
  console.log('📊 Current Pool State:');
  if (token0.toLowerCase() === config.usdc.toLowerCase()) {
    console.log('├─ USDC Reserve:', hre.ethers.formatUnits(reserves.reserve0, 6));
    console.log('├─ WETH Reserve:', hre.ethers.formatEther(reserves.reserve1));
    
    // Calculate amounts to match current ratio
    const currentRatio = reserves.reserve0 * BigInt(1e12) / reserves.reserve1; // Adjust for decimals
    console.log('└─ Current Ratio:', currentRatio.toString(), 'USDC per WETH (raw)');
    
    // Add small amounts proportionally
    const wethToAdd = hre.ethers.parseEther('0.0001'); // 0.0001 WETH
    const usdcToAdd = wethToAdd * reserves.reserve0 / reserves.reserve1 / BigInt(1e12);
    
    console.log('\n💰 Planning to add:');
    console.log('├─ WETH:', hre.ethers.formatEther(wethToAdd));
    console.log('└─ USDC:', hre.ethers.formatUnits(usdcToAdd, 6));
    
    // Check balances
    const wethBalance = await weth.balanceOf(signer.address);
    const usdcBalance = await usdc.balanceOf(signer.address);
    
    if (wethBalance < wethToAdd) {
      console.log('\nWrapping ETH...');
      await (await weth.deposit({ value: wethToAdd - wethBalance })).wait();
      console.log('✅ Wrapped ETH');
    }
    
    if (usdcBalance < usdcToAdd) {
      console.log(chalk.red('❌ Insufficient USDC balance'));
      return;
    }
    
    // Approve
    console.log('\nApproving tokens...');
    await (await weth.approve(config.router, wethToAdd)).wait();
    await (await usdc.approve(config.router, usdcToAdd)).wait();
    console.log('✅ Approved');
    
    // Add liquidity
    try {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const tx = await router.addLiquidity(
        config.weth,
        config.usdc,
        wethToAdd,
        usdcToAdd,
        wethToAdd * 95n / 100n, // 5% slippage
        usdcToAdd * 95n / 100n, // 5% slippage
        signer.address,
        deadline
      );
      
      console.log('\n⏳ Adding liquidity...');
      console.log(`📎 View: https://sepolia.etherscan.io/tx/${tx.hash}`);
      
      await tx.wait();
      console.log('✅ Liquidity added!');
      
      // Check new reserves
      const newReserves = await pair.getReserves();
      console.log('\n📊 New Pool State:');
      console.log('├─ USDC Reserve:', hre.ethers.formatUnits(newReserves.reserve0, 6));
      console.log('└─ WETH Reserve:', hre.ethers.formatEther(newReserves.reserve1));
      
    } catch (error) {
      console.log(chalk.red('❌ Error:'), error.message);
    }
    
  } else {
    console.log('Pool has WETH as token0, adjusting...');
    // Handle reverse case
  }
}

main().catch(console.error);
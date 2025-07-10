#!/usr/bin/env node
/**
 * Check realistic liquidity options based on actual balances
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('💧 Realistic Liquidity Analysis'));
  console.log('================================\n');
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  if (chainId !== 11155111) {
    throw new Error('This script is for Sepolia network only');
  }
  
  // Configuration
  const config = {
    deployerAddress: '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D',
    usdcAddress: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    wethAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    usdcDecimals: 6,
    priceRanges: {
      conservative: 2000,  // 2000 USDC per ETH
      moderate: 2500,      // 2500 USDC per ETH
      aggressive: 3000     // 3000 USDC per ETH
    }
  };
  
  console.log('📍 Network: Ethereum Sepolia');
  console.log('👤 Address:', config.deployerAddress);
  console.log('\n');
  
  // Get current balances
  const usdc = await hre.ethers.getContractAt('IERC20', config.usdcAddress);
  const weth = await hre.ethers.getContractAt('IERC20', config.wethAddress);
  
  const usdcBalance = await usdc.balanceOf(config.deployerAddress);
  const wethBalance = await weth.balanceOf(config.deployerAddress);
  const ethBalance = await hre.ethers.provider.getBalance(config.deployerAddress);
  
  const usdcBalanceFormatted = parseFloat(hre.ethers.formatUnits(usdcBalance, config.usdcDecimals));
  const wethBalanceFormatted = parseFloat(hre.ethers.formatEther(wethBalance));
  const ethBalanceFormatted = parseFloat(hre.ethers.formatEther(ethBalance));
  const totalEthAvailable = wethBalanceFormatted + ethBalanceFormatted;
  
  console.log(chalk.blue('💰 Current Balances:'));
  console.log('├─ USDC:', usdcBalanceFormatted.toFixed(2), 'USDC');
  console.log('├─ WETH:', wethBalanceFormatted.toFixed(6), 'WETH');
  console.log('├─ ETH:', ethBalanceFormatted.toFixed(6), 'ETH');
  console.log('└─ Total ETH/WETH:', totalEthAvailable.toFixed(6), 'ETH');
  
  // Calculate liquidity options for different price scenarios
  console.log(chalk.blue('\n📊 Liquidity Options Based on Current Balance:'));
  
  for (const [scenario, price] of Object.entries(config.priceRanges)) {
    console.log(chalk.yellow(`\n${scenario.toUpperCase()} (${price} USDC/ETH):`));
    
    // Option 1: Use all USDC
    const wethNeededForAllUsdc = usdcBalanceFormatted / price;
    const canUseAllUsdc = wethNeededForAllUsdc <= totalEthAvailable;
    
    console.log('\n  Option A - Use all USDC:');
    console.log('  ├─ USDC:', usdcBalanceFormatted.toFixed(2));
    console.log('  ├─ WETH needed:', wethNeededForAllUsdc.toFixed(6));
    console.log('  └─ Feasible:', canUseAllUsdc ? '✅' : '❌');
    
    // Option 2: Use all WETH
    const usdcFromAllWeth = totalEthAvailable * price;
    const canUseAllWeth = usdcFromAllWeth <= usdcBalanceFormatted;
    
    console.log('\n  Option B - Use all WETH:');
    console.log('  ├─ WETH:', totalEthAvailable.toFixed(6));
    console.log('  ├─ USDC needed:', usdcFromAllWeth.toFixed(2));
    console.log('  └─ Feasible:', canUseAllWeth ? '✅' : '❌');
    
    // Option 3: Balanced approach (use max possible)
    let optimalWeth, optimalUsdc;
    if (canUseAllUsdc) {
      optimalUsdc = usdcBalanceFormatted;
      optimalWeth = wethNeededForAllUsdc;
    } else if (canUseAllWeth) {
      optimalWeth = totalEthAvailable;
      optimalUsdc = usdcFromAllWeth;
    } else {
      // Calculate the maximum balanced liquidity
      optimalWeth = Math.min(totalEthAvailable, wethNeededForAllUsdc);
      optimalUsdc = optimalWeth * price;
    }
    
    console.log('\n  Option C - Optimal Balance:');
    console.log('  ├─ WETH:', optimalWeth.toFixed(6));
    console.log('  ├─ USDC:', optimalUsdc.toFixed(2));
    console.log('  └─ Total Value:', (optimalUsdc * 2).toFixed(2), 'USDC');
  }
  
  // Check if 10M USDC target is realistic
  console.log(chalk.blue('\n🎯 10,000,000 USDC Target Analysis:'));
  const targetUsdc = 10000000;
  
  for (const [scenario, price] of Object.entries(config.priceRanges)) {
    const wethNeeded = targetUsdc / price;
    const usdcDeficit = targetUsdc - usdcBalanceFormatted;
    const wethDeficit = wethNeeded - totalEthAvailable;
    
    console.log(chalk.yellow(`\n${scenario.toUpperCase()} (${price} USDC/ETH):`));
    console.log('├─ WETH needed:', wethNeeded.toFixed(2), 'WETH');
    console.log('├─ USDC deficit:', usdcDeficit.toFixed(0), 'USDC');
    console.log('└─ WETH deficit:', wethDeficit.toFixed(2), 'WETH');
  }
  
  // Practical recommendations
  console.log(chalk.cyan('\n💡 Practical Recommendations:'));
  
  console.log('\n1. Based on current balance (1,000 USDC):');
  const reasonableWeth = usdcBalanceFormatted / 2500; // Using moderate price
  console.log('   ├─ You can create a small pool with ~', reasonableWeth.toFixed(4), 'WETH');
  console.log('   └─ This would create initial liquidity of ~$', (usdcBalanceFormatted * 2).toFixed(0));
  
  console.log('\n2. For meaningful liquidity (e.g., 100,000 USDC pool):');
  const meaningfulWeth = 100000 / 2500;
  console.log('   ├─ You would need:', meaningfulWeth.toFixed(2), 'WETH +', '100,000 USDC');
  console.log('   └─ Total pool value: $200,000');
  
  console.log('\n3. For testing purposes:');
  console.log('   ├─ Even 100 USDC + 0.04 WETH creates a functional pool');
  console.log('   └─ This is sufficient for development and testing');
  
  // Check for USDC minting capability
  console.log(chalk.blue('\n🏭 Check USDC Minting Capability...'));
  try {
    const usdcWithMint = await hre.ethers.getContractAt([
      'function mint(address to, uint256 amount) external',
      'function owner() external view returns (address)',
      'function minter() external view returns (address)'
    ], config.usdcAddress);
    
    try {
      const owner = await usdcWithMint.owner();
      console.log('├─ USDC Owner:', owner);
      console.log('└─ Can mint:', owner.toLowerCase() === config.deployerAddress.toLowerCase() ? '✅' : '❌');
    } catch (e) {
      console.log('└─ Standard ERC20 (no minting)');
    }
  } catch (error) {
    console.log('└─ No minting functions detected');
  }
  
  // Summary
  console.log(chalk.green('\n✅ Summary:'));
  console.log('├─ Current USDC is sufficient for small test pools');
  console.log('├─ 10M USDC target requires significant additional funds');
  console.log('├─ For production: aim for 100K-1M USDC pools initially');
  console.log('└─ For testing: current balance is adequate');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
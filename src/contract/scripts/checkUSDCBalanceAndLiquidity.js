#!/usr/bin/env node
/**
 * Check USDC balance and analyze liquidity requirements for deployer
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('💰 Check USDC Balance & Liquidity Analysis'));
  console.log('==========================================\n');
  
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
    targetUsdcAmount: '10000000', // 10M USDC
    usdcDecimals: 6
  };
  
  console.log('📍 Network: Ethereum Sepolia');
  console.log('👤 Target Address:', config.deployerAddress);
  console.log('🪙 USDC Contract:', config.usdcAddress);
  console.log('💎 WETH Contract:', config.wethAddress);
  console.log('\n');
  
  // Step 1: Check USDC Balance
  console.log(chalk.blue('1️⃣ Checking USDC Balance...'));
  
  const usdc = await hre.ethers.getContractAt('IERC20', config.usdcAddress);
  const usdcBalance = await usdc.balanceOf(config.deployerAddress);
  const usdcBalanceFormatted = hre.ethers.formatUnits(usdcBalance, config.usdcDecimals);
  
  console.log('├─ Raw Balance:', usdcBalance.toString());
  console.log('├─ Formatted Balance:', usdcBalanceFormatted, 'USDC');
  console.log('└─ Target Amount:', config.targetUsdcAmount, 'USDC');
  
  const targetAmountBN = hre.ethers.parseUnits(config.targetUsdcAmount, config.usdcDecimals);
  const isSufficient = usdcBalance >= targetAmountBN;
  
  if (isSufficient) {
    console.log(chalk.green('✅ Sufficient USDC balance for liquidity!'));
  } else {
    const deficit = targetAmountBN - usdcBalance;
    const deficitFormatted = hre.ethers.formatUnits(deficit, config.usdcDecimals);
    console.log(chalk.red('❌ Insufficient USDC balance'));
    console.log('   Deficit:', deficitFormatted, 'USDC');
  }
  
  // Step 2: Check ETH/WETH Balance
  console.log(chalk.blue('\n2️⃣ Checking ETH/WETH Balance...'));
  
  const ethBalance = await hre.ethers.provider.getBalance(config.deployerAddress);
  const weth = await hre.ethers.getContractAt('IERC20', config.wethAddress);
  const wethBalance = await weth.balanceOf(config.deployerAddress);
  
  console.log('├─ ETH Balance:', hre.ethers.formatEther(ethBalance), 'ETH');
  console.log('└─ WETH Balance:', hre.ethers.formatEther(wethBalance), 'WETH');
  
  // Step 3: Check existing WETH/USDC pool
  console.log(chalk.blue('\n3️⃣ Checking Existing WETH/USDC Pool...'));
  
  let pairAddress = hre.ethers.ZeroAddress;
  try {
    const router = await hre.ethers.getContractAt([
      'function factory() external view returns (address)'
    ], config.uniswapRouter);
    
    const factoryAddress = await router.factory();
    const factory = await hre.ethers.getContractAt([
      'function getPair(address, address) external view returns (address)'
    ], factoryAddress);
    
    pairAddress = await factory.getPair(config.wethAddress, config.usdcAddress);
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not check for existing pair:', error.message));
  }
  
  if (pairAddress === hre.ethers.ZeroAddress) {
    console.log(chalk.yellow('⚠️  No existing WETH/USDC pair found!'));
    console.log('   A new pair will be created when adding liquidity.');
  } else {
    console.log('✅ Existing pair found at:', pairAddress);
    
    // Get pair details
    const pair = await hre.ethers.getContractAt([
      'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
      'function token0() external view returns (address)',
      'function token1() external view returns (address)',
      'function totalSupply() external view returns (uint256)'
    ], pairAddress);
    
    const token0 = await pair.token0();
    const token1 = await pair.token1();
    const reserves = await pair.getReserves();
    const totalSupply = await pair.totalSupply();
    
    console.log('\n📊 Pool Details:');
    console.log('├─ Token0:', token0);
    console.log('├─ Token1:', token1);
    console.log('├─ Total LP Supply:', hre.ethers.formatEther(totalSupply));
    
    let wethReserve, usdcReserve;
    if (token0.toLowerCase() === config.wethAddress.toLowerCase()) {
      wethReserve = reserves.reserve0;
      usdcReserve = reserves.reserve1;
    } else {
      wethReserve = reserves.reserve1;
      usdcReserve = reserves.reserve0;
    }
    
    const wethReserveFormatted = hre.ethers.formatEther(wethReserve);
    const usdcReserveFormatted = hre.ethers.formatUnits(usdcReserve, config.usdcDecimals);
    
    console.log('├─ WETH Reserve:', wethReserveFormatted, 'WETH');
    console.log('├─ USDC Reserve:', usdcReserveFormatted, 'USDC');
    
    if (wethReserve > 0) {
      const price = Number(usdcReserveFormatted) / Number(wethReserveFormatted);
      console.log('└─ Current Price:', price.toFixed(2), 'USDC per WETH');
    }
  }
  
  // Step 4: Calculate optimal liquidity amounts
  console.log(chalk.blue('\n4️⃣ Liquidity Analysis...'));
  
  // Assuming a target price of 2500 USDC per ETH (you can adjust this)
  const targetPrice = 2500;
  const targetUsdcAmountNum = Number(config.targetUsdcAmount);
  const requiredWeth = targetUsdcAmountNum / targetPrice;
  
  console.log('📈 Liquidity Calculation (assuming', targetPrice, 'USDC/ETH):');
  console.log('├─ USDC to provide:', config.targetUsdcAmount, 'USDC');
  console.log('├─ WETH required:', requiredWeth.toFixed(4), 'WETH');
  console.log('└─ Total value:', (targetUsdcAmountNum * 2).toLocaleString(), 'USDC');
  
  // Check if deployer has enough WETH
  const requiredWethBN = hre.ethers.parseEther(requiredWeth.toString());
  const totalAvailableWeth = ethBalance + wethBalance;
  
  console.log('\n💡 WETH Requirements:');
  console.log('├─ Required WETH:', hre.ethers.formatEther(requiredWethBN), 'WETH');
  console.log('├─ Available (ETH + WETH):', hre.ethers.formatEther(totalAvailableWeth), 'ETH/WETH');
  
  if (totalAvailableWeth >= requiredWethBN) {
    console.log(chalk.green('└─ ✅ Sufficient ETH/WETH for pairing!'));
  } else {
    const deficit = requiredWethBN - totalAvailableWeth;
    console.log(chalk.red('└─ ❌ Insufficient ETH/WETH'));
    console.log('     Deficit:', hre.ethers.formatEther(deficit), 'ETH/WETH');
  }
  
  // Step 5: Alternative liquidity strategies
  console.log(chalk.blue('\n5️⃣ Alternative Liquidity Strategies...'));
  
  const halfUsdcAmount = targetUsdcAmountNum / 2;
  const quarterUsdcAmount = targetUsdcAmountNum / 4;
  
  console.log('🔄 Option 1 - Full Liquidity:');
  console.log('├─ USDC:', targetUsdcAmountNum.toLocaleString());
  console.log('└─ WETH:', requiredWeth.toFixed(4));
  
  console.log('\n🔄 Option 2 - Half Liquidity:');
  console.log('├─ USDC:', halfUsdcAmount.toLocaleString());
  console.log('└─ WETH:', (halfUsdcAmount / targetPrice).toFixed(4));
  
  console.log('\n🔄 Option 3 - Quarter Liquidity:');
  console.log('├─ USDC:', quarterUsdcAmount.toLocaleString());
  console.log('└─ WETH:', (quarterUsdcAmount / targetPrice).toFixed(4));
  
  // Summary
  console.log(chalk.yellow('\n📋 Summary:'));
  console.log('├─ Current USDC Balance:', usdcBalanceFormatted, 'USDC');
  console.log('├─ Target USDC Amount:', config.targetUsdcAmount, 'USDC');
  console.log('├─ USDC Sufficient:', isSufficient ? '✅' : '❌');
  console.log('├─ Required WETH (@', targetPrice, 'USDC/ETH):', requiredWeth.toFixed(4), 'WETH');
  console.log('└─ WETH Sufficient:', totalAvailableWeth >= requiredWethBN ? '✅' : '❌');
  
  // Recommendations
  console.log(chalk.cyan('\n💡 Recommendations:'));
  if (!isSufficient) {
    console.log('1. Obtain more USDC from a faucet or swap');
  }
  if (totalAvailableWeth < requiredWethBN) {
    console.log('2. Obtain more ETH/WETH for pairing');
  }
  if (pairAddress === hre.ethers.ZeroAddress) {
    console.log('3. You will be creating the first liquidity pool');
    console.log('   - This means you set the initial price');
    console.log('   - Consider market rates when setting the ratio');
  } else {
    console.log('3. Add liquidity at the current market rate');
    console.log('   - The pool will determine the exact ratio');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
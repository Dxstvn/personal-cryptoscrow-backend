#!/usr/bin/env node
/**
 * Create a new WETH/USDC pool with proper ratios
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🌊 Create New WETH/USDC Pool'));
  console.log('============================\n');
  
  const [signer] = await hre.ethers.getSigners();
  console.log('👤 Account:', signer.address);
  
  // Configuration
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6'
  };
  
  // Get contracts
  const weth = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', config.weth);
  const usdc = await hre.ethers.getContractAt('IERC20', config.usdc);
  const router = await hre.ethers.getContractAt([
    'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
    'function factory() external view returns (address)'
  ], config.router);
  
  // Check current balances
  const ethBalance = await signer.provider.getBalance(signer.address);
  const wethBalance = await weth.balanceOf(signer.address);
  const usdcBalance = await usdc.balanceOf(signer.address);
  
  console.log('💰 Current Balances:');
  console.log('├─ ETH:', hre.ethers.formatEther(ethBalance));
  console.log('├─ WETH:', hre.ethers.formatEther(wethBalance));
  console.log('└─ USDC:', hre.ethers.formatUnits(usdcBalance, 6));
  
  // Check if pool already exists
  const factory = await hre.ethers.getContractAt([
    'function getPair(address, address) external view returns (address)',
    'function createPair(address tokenA, address tokenB) external returns (address pair)'
  ], await router.factory());
  
  let pairAddress = await factory.getPair(config.weth, config.usdc);
  console.log('\n📊 Current Pool:', pairAddress === hre.ethers.ZeroAddress ? 'None' : pairAddress);
  
  // Create new pair if none exists
  if (pairAddress === hre.ethers.ZeroAddress) {
    console.log(chalk.blue('\n1️⃣ Creating New Pair...'));
    try {
      const createTx = await factory.createPair(config.weth, config.usdc);
      await createTx.wait();
      pairAddress = await factory.getPair(config.weth, config.usdc);
      console.log('✅ New pair created at:', pairAddress);
    } catch (error) {
      console.log('❌ Error creating pair:', error.message);
      return;
    }
  }
  
  // Calculate liquidity amounts
  // Use 300 USDC and calculate WETH needed at 2500 USDC/ETH rate
  const usdcAmount = hre.ethers.parseUnits('300', 6); // 300 USDC
  const wethAmount = hre.ethers.parseEther('0.12'); // 0.12 WETH (300/2500)
  
  console.log(chalk.blue('\n2️⃣ Preparing Liquidity'));
  console.log('├─ USDC Amount: 300');
  console.log('├─ WETH Amount: 0.12');
  console.log('└─ Implied Price: 2,500 USDC/ETH');
  
  // Wrap ETH if needed
  if (wethBalance < wethAmount) {
    const wrapAmount = wethAmount - wethBalance;
    console.log('\nWrapping', hre.ethers.formatEther(wrapAmount), 'ETH to WETH...');
    
    if (ethBalance < wrapAmount) {
      console.log(chalk.red('❌ Insufficient ETH balance'));
      return;
    }
    
    const wrapTx = await weth.deposit({ value: wrapAmount });
    await wrapTx.wait();
    console.log('✅ Wrapped ETH to WETH');
  }
  
  // Approve router
  console.log(chalk.blue('\n3️⃣ Approving Router'));
  await (await weth.approve(config.router, wethAmount)).wait();
  await (await usdc.approve(config.router, usdcAmount)).wait();
  console.log('✅ Approvals completed');
  
  // Add liquidity
  console.log(chalk.blue('\n4️⃣ Adding Liquidity'));
  try {
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    // First check if pool has any liquidity
    const pair = await hre.ethers.getContractAt([
      'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
    ], pairAddress);
    
    const reserves = await pair.getReserves();
    const hasLiquidity = reserves.reserve0 > 0 || reserves.reserve1 > 0;
    
    const tx = await router.addLiquidity(
      config.weth,
      config.usdc,
      wethAmount,
      usdcAmount,
      hasLiquidity ? wethAmount * 95n / 100n : 0, // 5% slippage or 0 for first liquidity
      hasLiquidity ? usdcAmount * 95n / 100n : 0, // 5% slippage or 0 for first liquidity
      signer.address,
      deadline
    );
    
    console.log('\n⏳ Adding liquidity...');
    console.log(`📎 View on Sepolia: https://sepolia.etherscan.io/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log('✅ Liquidity added successfully!');
    
    // Check final pool state
    const newReserves = await pair.getReserves();
    const token0 = await pair.token0();
    
    console.log('\n📊 Pool State:');
    if (token0.toLowerCase() === config.weth.toLowerCase()) {
      console.log('├─ WETH Reserve:', hre.ethers.formatEther(newReserves.reserve0));
      console.log('├─ USDC Reserve:', hre.ethers.formatUnits(newReserves.reserve1, 6));
    } else {
      console.log('├─ USDC Reserve:', hre.ethers.formatUnits(newReserves.reserve0, 6));
      console.log('├─ WETH Reserve:', hre.ethers.formatEther(newReserves.reserve1));
    }
    
    // Test swap quote
    console.log(chalk.blue('\n5️⃣ Testing Swap Quote'));
    const routerForQuote = await hre.ethers.getContractAt([
      'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
    ], config.router);
    
    const testAmount = hre.ethers.parseEther('0.01');
    const path = [config.weth, config.usdc];
    
    try {
      const amounts = await routerForQuote.getAmountsOut(testAmount, path);
      console.log('✅ Swap quote (0.01 ETH → USDC):');
      console.log('└─ Expected output:', hre.ethers.formatUnits(amounts[1], 6), 'USDC');
    } catch (error) {
      console.log('❌ Quote failed:', error.message);
    }
    
    console.log(chalk.green('\n✅ Pool Setup Complete!'));
    console.log('========================');
    console.log('📋 Pool Address:', pairAddress);
    console.log('🔄 Ready for ETH → USDC swaps');
    console.log('💡 You can now run the escrow swap test!');
    
  } catch (error) {
    console.log(chalk.red('❌ Error adding liquidity:'), error.message);
    if (error.data) {
      console.log('Error data:', error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
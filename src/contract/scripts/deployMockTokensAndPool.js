#!/usr/bin/env node
/**
 * Deploy mock tokens and create a proper Uniswap pool for testing
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🚀 Deploy Mock Tokens & Create Pool'));
  console.log('==================================\n');
  
  const [signer] = await hre.ethers.getSigners();
  console.log('👤 Deployer:', signer.address);
  
  const balance = await signer.provider.getBalance(signer.address);
  console.log('💰 Balance:', hre.ethers.formatEther(balance), 'ETH\n');
  
  // Deploy Mock USDC
  console.log(chalk.blue('1️⃣ Deploying Mock USDC...'));
  const MockERC20 = await hre.ethers.getContractFactory('MockERC20');
  const mockUSDC = await MockERC20.deploy('Mock USDC', 'mUSDC', 6);
  await mockUSDC.waitForDeployment();
  console.log('✅ Mock USDC deployed at:', mockUSDC.target);
  
  // Mint some Mock USDC
  console.log('\nMinting 100,000 Mock USDC...');
  await (await mockUSDC.mint(signer.address, hre.ethers.parseUnits('100000', 6))).wait();
  console.log('✅ Minted 100,000 mUSDC');
  
  // Configuration
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6'
  };
  
  // Get WETH contract
  const weth = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', config.weth);
  
  // Wrap some ETH
  console.log(chalk.blue('\n2️⃣ Wrapping ETH to WETH...'));
  const wethAmount = hre.ethers.parseEther('0.1'); // 0.1 WETH
  await (await weth.deposit({ value: wethAmount })).wait();
  console.log('✅ Wrapped 0.1 ETH to WETH');
  
  // Create liquidity pool
  console.log(chalk.blue('\n3️⃣ Creating Liquidity Pool...'));
  
  const router = await hre.ethers.getContractAt([
    'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)'
  ], config.router);
  
  // Approve router
  const usdcAmount = hre.ethers.parseUnits('2500', 6); // 2500 USDC for 0.1 WETH = 25000 USDC/ETH
  
  console.log('Approving router...');
  await (await weth.approve(config.router, wethAmount)).wait();
  await (await mockUSDC.approve(config.router, usdcAmount)).wait();
  console.log('✅ Approvals completed');
  
  // Add liquidity
  console.log('\nAdding liquidity:');
  console.log('├─ WETH: 0.1');
  console.log('├─ Mock USDC: 2,500');
  console.log('└─ Initial price: 25,000 USDC/ETH');
  
  try {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const tx = await router.addLiquidity(
      config.weth,
      mockUSDC.target,
      wethAmount,
      usdcAmount,
      0, // Accept any amount
      0, // Accept any amount
      signer.address,
      deadline
    );
    
    console.log('\n⏳ Creating pool...');
    const receipt = await tx.wait();
    console.log('✅ Pool created!');
    
    // Get pair address
    const factory = await hre.ethers.getContractAt([
      'function getPair(address, address) external view returns (address)'
    ], config.factory);
    
    const pairAddress = await factory.getPair(config.weth, mockUSDC.target);
    console.log('\n📊 Pool Details:');
    console.log('├─ Pair Address:', pairAddress);
    console.log('├─ Token A: WETH');
    console.log('├─ Token B: Mock USDC');
    console.log('└─ Initial Liquidity: 0.1 WETH + 2,500 mUSDC');
    
    // Test swap quote
    console.log(chalk.blue('\n4️⃣ Testing Swap Quote...'));
    const routerWithQuote = await hre.ethers.getContractAt([
      'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
    ], config.router);
    
    const testAmount = hre.ethers.parseEther('0.01');
    const path = [config.weth, mockUSDC.target];
    
    try {
      const amounts = await routerWithQuote.getAmountsOut(testAmount, path);
      console.log('✅ Swap quote (0.01 ETH → mUSDC):');
      console.log('└─ Expected output:', hre.ethers.formatUnits(amounts[1], 6), 'mUSDC');
    } catch (error) {
      console.log('❌ Quote failed:', error.message);
    }
    
    // Summary
    console.log(chalk.green('\n✅ Setup Complete!'));
    console.log('================');
    console.log('\n📝 Summary:');
    console.log('├─ Mock USDC:', mockUSDC.target);
    console.log('├─ Liquidity Pool:', pairAddress);
    console.log('├─ Your mUSDC Balance: 97,500');
    console.log('└─ Pool has: 0.1 WETH + 2,500 mUSDC');
    
    console.log(chalk.yellow('\n📌 Next Steps:'));
    console.log('1. Update the escrow test to use Mock USDC:', mockUSDC.target);
    console.log('2. Run the swap test with the new token');
    console.log('3. The pool should now work properly for testing!');
    
  } catch (error) {
    console.log(chalk.red('❌ Error creating pool:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
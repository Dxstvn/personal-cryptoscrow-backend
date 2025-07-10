#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🏊 Create Pool Directly'));
  
  const [signer] = await hre.ethers.getSigners();
  const mockUSDC = '0x5e0664EA3DF89f7d22ce67fe373ab49c042a47C0'; // Just deployed
  const weth = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const router = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
  
  // Try different factory address or direct router approach
  const routerContract = await hre.ethers.getContractAt([
    'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
    'function factory() external view returns (address)'
  ], router);
  
  const factoryAddress = await routerContract.factory();
  console.log('Factory address:', factoryAddress);
  
  // Get tokens
  const wethContract = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', weth);
  const usdcContract = await hre.ethers.getContractAt('IERC20', mockUSDC);
  
  // Check balances
  const wethBalance = await wethContract.balanceOf(signer.address);
  const usdcBalance = await usdcContract.balanceOf(signer.address);
  console.log('WETH balance:', hre.ethers.formatEther(wethBalance));
  console.log('mUSDC balance:', hre.ethers.formatUnits(usdcBalance, 6));
  
  // Approve with max uint256
  console.log('\nApproving tokens...');
  await (await wethContract.approve(router, hre.ethers.MaxUint256)).wait();
  await (await usdcContract.approve(router, hre.ethers.MaxUint256)).wait();
  console.log('✅ Approved');
  
  // Try smaller amounts
  const wethAmount = hre.ethers.parseEther('0.01'); // 0.01 WETH
  const usdcAmount = hre.ethers.parseUnits('250', 6); // 250 USDC
  
  console.log('\nAdding liquidity:');
  console.log('WETH:', hre.ethers.formatEther(wethAmount));
  console.log('mUSDC:', hre.ethers.formatUnits(usdcAmount, 6));
  
  try {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    
    // Try with very permissive parameters
    const tx = await routerContract.addLiquidity(
      weth,
      mockUSDC,
      wethAmount,
      usdcAmount,
      1, // Accept almost any amount
      1, // Accept almost any amount
      signer.address,
      deadline,
      { gasLimit: 3000000 } // High gas limit
    );
    
    console.log('Transaction:', tx.hash);
    const receipt = await tx.wait();
    console.log('✅ Success! Gas used:', receipt.gasUsed.toString());
    
    // Check if pair was created
    const factory = await hre.ethers.getContractAt([
      'function getPair(address, address) external view returns (address)'
    ], factoryAddress);
    
    const pairAddress = await factory.getPair(weth, mockUSDC);
    console.log('Pair address:', pairAddress);
    
  } catch (error) {
    console.log('Error:', error.message);
    
    // Try to get more details
    if (error.reason) console.log('Reason:', error.reason);
    if (error.code) console.log('Code:', error.code);
  }
}

main().catch(console.error);
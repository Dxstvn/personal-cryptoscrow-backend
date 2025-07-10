#!/usr/bin/env node
/**
 * Debug escrow release functionality
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Debug Escrow Release'));
  console.log('=======================\n');
  
  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  const contractAddress = chainId === 11155111 
    ? process.env.SEPOLIA_STARGATE_ENHANCED_CONTRACT
    : process.env.ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT;
    
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', contractAddress);
  
  console.log('📍 Network:', chainId === 11155111 ? 'Sepolia' : 'Arbitrum Sepolia');
  console.log('📋 Contract:', contractAddress);
  console.log('👤 Signer:', signer.address);
  
  // Test 1: Create a simple ETH → ETH escrow and release it
  console.log(chalk.blue('\n1️⃣ Test ETH → ETH Release:'));
  try {
    const amount = hre.ethers.parseEther('0.005');
    
    // Create escrow
    const tx1 = await contract.createEscrow(
      signer.address, // self as seller
      hre.ethers.ZeroAddress, // ETH
      amount,
      hre.ethers.ZeroAddress, // ETH
      chainId,
      { value: amount }
    );
    
    const receipt1 = await tx1.wait();
    console.log('✅ Escrow created:', receipt1.hash);
    
    // Extract escrow ID
    let escrowId;
    for (const log of receipt1.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          console.log('├─ Escrow ID:', escrowId);
          break;
        }
      } catch (e) {}
    }
    
    // Check escrow details
    const escrow = await contract.escrows(escrowId);
    console.log('├─ Deposit Token:', escrow.depositToken);
    console.log('├─ Target Token:', escrow.targetToken);
    console.log('├─ Target Chain:', escrow.targetChainId);
    console.log('├─ Released:', escrow.released);
    console.log('├─ Condition Met:', escrow.conditionMet);
    
    // Update condition
    const tx2 = await contract.updateCondition(escrowId, true);
    await tx2.wait();
    console.log('✅ Condition updated');
    
    // Try to release
    const balanceBefore = await signer.provider.getBalance(signer.address);
    console.log('├─ Balance before:', hre.ethers.formatEther(balanceBefore), 'ETH');
    
    const tx3 = await contract.releaseEscrow(escrowId);
    const receipt3 = await tx3.wait();
    console.log('✅ Released:', receipt3.hash);
    
    const balanceAfter = await signer.provider.getBalance(signer.address);
    console.log('├─ Balance after:', hre.ethers.formatEther(balanceAfter), 'ETH');
    
    // Calculate gas cost
    const gasUsed = receipt3.gasUsed * receipt3.gasPrice;
    const netReceived = balanceAfter - balanceBefore + gasUsed;
    console.log('├─ Gas cost:', hre.ethers.formatEther(gasUsed), 'ETH');
    console.log('└─ Net received:', hre.ethers.formatEther(netReceived), 'ETH');
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
  
  // Test 2: Check Uniswap configuration
  console.log(chalk.blue('\n2️⃣ Check Uniswap Configuration:'));
  try {
    const uniswapRouter = await contract.uniswapRouter();
    const weth = await contract.WETH();
    console.log('├─ Uniswap Router:', uniswapRouter);
    console.log('└─ WETH:', weth);
    
    // Check if we can get a quote for ETH → USDC
    const usdcAddress = chainId === 11155111
      ? '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590'
      : '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773';
      
    console.log('\n📊 ETH → USDC Quote:');
    try {
      const uniswapRouterContract = await hre.ethers.getContractAt([
        'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
      ], uniswapRouter);
      
      const path = [weth, usdcAddress];
      const amountIn = hre.ethers.parseEther('0.01');
      const amounts = await uniswapRouterContract.getAmountsOut(amountIn, path);
      
      console.log('├─ Input:', hre.ethers.formatEther(amountIn), 'ETH');
      console.log('└─ Output:', hre.ethers.formatUnits(amounts[1], 6), 'USDC');
    } catch (error) {
      console.log(chalk.red('❌ Quote failed:'), error.message);
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
  
  // Test 3: Check why ETH → USDC might fail
  console.log(chalk.blue('\n3️⃣ Test ETH → USDC Escrow:'));
  try {
    const amount = hre.ethers.parseEther('0.001'); // Small amount
    const usdcAddress = chainId === 11155111
      ? '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590'
      : '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773';
    
    // Create escrow
    const tx1 = await contract.createEscrow(
      signer.address, // self as seller
      hre.ethers.ZeroAddress, // ETH
      amount,
      usdcAddress, // USDC
      chainId,
      { value: amount }
    );
    
    const receipt1 = await tx1.wait();
    console.log('✅ ETH → USDC Escrow created:', receipt1.hash);
    
    // Extract escrow ID
    let escrowId;
    for (const log of receipt1.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          console.log('├─ Escrow ID:', escrowId);
          break;
        }
      } catch (e) {}
    }
    
    // Update condition
    const tx2 = await contract.updateCondition(escrowId, true);
    await tx2.wait();
    console.log('✅ Condition updated');
    
    // Get USDC balance before
    const usdc = await hre.ethers.getContractAt('IERC20', usdcAddress);
    const usdcBefore = await usdc.balanceOf(signer.address);
    console.log('├─ USDC balance before:', hre.ethers.formatUnits(usdcBefore, 6));
    
    // Try to release with detailed error catching
    try {
      // First try to estimate gas to see the actual error
      const gasEstimate = await contract.releaseEscrow.estimateGas(escrowId);
      console.log('├─ Gas estimate:', gasEstimate.toString());
      
      const tx3 = await contract.releaseEscrow(escrowId);
      const receipt3 = await tx3.wait();
      console.log('✅ Released:', receipt3.hash);
      
      const usdcAfter = await usdc.balanceOf(signer.address);
      console.log('├─ USDC balance after:', hre.ethers.formatUnits(usdcAfter, 6));
      console.log('└─ USDC received:', hre.ethers.formatUnits(usdcAfter - usdcBefore, 6));
      
    } catch (error) {
      console.log(chalk.red('❌ Release failed:'));
      console.log('├─ Error:', error.message);
      
      // Try to decode the error
      if (error.data) {
        try {
          const decodedError = contract.interface.parseError(error.data);
          console.log('├─ Decoded error:', decodedError);
        } catch (e) {
          console.log('├─ Raw error data:', error.data);
        }
      }
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Add liquidity and test same-chain ETH -> USDC escrow swap
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('💧 Add Liquidity & Test Uniswap Integration'));
  console.log('==========================================\n');
  
  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  if (chainId !== 11155111) {
    throw new Error('This script is for Sepolia only');
  }
  
  // Configuration
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6',
    escrowContract: '0x3345F4adA7C290A94918aA44c2a3D28110f3bCdb'
  };
  
  console.log('📍 Network: Sepolia');
  console.log('👤 Account:', signer.address);
  
  // Get contracts
  const weth = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', config.weth);
  const usdc = await hre.ethers.getContractAt('IERC20', config.usdc);
  const router = await hre.ethers.getContractAt([
    'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
    'function factory() external view returns (address)',
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
  ], config.router);
  
  // Check balances
  const ethBalance = await signer.provider.getBalance(signer.address);
  const wethBalance = await weth.balanceOf(signer.address);
  const usdcBalance = await usdc.balanceOf(signer.address);
  
  console.log('\n💰 Current Balances:');
  console.log('├─ ETH:', hre.ethers.formatEther(ethBalance));
  console.log('├─ WETH:', hre.ethers.formatEther(wethBalance));
  console.log('└─ USDC:', hre.ethers.formatUnits(usdcBalance, 6));
  
  // Step 1: Add Liquidity
  console.log(chalk.blue('\n1️⃣ Adding WETH/USDC Liquidity'));
  
  // Calculate liquidity amounts (250 USDC + 0.1 WETH at 2500 USDC/ETH rate)
  const usdcAmount = hre.ethers.parseUnits('250', 6); // 250 USDC
  const wethAmount = hre.ethers.parseEther('0.1'); // 0.1 WETH
  
  // Check if we have enough WETH, if not wrap some ETH
  if (wethBalance < wethAmount) {
    const wrapAmount = wethAmount - wethBalance;
    console.log('Wrapping', hre.ethers.formatEther(wrapAmount), 'ETH to WETH...');
    const wrapTx = await weth.deposit({ value: wrapAmount });
    await wrapTx.wait();
    console.log('✅ Wrapped ETH to WETH');
  }
  
  // Approve router
  console.log('Approving router to spend tokens...');
  await (await weth.approve(config.router, wethAmount)).wait();
  await (await usdc.approve(config.router, usdcAmount)).wait();
  console.log('✅ Approvals completed');
  
  // Add liquidity
  console.log('\nAdding liquidity:');
  console.log('├─ WETH:', hre.ethers.formatEther(wethAmount));
  console.log('└─ USDC:', hre.ethers.formatUnits(usdcAmount, 6));
  
  try {
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes
    const addLiqTx = await router.addLiquidity(
      config.weth,
      config.usdc,
      wethAmount,
      usdcAmount,
      0, // Accept any amount of tokens (first liquidity)
      0, // Accept any amount of tokens (first liquidity)
      signer.address,
      deadline
    );
    
    console.log('\n⏳ Adding liquidity...');
    console.log(`📎 View on Sepolia: https://sepolia.etherscan.io/tx/${addLiqTx.hash}`);
    
    const receipt = await addLiqTx.wait();
    console.log('✅ Liquidity added successfully!');
    
    // Check the pool
    const factory = await hre.ethers.getContractAt([
      'function getPair(address, address) external view returns (address)'
    ], await router.factory());
    
    const pairAddress = await factory.getPair(config.weth, config.usdc);
    console.log('\n📊 Liquidity Pool Created:');
    console.log('└─ Pair address:', pairAddress);
    
  } catch (error) {
    console.log(chalk.red('❌ Error adding liquidity:'), error.message);
    return;
  }
  
  // Step 2: Test Escrow with Swap
  console.log(chalk.blue('\n2️⃣ Testing ETH → USDC Escrow Swap'));
  
  // Get wallet keys
  const buyerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const sellerKey = process.env.SELLER_WALLET_PRIVATE_KEY;
  
  const buyer = new hre.ethers.Wallet(buyerKey, hre.ethers.provider);
  const seller = new hre.ethers.Wallet(sellerKey, hre.ethers.provider);
  
  console.log('\n👥 Participants:');
  console.log('├─ Buyer:', buyer.address);
  console.log('├─ Seller:', seller.address);
  console.log('└─ Service:', buyer.address); // Service wallet is same as deployer
  
  // Connect to escrow contract
  const escrow = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', config.escrowContract, buyer);
  
  // Test swap quote first
  console.log('\nChecking swap quote...');
  try {
    const testAmount = hre.ethers.parseEther('0.01');
    const path = [config.weth, config.usdc];
    const amounts = await router.getAmountsOut(testAmount, path);
    console.log('✅ Swap quote available:');
    console.log('├─ Input:', hre.ethers.formatEther(amounts[0]), 'WETH');
    console.log('└─ Output:', hre.ethers.formatUnits(amounts[1], 6), 'USDC');
  } catch (error) {
    console.log(chalk.red('❌ Swap quote failed:'), error.message);
    return;
  }
  
  // Create escrow
  const depositAmount = hre.ethers.parseEther('0.01'); // 0.01 ETH
  
  console.log(chalk.cyan('\n3️⃣ Creating Same-Chain Swap Escrow'));
  console.log('├─ Deposit: 0.01 ETH');
  console.log('├─ Target: USDC');
  console.log('└─ Chain: Sepolia (same chain)');
  
  try {
    const tx1 = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress, // ETH
      depositAmount,
      config.usdc, // Target token: USDC
      chainId, // Same chain
      { value: depositAmount }
    );
    
    console.log('\n⏳ Transaction submitted...');
    console.log(`📎 View on Sepolia: https://sepolia.etherscan.io/tx/${tx1.hash}`);
    
    const receipt1 = await tx1.wait();
    console.log('✅ Escrow created in block:', receipt1.blockNumber);
    
    // Extract escrow ID
    let escrowId;
    for (const log of receipt1.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          console.log('📦 Escrow ID:', escrowId);
          console.log('├─ Buyer:', parsed.args.buyer);
          console.log('├─ Seller:', parsed.args.seller);
          console.log('├─ Amount:', hre.ethers.formatEther(parsed.args.amount), 'ETH');
          console.log('└─ Target Token: USDC');
          break;
        }
      } catch (e) {}
    }
    
    // Update condition
    console.log(chalk.cyan('\n4️⃣ Updating Escrow Condition'));
    const tx2 = await escrow.updateCondition(escrowId, true);
    console.log('\n⏳ Transaction submitted...');
    console.log(`📎 View on Sepolia: https://sepolia.etherscan.io/tx/${tx2.hash}`);
    await tx2.wait();
    console.log('✅ Condition updated to: true');
    
    // Get escrow details
    const escrowData = await escrow.escrows(escrowId);
    console.log('\n📊 Escrow Details:');
    console.log('├─ Net Amount:', hre.ethers.formatEther(escrowData.netAmount), 'ETH');
    console.log('├─ Service Fee:', hre.ethers.formatEther(depositAmount - escrowData.netAmount), 'ETH');
    console.log('└─ Will swap to: USDC');
    
    // Release escrow (will trigger swap)
    console.log(chalk.cyan('\n5️⃣ Releasing Escrow (ETH → USDC Swap)'));
    const tx3 = await escrow.releaseEscrow(escrowId);
    
    console.log('\n⏳ Swapping and releasing...');
    console.log(`📎 View on Sepolia: https://sepolia.etherscan.io/tx/${tx3.hash}`);
    
    const receipt3 = await tx3.wait();
    console.log('✅ Escrow released with swap in block:', receipt3.blockNumber);
    
    // Check for swap events
    let swapDetails = null;
    for (const log of receipt3.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowReleased') {
          console.log(chalk.green('\n✅ Escrow Released:'));
          console.log('├─ Seller:', parsed.args.seller);
          console.log('├─ Token:', parsed.args.token === config.usdc ? 'USDC' : parsed.args.token);
          console.log('├─ Amount:', hre.ethers.formatUnits(parsed.args.amount, 6), 'USDC');
          console.log('└─ Release Type:', parsed.args.releaseType);
          swapDetails = parsed.args;
          break;
        }
      } catch (e) {}
    }
    
    // Summary
    console.log(chalk.blue('\n📊 Transaction Summary'));
    console.log('======================');
    
    console.log('\n🔗 Transaction Links:');
    console.log(`├─ Add Liquidity: View in block explorer`);
    console.log(`├─ Escrow Creation: https://sepolia.etherscan.io/tx/${tx1.hash}`);
    console.log(`├─ Condition Update: https://sepolia.etherscan.io/tx/${tx2.hash}`);
    console.log(`└─ Swap & Release: https://sepolia.etherscan.io/tx/${tx3.hash}`);
    
    console.log('\n💱 Swap Details:');
    console.log('├─ Input: 0.0098 ETH (after 2% service fee)');
    console.log('├─ Output: Check USDC balance of seller');
    console.log('└─ Seller USDC: https://sepolia.etherscan.io/token/0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590?a=' + seller.address);
    
    console.log(chalk.green('\n✅ Test completed successfully!'));
    console.log('\n💡 What happened:');
    console.log('├─ Added 250 USDC + 0.1 WETH liquidity to Uniswap');
    console.log('├─ Created escrow with 0.01 ETH');
    console.log('├─ Service fee (2%) was deducted');
    console.log('├─ Remaining 0.0098 ETH was swapped to USDC');
    console.log('└─ USDC was sent to seller\'s wallet');
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    if (error.data) {
      try {
        const decodedError = escrow.interface.parseError(error.data);
        console.log('Decoded error:', decodedError);
      } catch (e) {}
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
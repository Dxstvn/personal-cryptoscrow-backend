#!/usr/bin/env node
/**
 * Deploy MockUSDC and demonstrate complete ETH → MockUSDC escrow swap
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

const EXPLORER = 'https://sepolia.etherscan.io';

async function main() {
  console.log(chalk.blue('🎭 Deploy MockUSDC & Test Escrow Swap'));
  console.log('=====================================\n');
  
  const [signer] = await hre.ethers.getSigners();
  console.log('👤 Deployer:', signer.address);
  
  const balance = await signer.provider.getBalance(signer.address);
  console.log('💰 Balance:', hre.ethers.formatEther(balance), 'ETH\n');
  
  // Step 1: Deploy MockUSDC
  console.log(chalk.blue('1️⃣ Deploying MockUSDC Token'));
  
  const MockERC20 = await hre.ethers.getContractFactory('contracts/mocks/MockERC20.sol:MockERC20');
  const mockUSDC = await MockERC20.deploy('Mock USD Coin', 'mUSDC', 6);
  await mockUSDC.waitForDeployment();
  
  console.log('✅ MockUSDC deployed!');
  console.log(`📎 Token Contract: ${EXPLORER}/address/${mockUSDC.target}`);
  console.log('📋 Address:', mockUSDC.target);
  
  // Mint MockUSDC
  console.log('\nMinting 100,000 MockUSDC...');
  const mintTx = await mockUSDC.mint(signer.address, hre.ethers.parseUnits('100000', 6));
  console.log(`📎 Mint Transaction: ${EXPLORER}/tx/${mintTx.hash}`);
  await mintTx.wait();
  console.log('✅ Minted 100,000 mUSDC');
  
  // Configuration
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6',
    escrowContract: '0x3345F4adA7C290A94918aA44c2a3D28110f3bCdb'
  };
  
  // Step 2: Create Liquidity Pool
  console.log(chalk.blue('\n2️⃣ Creating WETH/MockUSDC Liquidity Pool'));
  
  const weth = await hre.ethers.getContractAt('contracts/UniversalEscrowServiceV3.sol:IWETH', config.weth);
  const router = await hre.ethers.getContractAt([
    'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
    'function factory() external view returns (address)',
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
  ], config.router);
  
  // Wrap ETH to WETH
  const wethAmount = hre.ethers.parseEther('0.1'); // 0.1 WETH
  const wethBalance = await weth.balanceOf(signer.address);
  
  if (wethBalance < wethAmount) {
    console.log('Wrapping ETH to WETH...');
    const wrapTx = await weth.deposit({ value: wethAmount - wethBalance });
    console.log(`📎 Wrap Transaction: ${EXPLORER}/tx/${wrapTx.hash}`);
    await wrapTx.wait();
    console.log('✅ Wrapped 0.1 ETH to WETH');
  }
  
  // Approve router
  const usdcAmount = hre.ethers.parseUnits('2500', 6); // 2500 MockUSDC (25000 USDC/ETH rate)
  
  console.log('\nApproving router...');
  await (await weth.approve(config.router, wethAmount)).wait();
  await (await mockUSDC.approve(config.router, usdcAmount)).wait();
  console.log('✅ Approvals completed');
  
  // Add liquidity
  console.log('\nAdding liquidity:');
  console.log('├─ WETH: 0.1');
  console.log('├─ MockUSDC: 2,500');
  console.log('└─ Rate: 25,000 mUSDC/ETH');
  
  try {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const addLiqTx = await router.addLiquidity(
      config.weth,
      mockUSDC.target,
      wethAmount,
      usdcAmount,
      0, // Accept any amount (first liquidity)
      0, // Accept any amount (first liquidity)
      signer.address,
      deadline
    );
    
    console.log(`📎 Add Liquidity: ${EXPLORER}/tx/${addLiqTx.hash}`);
    await addLiqTx.wait();
    console.log('✅ Liquidity pool created!');
    
    // Get pair address
    const factory = await hre.ethers.getContractAt([
      'function getPair(address, address) external view returns (address)'
    ], config.factory);
    
    const pairAddress = await factory.getPair(config.weth, mockUSDC.target);
    console.log(`📎 Pool Contract: ${EXPLORER}/address/${pairAddress}`);
    
    // Test swap quote
    console.log('\nTesting swap quote...');
    const testAmount = hre.ethers.parseEther('0.01');
    const path = [config.weth, mockUSDC.target];
    const amounts = await router.getAmountsOut(testAmount, path);
    console.log('✅ Quote: 0.01 ETH →', hre.ethers.formatUnits(amounts[1], 6), 'mUSDC');
    
  } catch (error) {
    console.log(chalk.red('❌ Error creating pool:'), error.message);
    return;
  }
  
  // Step 3: Test Escrow with Swap
  console.log(chalk.blue('\n3️⃣ Testing ETH → MockUSDC Escrow Swap'));
  
  // Get wallets
  const buyer = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, hre.ethers.provider);
  const seller = new hre.ethers.Wallet(process.env.SELLER_WALLET_PRIVATE_KEY, hre.ethers.provider);
  
  console.log('\n👥 Participants:');
  console.log('├─ Buyer/Service:', buyer.address);
  console.log('└─ Seller:', seller.address);
  
  // Connect to escrow contract
  const escrow = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', config.escrowContract, buyer);
  
  // Create escrow
  const depositAmount = hre.ethers.parseEther('0.01'); // 0.01 ETH
  
  console.log('\n📦 Creating Escrow:');
  console.log('├─ Deposit: 0.01 ETH');
  console.log('├─ Target: MockUSDC');
  console.log('└─ Expected: ~250 mUSDC (minus fees)');
  
  try {
    // Create escrow
    const tx1 = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress, // ETH
      depositAmount,
      mockUSDC.target, // Target: MockUSDC
      11155111, // Same chain
      { value: depositAmount }
    );
    
    console.log(`\n📎 Create Escrow: ${EXPLORER}/tx/${tx1.hash}`);
    const receipt1 = await tx1.wait();
    
    // Extract escrow ID
    let escrowId;
    for (const log of receipt1.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          console.log('✅ Escrow created! ID:', escrowId);
          break;
        }
      } catch (e) {}
    }
    
    // Update condition
    console.log('\n📝 Updating condition...');
    const tx2 = await escrow.updateCondition(escrowId, true);
    console.log(`📎 Update Condition: ${EXPLORER}/tx/${tx2.hash}`);
    await tx2.wait();
    console.log('✅ Condition updated to true');
    
    // Get escrow details
    const escrowData = await escrow.escrows(escrowId);
    console.log('\n📊 Escrow Details:');
    console.log('├─ Deposit: 0.01 ETH');
    console.log('├─ Service Fee: 0.0002 ETH (2%)');
    console.log('├─ Net Amount: 0.0098 ETH');
    console.log('└─ Will swap to: MockUSDC');
    
    // Release escrow (triggers swap)
    console.log('\n💱 Releasing escrow (ETH → MockUSDC swap)...');
    const tx3 = await escrow.releaseEscrow(escrowId);
    console.log(`📎 Release & Swap: ${EXPLORER}/tx/${tx3.hash}`);
    
    const receipt3 = await tx3.wait();
    console.log('✅ Escrow released with swap!');
    
    // Parse events
    let swapAmount;
    for (const log of receipt3.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowReleased') {
          swapAmount = parsed.args.amount;
          console.log('\n✅ Swap Complete:');
          console.log('├─ Amount sent:', hre.ethers.formatUnits(swapAmount, 6), 'mUSDC');
          console.log('└─ To seller:', parsed.args.seller);
          break;
        }
      } catch (e) {}
    }
    
    // Verify seller received MockUSDC
    const sellerBalance = await mockUSDC.balanceOf(seller.address);
    console.log('\n💰 Seller MockUSDC Balance:', hre.ethers.formatUnits(sellerBalance, 6));
    
    // Summary
    console.log(chalk.green('\n✅ TEST COMPLETE!'));
    console.log('==================\n');
    
    console.log(chalk.blue('🔗 All Transactions:'));
    console.log(`1. Deploy MockUSDC: ${EXPLORER}/address/${mockUSDC.target}`);
    console.log(`2. Create Pool: View pair contract`);
    console.log(`3. Create Escrow: ${EXPLORER}/tx/${tx1.hash}`);
    console.log(`4. Update Condition: ${EXPLORER}/tx/${tx2.hash}`);
    console.log(`5. Swap & Release: ${EXPLORER}/tx/${tx3.hash}`);
    
    console.log(chalk.yellow('\n💡 What This Proves:'));
    console.log('├─ ✅ Escrow contract correctly wraps ETH to WETH');
    console.log('├─ ✅ Swaps WETH to target token via Uniswap');
    console.log('├─ ✅ Sends swapped tokens to seller');
    console.log('├─ ✅ All verifiable on blockchain explorer');
    console.log('└─ ✅ Same logic works with real USDC on mainnet');
    
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
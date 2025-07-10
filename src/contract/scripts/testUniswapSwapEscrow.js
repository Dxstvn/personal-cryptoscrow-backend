#!/usr/bin/env node
/**
 * Test same-chain ETH -> USDC escrow swap with existing liquidity
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

// Explorer URL
const EXPLORER = 'https://sepolia.etherscan.io';

async function main() {
  console.log(chalk.blue('🔄 Same-Chain Swap Test (ETH → USDC)'));
  console.log('=====================================\n');
  
  // Get wallets
  const buyerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const sellerKey = process.env.SELLER_WALLET_PRIVATE_KEY;
  
  const buyer = new hre.ethers.Wallet(buyerKey, hre.ethers.provider);
  const seller = new hre.ethers.Wallet(sellerKey, hre.ethers.provider);
  const service = buyer; // Service wallet is same as deployer in this contract
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  // Configuration
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6',
    escrowContract: '0x3345F4adA7C290A94918aA44c2a3D28110f3bCdb',
    pair: '0xD34398848d35b2bD2CA373c809dC4D8E0523B00f'
  };
  
  console.log('📍 Network: Sepolia');
  console.log('📋 Escrow Contract:', config.escrowContract);
  console.log('💱 Swap: ETH → USDC\n');
  
  console.log('👥 Participants:');
  console.log('├─ Buyer:', buyer.address);
  console.log('├─ Seller:', seller.address);
  console.log('└─ Service:', service.address);
  
  // Check pool liquidity
  console.log(chalk.blue('\n1️⃣ Checking Uniswap Pool'));
  
  const pair = await hre.ethers.getContractAt([
    'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)'
  ], config.pair);
  
  const reserves = await pair.getReserves();
  const token0 = await pair.token0();
  
  let usdcReserve, wethReserve;
  if (token0.toLowerCase() === config.usdc.toLowerCase()) {
    usdcReserve = reserves.reserve0;
    wethReserve = reserves.reserve1;
  } else {
    usdcReserve = reserves.reserve1;
    wethReserve = reserves.reserve0;
  }
  
  console.log('├─ USDC Reserve:', hre.ethers.formatUnits(usdcReserve, 6));
  console.log('├─ WETH Reserve:', hre.ethers.formatEther(wethReserve));
  console.log('└─ Price: ~', (Number(hre.ethers.formatUnits(usdcReserve, 6)) / Number(hre.ethers.formatEther(wethReserve))).toFixed(2), 'USDC/ETH');
  
  // Check swap quote
  const router = await hre.ethers.getContractAt([
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
  ], config.router);
  
  const testAmount = hre.ethers.parseEther('0.005');
  const path = [config.weth, config.usdc];
  
  try {
    const amounts = await router.getAmountsOut(testAmount, path);
    console.log('\n📈 Swap Quote (0.005 ETH):');
    console.log('├─ Input:', hre.ethers.formatEther(amounts[0]), 'ETH');
    console.log('└─ Expected Output:', hre.ethers.formatUnits(amounts[1], 6), 'USDC');
  } catch (error) {
    console.log(chalk.red('❌ Could not get swap quote'));
    return;
  }
  
  // Check balances
  const buyerBalance = await buyer.provider.getBalance(buyer.address);
  console.log('\n💰 Buyer Balance:', hre.ethers.formatEther(buyerBalance), 'ETH');
  
  if (buyerBalance < hre.ethers.parseEther('0.01')) {
    throw new Error('Insufficient buyer balance (need at least 0.01 ETH)');
  }
  
  // Connect to escrow contract
  const escrow = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', config.escrowContract, buyer);
  
  // Create escrow
  const depositAmount = hre.ethers.parseEther('0.005'); // 0.005 ETH
  
  console.log(chalk.blue('\n2️⃣ Creating Same-Chain Swap Escrow'));
  console.log('├─ Amount:', hre.ethers.formatEther(depositAmount), 'ETH');
  console.log('├─ From: ETH');
  console.log('├─ To: USDC');
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
    console.log(`📎 View on Sepolia: ${EXPLORER}/tx/${tx1.hash}`);
    
    const receipt1 = await tx1.wait();
    console.log('✅ Escrow created in block:', receipt1.blockNumber);
    
    // Extract escrow ID and details
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
          console.log('└─ Target: USDC');
          break;
        }
      } catch (e) {}
    }
    
    // Update condition
    console.log(chalk.blue('\n3️⃣ Updating Escrow Condition'));
    const contractAsService = escrow.connect(service);
    const tx2 = await contractAsService.updateCondition(escrowId, true);
    
    console.log('\n⏳ Transaction submitted...');
    console.log(`📎 View on Sepolia: ${EXPLORER}/tx/${tx2.hash}`);
    await tx2.wait();
    console.log('✅ Condition updated to: true');
    
    // Get escrow details before release
    const escrowData = await escrow.escrows(escrowId);
    console.log('\n📊 Escrow Details:');
    console.log('├─ Deposit Amount:', hre.ethers.formatEther(depositAmount), 'ETH');
    console.log('├─ Net Amount:', hre.ethers.formatEther(escrowData.netAmount), 'ETH');
    console.log('├─ Service Fee:', hre.ethers.formatEther(depositAmount - escrowData.netAmount), 'ETH');
    console.log('└─ Target Token: USDC');
    
    // Check expected USDC output
    const expectedAmounts = await router.getAmountsOut(escrowData.netAmount, path);
    console.log('\n💱 Expected Swap Output:');
    console.log('└─ ~', hre.ethers.formatUnits(expectedAmounts[1], 6), 'USDC');
    
    // Release escrow (will trigger swap)
    console.log(chalk.blue('\n4️⃣ Releasing Escrow (Triggering ETH → USDC Swap)'));
    const contractAsBuyer = escrow.connect(buyer);
    const tx3 = await contractAsBuyer.releaseEscrow(escrowId);
    
    console.log('\n⏳ Swapping and releasing...');
    console.log(`📎 View on Sepolia: ${EXPLORER}/tx/${tx3.hash}`);
    
    const receipt3 = await tx3.wait();
    console.log('✅ Escrow released with swap in block:', receipt3.blockNumber);
    
    // Parse release event
    let releaseDetails = null;
    for (const log of receipt3.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowReleased') {
          releaseDetails = {
            seller: parsed.args.seller,
            token: parsed.args.token,
            amount: parsed.args.amount,
            releaseType: parsed.args.releaseType
          };
          break;
        }
      } catch (e) {}
    }
    
    if (releaseDetails) {
      console.log(chalk.green('\n✅ Swap & Release Complete:'));
      console.log('├─ Recipient:', releaseDetails.seller);
      console.log('├─ Token Sent: USDC');
      console.log('├─ Amount:', hre.ethers.formatUnits(releaseDetails.amount, 6), 'USDC');
      console.log('└─ Type:', releaseDetails.releaseType);
    }
    
    // Transaction Summary
    console.log(chalk.blue('\n📊 Transaction Summary'));
    console.log('======================');
    
    console.log('\n🔗 Transaction Links:');
    console.log(`├─ Escrow Creation: ${EXPLORER}/tx/${tx1.hash}`);
    console.log(`├─ Condition Update: ${EXPLORER}/tx/${tx2.hash}`);
    console.log(`└─ Swap & Release: ${EXPLORER}/tx/${tx3.hash}`);
    
    console.log('\n📍 Contract Links:');
    console.log(`├─ Escrow Contract: ${EXPLORER}/address/${config.escrowContract}`);
    console.log(`├─ USDC Token: ${EXPLORER}/token/${config.usdc}`);
    console.log(`└─ Uniswap Pair: ${EXPLORER}/address/${config.pair}`);
    
    console.log('\n💰 Verify Results:');
    console.log(`├─ Seller USDC Balance: ${EXPLORER}/token/${config.usdc}?a=${seller.address}`);
    console.log(`└─ Expected: ~${releaseDetails ? hre.ethers.formatUnits(releaseDetails.amount, 6) : 'Check logs'} USDC`);
    
    console.log(chalk.green('\n✅ Test completed successfully!'));
    
    console.log('\n💡 What Happened:');
    console.log('├─ Deposited 0.005 ETH into escrow');
    console.log('├─ Service fee (2%) = 0.0001 ETH deducted');
    console.log('├─ Remaining 0.0049 ETH swapped to USDC via Uniswap');
    console.log('├─ USDC sent directly to seller');
    console.log('└─ All done in a single transaction!');
    
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
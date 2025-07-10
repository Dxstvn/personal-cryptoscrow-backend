#!/usr/bin/env node
/**
 * Test minimal ETH -> USDC swap with existing pool
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

const EXPLORER = 'https://sepolia.etherscan.io';

async function main() {
  console.log(chalk.blue('🔄 Minimal Swap Test (ETH → USDC)'));
  console.log('=================================\n');
  
  // Configuration
  const config = {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    escrowContract: '0x3345F4adA7C290A94918aA44c2a3D28110f3bCdb'
  };
  
  // Get wallets
  const buyer = new hre.ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, hre.ethers.provider);
  const seller = new hre.ethers.Wallet(process.env.SELLER_WALLET_PRIVATE_KEY, hre.ethers.provider);
  
  console.log('👥 Participants:');
  console.log('├─ Buyer/Service:', buyer.address);
  console.log('└─ Seller:', seller.address);
  
  // Connect to escrow contract
  const escrow = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', config.escrowContract, buyer);
  
  // Use a very small amount due to pool issues
  const depositAmount = hre.ethers.parseEther('0.0001'); // 0.0001 ETH
  
  console.log(chalk.blue('\n1️⃣ Creating Same-Chain Swap Escrow'));
  console.log('├─ Amount:', hre.ethers.formatEther(depositAmount), 'ETH');
  console.log('├─ Target: USDC');
  console.log('└─ Note: Using minimal amount due to pool liquidity');
  
  try {
    // Create escrow
    const tx1 = await escrow.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress, // ETH
      depositAmount,
      config.usdc, // Target: USDC
      11155111, // Same chain (Sepolia)
      { value: depositAmount }
    );
    
    console.log('\n⏳ Creating escrow...');
    console.log(`📎 View: ${EXPLORER}/tx/${tx1.hash}`);
    
    const receipt1 = await tx1.wait();
    console.log('✅ Escrow created!');
    
    // Extract escrow ID
    let escrowId;
    for (const log of receipt1.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          break;
        }
      } catch (e) {}
    }
    
    console.log('📦 Escrow ID:', escrowId);
    
    // Update condition
    console.log(chalk.blue('\n2️⃣ Updating Condition'));
    const tx2 = await escrow.updateCondition(escrowId, true);
    console.log(`📎 View: ${EXPLORER}/tx/${tx2.hash}`);
    await tx2.wait();
    console.log('✅ Condition updated!');
    
    // Get escrow data
    const escrowData = await escrow.escrows(escrowId);
    console.log('\n📊 Escrow Details:');
    console.log('├─ Net Amount:', hre.ethers.formatEther(escrowData.netAmount), 'ETH');
    console.log('└─ Will swap to: USDC');
    
    // Release (triggers swap)
    console.log(chalk.blue('\n3️⃣ Releasing with Swap'));
    const tx3 = await escrow.releaseEscrow(escrowId);
    
    console.log('\n⏳ Swapping...');
    console.log(`📎 View: ${EXPLORER}/tx/${tx3.hash}`);
    
    const receipt3 = await tx3.wait();
    console.log('✅ Released!');
    
    // Check events
    for (const log of receipt3.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowReleased') {
          console.log(chalk.green('\n✅ Swap Complete:'));
          console.log('├─ Token: USDC');
          console.log('├─ Amount:', hre.ethers.formatUnits(parsed.args.amount, 6), 'USDC');
          console.log('└─ Sent to:', parsed.args.seller);
          break;
        }
      } catch (e) {}
    }
    
    console.log(chalk.blue('\n📊 Summary'));
    console.log('===========');
    console.log(`├─ Escrow: ${EXPLORER}/tx/${tx1.hash}`);
    console.log(`├─ Update: ${EXPLORER}/tx/${tx2.hash}`);
    console.log(`└─ Swap: ${EXPLORER}/tx/${tx3.hash}`);
    
    console.log('\n💰 Verify:');
    console.log(`└─ Seller USDC: ${EXPLORER}/token/${config.usdc}?a=${seller.address}`);
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    
    // If it's a swap error, suggest solution
    if (error.message.includes('INSUFFICIENT')) {
      console.log(chalk.yellow('\n💡 The pool likely has insufficient liquidity.'));
      console.log('Consider using an even smaller amount or adding liquidity first.');
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
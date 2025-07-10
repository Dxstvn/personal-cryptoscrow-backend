#!/usr/bin/env node
/**
 * Test cross-chain functionality between Sepolia and Arbitrum Sepolia
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🌉 Cross-chain Functionality Test'));
  console.log('=================================\n');
  
  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  // Configuration
  const config = {
    11155111: {
      name: 'Sepolia',
      contract: process.env.SEPOLIA_STARGATE_ENHANCED_CONTRACT,
      targetChainId: 421614,
      targetName: 'Arbitrum Sepolia'
    },
    421614: {
      name: 'Arbitrum Sepolia', 
      contract: process.env.ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT,
      targetChainId: 11155111,
      targetName: 'Sepolia'
    }
  };
  
  const currentConfig = config[chainId];
  if (!currentConfig) {
    throw new Error('Unsupported network');
  }
  
  console.log('📍 Source Chain:', currentConfig.name);
  console.log('📍 Target Chain:', currentConfig.targetName);
  console.log('📋 Contract:', currentConfig.contract);
  console.log('👤 Signer:', signer.address);
  
  const balance = await signer.provider.getBalance(signer.address);
  console.log('💰 Balance:', hre.ethers.formatEther(balance), 'ETH\n');
  
  // Connect to contract
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', currentConfig.contract);
  
  // Test 1: Check cross-chain configuration
  console.log(chalk.blue('1️⃣ Cross-chain Configuration:'));
  try {
    const mode = await contract.crossChainModes(currentConfig.targetChainId);
    const stargateChainId = await contract.chainIdToStargateId(currentConfig.targetChainId);
    const router = await contract.stargateRouters(currentConfig.targetChainId);
    const routerETH = await contract.stargateRouterETHs(currentConfig.targetChainId);
    
    console.log('├─ Mode:', ['DISABLED', 'LAYERZERO_OFT', 'STARGATE'][mode]);
    console.log('├─ Stargate Chain ID:', stargateChainId);
    console.log('├─ Stargate Router:', router);
    console.log('└─ Stargate RouterETH:', routerETH);
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
  
  // Test 2: Check if Stargate is available for ETH
  console.log(chalk.blue('\n2️⃣ Stargate Availability:'));
  try {
    const isAvailable = await contract.isStargateAvailable(
      currentConfig.targetChainId, 
      hre.ethers.ZeroAddress
    );
    console.log('├─ ETH bridging available:', isAvailable ? '✅ Yes' : '❌ No');
    
    // Check USDC availability
    const usdcAddress = chainId === 11155111
      ? '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590'
      : '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773';
      
    const usdcAvailable = await contract.isStargateAvailable(
      currentConfig.targetChainId,
      usdcAddress
    );
    console.log('└─ USDC bridging available:', usdcAvailable ? '✅ Yes' : '❌ No');
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
  
  // Test 3: Get cross-chain quote
  console.log(chalk.blue('\n3️⃣ Cross-chain Quote (0.01 ETH):'));
  try {
    const amount = hre.ethers.parseEther('0.01');
    const quote = await contract['getStargateQuote(uint256,address,uint256)'](
      currentConfig.targetChainId,
      hre.ethers.ZeroAddress,
      amount
    );
    
    console.log('├─ LayerZero Fee:', hre.ethers.formatEther(quote.fee), 'ETH');
    console.log('├─ Min Amount Out:', hre.ethers.formatEther(quote.minAmountOut), 'ETH');
    console.log('└─ Slippage:', ((1 - Number(quote.minAmountOut) / Number(amount)) * 100).toFixed(2), '%');
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
  
  // Test 4: Create and release a cross-chain escrow
  if (balance >= hre.ethers.parseEther('0.05')) {
    console.log(chalk.blue('\n4️⃣ Test Cross-chain Escrow:'));
    try {
      const amount = hre.ethers.parseEther('0.005');
      
      // Create cross-chain escrow
      console.log('Creating cross-chain escrow...');
      const tx1 = await contract.createEscrow(
        signer.address, // self as seller
        hre.ethers.ZeroAddress, // ETH
        amount,
        hre.ethers.ZeroAddress, // ETH
        currentConfig.targetChainId,
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
      
      // Get escrow details
      const escrow = await contract.escrows(escrowId);
      console.log('├─ Target Chain ID:', escrow.targetChainId);
      console.log('├─ Net Amount:', hre.ethers.formatEther(escrow.netAmount), 'ETH');
      
      // Update condition
      const tx2 = await contract.updateCondition(escrowId, true);
      await tx2.wait();
      console.log('✅ Condition updated');
      
      // Get quote for release
      const releaseQuote = await contract['getStargateQuote(uint256,address,uint256)'](
        currentConfig.targetChainId,
        hre.ethers.ZeroAddress,
        escrow.netAmount
      );
      console.log('├─ Bridge fee for release:', hre.ethers.formatEther(releaseQuote.fee), 'ETH');
      
      // Release with bridge fee
      console.log('Initiating cross-chain release...');
      const tx3 = await contract.releaseEscrow(escrowId, { value: releaseQuote.fee });
      const receipt3 = await tx3.wait();
      console.log('✅ Cross-chain release initiated:', receipt3.hash);
      
      // Check for Stargate events
      let stargateInitiated = false;
      for (const log of receipt3.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === 'StargateTransferInitiated') {
            stargateInitiated = true;
            console.log(chalk.green('\n✅ Stargate Transfer Details:'));
            console.log('├─ Destination Chain ID:', parsed.args.dstChainId);
            console.log('├─ Token:', parsed.args.token === hre.ethers.ZeroAddress ? 'ETH' : parsed.args.token);
            console.log('├─ Amount:', hre.ethers.formatEther(parsed.args.amount), 'ETH');
            console.log('└─ Recipient:', parsed.args.recipient);
          }
        } catch (e) {}
      }
      
      if (!stargateInitiated) {
        console.log(chalk.yellow('⚠️  No StargateTransferInitiated event found'));
      }
      
      console.log(chalk.cyan('\n📝 Note: Cross-chain transfer initiated. Funds will arrive on', currentConfig.targetName, 'in a few minutes.'));
      
    } catch (error) {
      console.log(chalk.red('❌ Error:'), error.message);
      if (error.data) {
        try {
          const decodedError = contract.interface.parseError(error.data);
          console.log('├─ Decoded error:', decodedError);
        } catch (e) {}
      }
    }
  } else {
    console.log(chalk.yellow('\n⚠️  Insufficient balance for cross-chain test (need 0.05 ETH)'));
  }
  
  // Test 5: Check transfer options
  console.log(chalk.blue('\n5️⃣ Transfer Options Analysis:'));
  try {
    const options = await contract.getTransferOptions(currentConfig.targetChainId);
    console.log('├─ Same Chain:', options.sameChain);
    console.log('├─ Has LayerZero:', options.hasLayerZero);
    console.log('├─ Has Stargate:', options.hasStargate);
    console.log('└─ Preferred Mode:', ['DISABLED', 'LAYERZERO_OFT', 'STARGATE'][options.preferredMode]);
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
  
  console.log(chalk.green('\n✅ Cross-chain functionality test completed!'));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
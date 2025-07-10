#!/usr/bin/env node
/**
 * Test cross-chain functionality with hardcoded fees and explorer links
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

// Explorer URLs
const EXPLORERS = {
  11155111: 'https://sepolia.etherscan.io',
  421614: 'https://sepolia.arbiscan.io'
};

const LAYERZERO_SCAN = 'https://testnet.layerzeroscan.com';

async function main() {
  console.log(chalk.blue('🌉 Cross-Chain Test with Transaction Tracking'));
  console.log('============================================\n');
  
  // Get wallets from environment
  const buyerKey = process.env.DEPLOYER_PRIVATE_KEY; // Using deployer as buyer
  const sellerKey = process.env.SELLER_WALLET_PRIVATE_KEY;
  const serviceKey = process.env.DEPLOYER_PRIVATE_KEY; // Service wallet is set to deployer in this contract
  
  if (!buyerKey || !sellerKey || !serviceKey) {
    throw new Error('Missing wallet private keys in .env');
  }
  
  const buyer = new hre.ethers.Wallet(buyerKey, hre.ethers.provider);
  const seller = new hre.ethers.Wallet(sellerKey, hre.ethers.provider);
  const service = new hre.ethers.Wallet(serviceKey, hre.ethers.provider);
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  // Configuration
  const config = {
    11155111: {
      name: 'Sepolia',
      contract: '0x3345F4adA7C290A94918aA44c2a3D28110f3bCdb', // Latest deployed contract with higher slippage
      targetChainId: 421614,
      targetName: 'Arbitrum Sepolia',
      fee: '0.002' // Hardcoded fee
    },
    421614: {
      name: 'Arbitrum Sepolia',
      contract: '0x49c15d963C0868A622c9a4fa863614846E415F23', // Latest deployed contract with higher slippage
      targetChainId: 11155111,
      targetName: 'Sepolia',
      fee: '0.001' // Hardcoded fee
    }
  };
  
  const currentConfig = config[chainId];
  if (!currentConfig) {
    throw new Error('Unsupported network');
  }
  
  console.log('📍 Source Chain:', currentConfig.name);
  console.log('📍 Target Chain:', currentConfig.targetName);
  console.log('📋 Contract:', currentConfig.contract);
  console.log('💸 Hardcoded Fee:', currentConfig.fee, 'ETH\n');
  
  console.log('👥 Participants:');
  console.log('├─ Buyer:', buyer.address);
  console.log('├─ Seller:', seller.address);
  console.log('└─ Service:', service.address);
  
  // Check balances
  const buyerBalance = await buyer.provider.getBalance(buyer.address);
  console.log('\n💰 Buyer Balance:', hre.ethers.formatEther(buyerBalance), 'ETH');
  
  if (buyerBalance < hre.ethers.parseEther('0.01')) {
    throw new Error('Insufficient buyer balance (need at least 0.01 ETH)');
  }
  
  // Connect to contract
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', currentConfig.contract, buyer);
  
  // Test parameters
  const depositAmount = hre.ethers.parseEther('0.005'); // 0.005 ETH deposit
  
  console.log(chalk.blue('\n🚀 Starting Cross-Chain Escrow Test'));
  console.log('===================================');
  
  // Step 1: Create cross-chain escrow
  console.log(chalk.cyan('\n1️⃣ Creating Cross-Chain Escrow'));
  console.log('├─ Amount:', hre.ethers.formatEther(depositAmount), 'ETH');
  console.log('├─ From:', currentConfig.name);
  console.log('└─ To:', currentConfig.targetName);
  
  try {
    const tx1 = await contract.createEscrow(
      seller.address,
      hre.ethers.ZeroAddress, // ETH
      depositAmount,
      hre.ethers.ZeroAddress, // ETH
      currentConfig.targetChainId,
      { value: depositAmount }
    );
    
    console.log('\n⏳ Transaction submitted...');
    console.log(`📎 View on ${currentConfig.name}: ${EXPLORERS[chainId]}/tx/${tx1.hash}`);
    
    const receipt1 = await tx1.wait();
    console.log('✅ Escrow created in block:', receipt1.blockNumber);
    
    // Extract escrow ID
    let escrowId;
    for (const log of receipt1.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          console.log('📦 Escrow ID:', escrowId);
          console.log('├─ Buyer:', parsed.args.buyer);
          console.log('├─ Seller:', parsed.args.seller);
          console.log('├─ Amount:', hre.ethers.formatEther(parsed.args.amount), 'ETH');
          console.log('└─ Target Chain:', parsed.args.targetChainId);
          break;
        }
      } catch (e) {}
    }
    
    // Step 2: Update condition (as service wallet)
    console.log(chalk.cyan('\n2️⃣ Updating Escrow Condition'));
    const contractAsService = contract.connect(service);
    
    const tx2 = await contractAsService.updateCondition(escrowId, true);
    console.log('\n⏳ Transaction submitted...');
    console.log(`📎 View on ${currentConfig.name}: ${EXPLORERS[chainId]}/tx/${tx2.hash}`);
    
    await tx2.wait();
    console.log('✅ Condition updated to: true');
    
    // Step 3: Get quote and release escrow
    console.log(chalk.cyan('\n3️⃣ Initiating Cross-Chain Release'));
    
    // Get escrow details
    const escrow = await contract.escrows(escrowId);
    console.log('├─ Net Amount:', hre.ethers.formatEther(escrow.netAmount), 'ETH');
    console.log('├─ Service Fee:', hre.ethers.formatEther(depositAmount - escrow.netAmount), 'ETH');
    
    // Get quote (will use hardcoded fee)
    const quote = await contract['getStargateQuote(uint256,address,uint256)'](
      currentConfig.targetChainId,
      hre.ethers.ZeroAddress,
      escrow.netAmount
    );
    console.log('├─ Bridge Fee:', hre.ethers.formatEther(quote.fee), 'ETH (hardcoded)');
    console.log('└─ Min Amount Out:', hre.ethers.formatEther(quote.minAmountOut), 'ETH');
    
    // Release escrow with bridge fee
    const contractAsBuyer = contract.connect(buyer);
    const tx3 = await contractAsBuyer.releaseEscrow(escrowId, { value: quote.fee });
    
    console.log('\n⏳ Cross-chain transfer initiated...');
    console.log(`📎 View on ${currentConfig.name}: ${EXPLORERS[chainId]}/tx/${tx3.hash}`);
    
    const receipt3 = await tx3.wait();
    console.log('✅ Release transaction confirmed in block:', receipt3.blockNumber);
    
    // Check for Stargate events
    let stargateDetails = null;
    for (const log of receipt3.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'StargateTransferInitiated') {
          stargateDetails = {
            dstChainId: parsed.args.dstChainId,
            token: parsed.args.token,
            amount: parsed.args.amount,
            router: parsed.args.router
          };
          break;
        }
      } catch (e) {}
    }
    
    if (stargateDetails) {
      console.log(chalk.green('\n✅ Stargate Transfer Initiated:'));
      console.log('├─ Destination Chain ID:', stargateDetails.dstChainId);
      console.log('├─ Token:', stargateDetails.token === hre.ethers.ZeroAddress ? 'ETH' : stargateDetails.token);
      console.log('├─ Amount:', hre.ethers.formatEther(stargateDetails.amount), 'ETH');
      console.log('└─ Router:', stargateDetails.router);
    }
    
    // Step 4: Provide tracking information
    console.log(chalk.blue('\n📊 Transaction Summary'));
    console.log('======================');
    
    console.log('\n🔗 Transaction Links:');
    console.log(`├─ Escrow Creation: ${EXPLORERS[chainId]}/tx/${tx1.hash}`);
    console.log(`├─ Condition Update: ${EXPLORERS[chainId]}/tx/${tx2.hash}`);
    console.log(`└─ Cross-Chain Release: ${EXPLORERS[chainId]}/tx/${tx3.hash}`);
    
    console.log('\n📍 Contract Links:');
    console.log(`├─ Source Contract: ${EXPLORERS[chainId]}/address/${currentConfig.contract}`);
    console.log(`└─ Check Internal Txns: ${EXPLORERS[chainId]}/address/${currentConfig.contract}#internaltx`);
    
    console.log('\n🌉 Cross-Chain Tracking:');
    console.log(`├─ LayerZero Scan: ${LAYERZERO_SCAN}/tx/${tx3.hash}`);
    console.log(`└─ Destination Chain: ${EXPLORERS[currentConfig.targetChainId]}/address/${seller.address}`);
    
    console.log(chalk.yellow('\n⏱️  Cross-Chain Status:'));
    console.log('├─ Funds should arrive in 1-3 minutes');
    console.log('├─ Check seller balance on', currentConfig.targetName);
    console.log(`└─ ${EXPLORERS[currentConfig.targetChainId]}/address/${seller.address}`);
    
    console.log(chalk.green('\n✅ Test completed successfully!'));
    console.log('\n💡 Notes:');
    console.log('├─ Used hardcoded fee of', currentConfig.fee, 'ETH');
    console.log('├─ Service fee deducted from deposit');
    console.log('└─ Bridge fee paid separately by buyer');
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    if (error.data) {
      try {
        const decodedError = contract.interface.parseError(error.data);
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
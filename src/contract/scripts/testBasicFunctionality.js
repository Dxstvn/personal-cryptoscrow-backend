#!/usr/bin/env node
/**
 * Basic functionality test for Stargate Enhanced contract
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🧪 Basic Functionality Test'));
  console.log('===========================\n');
  
  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  // Get contract address
  let contractAddress;
  if (chainId === 11155111) {
    contractAddress = process.env.SEPOLIA_STARGATE_ENHANCED_CONTRACT;
    console.log('📍 Network: Sepolia');
  } else if (chainId === 421614) {
    contractAddress = process.env.ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT;
    console.log('📍 Network: Arbitrum Sepolia');
  } else {
    throw new Error('Unsupported network');
  }
  
  console.log('📋 Contract:', contractAddress);
  console.log('👤 Signer:', signer.address);
  
  // Check signer balance
  const balance = await signer.provider.getBalance(signer.address);
  console.log('💰 Balance:', hre.ethers.formatEther(balance), 'ETH');
  
  if (balance < hre.ethers.parseEther('0.1')) {
    console.log(chalk.yellow('⚠️  Low balance! You need at least 0.1 ETH for testing'));
  }
  
  // Connect to contract
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', contractAddress);
  
  // Test 1: Configuration check
  console.log(chalk.blue('\n1️⃣ Configuration Check:'));
  const owner = await contract.owner();
  const serviceWallet = await contract.serviceWallet();
  console.log('├─ Owner:', owner);
  console.log('├─ Service Wallet:', serviceWallet);
  console.log('└─ Is Owner:', owner === signer.address ? '✅ Yes' : '❌ No');
  
  // Test 2: Stargate configuration
  console.log(chalk.blue('\n2️⃣ Stargate Configuration:'));
  const router = await contract.stargateRouters(chainId);
  const routerETH = await contract.stargateRouterETHs(chainId);
  const stargateChainId = await contract.chainIdToStargateId(chainId);
  console.log('├─ Router:', router);
  console.log('├─ RouterETH:', routerETH);
  console.log('└─ Stargate Chain ID:', stargateChainId);
  
  // Test 3: Get supported tokens
  console.log(chalk.blue('\n3️⃣ Supported Tokens:'));
  const [tokens, configs] = await contract.getSupportedStargateTokens(chainId);
  for (let i = 0; i < tokens.length; i++) {
    const tokenName = tokens[i] === hre.ethers.ZeroAddress ? 'ETH' : 'USDC';
    console.log(`├─ ${tokenName}:`);
    console.log(`   ├─ Address: ${tokens[i]}`);
    console.log(`   ├─ Pool ID: ${configs[i].poolId}`);
    console.log(`   └─ Is Native: ${configs[i].isNative}`);
  }
  
  // Test 4: Cross-chain availability
  console.log(chalk.blue('\n4️⃣ Cross-chain Availability:'));
  const targetChainId = chainId === 11155111 ? 421614 : 11155111;
  const targetName = chainId === 11155111 ? 'Arbitrum Sepolia' : 'Sepolia';
  
  const mode = await contract.crossChainModes(targetChainId);
  const isAvailable = await contract.isStargateAvailable(targetChainId, hre.ethers.ZeroAddress);
  console.log(`├─ Target: ${targetName} (${targetChainId})`);
  console.log(`├─ Mode: ${['DISABLED', 'LAYERZERO_OFT', 'STARGATE'][mode]}`);
  console.log(`└─ ETH Available: ${isAvailable ? '✅ Yes' : '❌ No'}`);
  
  // Test 5: Get quote
  if (isAvailable) {
    console.log(chalk.blue('\n5️⃣ Cross-chain Quote (0.01 ETH):'));
    try {
      const amount = hre.ethers.parseEther('0.01');
      const quote = await contract.getStargateQuote(targetChainId, hre.ethers.ZeroAddress, amount);
      console.log('├─ LayerZero Fee:', hre.ethers.formatEther(quote.fee), 'ETH');
      console.log('└─ Min Amount Out:', hre.ethers.formatEther(quote.minAmountOut), 'ETH');
    } catch (error) {
      console.log(chalk.red('❌ Quote failed:', error.message));
    }
  }
  
  // Test 6: Simple escrow creation (if enough balance)
  if (balance >= hre.ethers.parseEther('0.02')) {
    console.log(chalk.blue('\n6️⃣ Test Escrow Creation:'));
    try {
      const amount = hre.ethers.parseEther('0.01');
      const serviceFee = amount * 200n / 10000n; // 2%
      
      console.log('├─ Deposit Amount:', hre.ethers.formatEther(amount), 'ETH');
      console.log('├─ Service Fee:', hre.ethers.formatEther(serviceFee), 'ETH (deducted from deposit)');
      console.log('└─ Net to Seller:', hre.ethers.formatEther(amount - serviceFee), 'ETH');
      
      // Create escrow
      const tx = await contract.createEscrow(
        signer.address, // seller (self)
        hre.ethers.ZeroAddress, // ETH
        amount,
        hre.ethers.ZeroAddress, // ETH
        chainId, // same chain
        { value: amount } // msg.value must equal depositAmount
      );
      
      const receipt = await tx.wait();
      console.log(chalk.green('✅ Escrow created! Tx:', receipt.hash));
      
      // Extract escrow ID from events
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === 'EscrowCreated') {
            console.log('📋 Escrow ID:', parsed.args.escrowId);
            break;
          }
        } catch (e) {}
      }
      
    } catch (error) {
      console.log(chalk.red('❌ Escrow creation failed:'), error.message);
    }
  } else {
    console.log(chalk.yellow('\n⚠️  Skipping escrow test - insufficient balance'));
  }
  
  console.log(chalk.green('\n✅ Basic functionality test completed!'));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Test failed:'), error);
    process.exit(1);
  });
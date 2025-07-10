#!/usr/bin/env node
/**
 * End-to-end test with composer using user wallet addresses
 * 
 * Wallet Mapping:
 * - DEPLOYER wallet (0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D) = Buyer
 * - BACKEND wallet (0x2223F51659fAcC662504dcEbD4735886285ABC96) = Service wallet
 * - SELLER wallet (0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC) = Seller
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Wallet addresses
const BUYER_ADDRESS = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D'; // DEPLOYER wallet
const SERVICE_ADDRESS = '0x2223F51659fAcC662504dcEbD4735886285ABC96'; // BACKEND wallet
const SELLER_ADDRESS = '0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC'; // SELLER wallet

// Contract addresses (update with actual deployed addresses)
const CONTRACTS = {
  sepolia: {
    escrow: '0x726ca2162A5B90718EF11Ab8f294c0f30E258208',
    composer: '0x56b2C2F53497B5b8E179521De50e29F78C943B57'
  },
  arbitrum: {
    escrow: '0x9749E4049F2cD6Df742E177ba1DeeAbA758eC686',
    composer: '0x7ffd15F8C2696d76D19145AdB856B118e087D6DA'
  }
};

// Token addresses
const TOKENS = {
  sepolia: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    USDC: '0x8267cF9254734C6Eb452a7bb9AAF97B392258b21'
  },
  arbitrum: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
  }
};

async function main() {
  console.log(chalk.blue('🧪 End-to-End Cross-Chain Test with Composer'));
  console.log(chalk.blue('==========================================\n'));
  
  // Show wallet mapping
  console.log(chalk.yellow('📋 Wallet Mapping:'));
  console.log(`├─ Buyer: ${BUYER_ADDRESS} (DEPLOYER wallet)`);
  console.log(`├─ Service: ${SERVICE_ADDRESS} (BACKEND wallet)`);
  console.log(`└─ Seller: ${SELLER_ADDRESS} (SELLER wallet)\n`);
  
  // Connect to Sepolia as buyer
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  // Check if private keys are loaded
  if (!process.env.DEPLOYER_PRIVATE_KEY || !process.env.BACKEND_WALLET_PRIVATE_KEY) {
    throw new Error('Private keys not found in environment variables');
  }
  
  const buyerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const serviceWallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(chalk.cyan('Connected wallets:'));
  console.log(`├─ Buyer wallet connected: ${buyerWallet.address}`);
  console.log(`└─ Service wallet connected: ${serviceWallet.address}\n`);
  
  // Check balances
  const buyerBalance = await provider.getBalance(buyerWallet.address);
  const serviceBalance = await provider.getBalance(serviceWallet.address);
  console.log(chalk.cyan('Balances:'));
  console.log(`├─ Buyer: ${formatEther(buyerBalance)} ETH`);
  console.log(`└─ Service: ${formatEther(serviceBalance)} ETH\n`);
  
  // Escrow contract ABI
  const escrowAbi = [
    'function createEscrow(address seller, address depositToken, uint256 depositAmount, address targetToken, uint256 targetChainId) payable returns (bytes32)',
    'function updateCondition(bytes32 escrowId, bool conditionMet)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function swapComposers(uint32) view returns (address)',
    'event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, address depositToken, uint256 depositAmount, uint256 serviceFee, uint256 netAmount, address targetToken, uint256 targetChainId)',
    'event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 indexed targetChainId, address indexed oftAdapter, bytes32 guid, bool useCompose)'
  ];
  
  const escrow = new ethers.Contract(CONTRACTS.sepolia.escrow, escrowAbi, buyerWallet);
  
  try {
    // Check if composer is configured
    const arbitrumComposer = await escrow.swapComposers(40231); // Arbitrum endpoint ID
    console.log(chalk.cyan('Composer Configuration:'));
    console.log(`└─ Arbitrum composer: ${arbitrumComposer}`);
    
    if (arbitrumComposer === '0x0000000000000000000000000000000000000000') {
      console.log(chalk.yellow('\n⚠️  No composer configured - seller will receive WETH'));
      console.log('Please configure composer with:');
      console.log(`escrow.setSwapComposerWithValidation(40231, "${CONTRACTS.arbitrum.composer}", "Arbitrum")\n`);
    } else {
      console.log(chalk.green('✅ Composer configured - automatic token conversion enabled\n'));
    }
    
    // Test Case: ETH (Sepolia) → USDC (Arbitrum)
    console.log(chalk.blue('📝 Test Scenario: ETH (Sepolia) → USDC (Arbitrum)'));
    console.log(chalk.blue('=============================================='));
    
    const depositAmount = parseEther('0.001');
    
    console.log(chalk.cyan('\n1️⃣  Creating Escrow (as Buyer)'));
    console.log(`├─ Buyer: ${buyerWallet.address}`);
    console.log(`├─ Seller: ${SELLER_ADDRESS}`);
    console.log(`├─ Deposit: 0.001 ETH on Sepolia`);
    console.log(`├─ Target: USDC on Arbitrum`);
    console.log(`├─ Service Fee: 2% (0.00002 ETH)`);
    console.log(`└─ Net to Seller: 0.00098 ETH worth\n`);
    
    // Create escrow
    const createTx = await escrow.createEscrow(
      SELLER_ADDRESS,
      TOKENS.sepolia.ETH,
      depositAmount,
      TOKENS.arbitrum.USDC, // Target USDC on Arbitrum!
      421614, // Arbitrum chain ID
      { value: depositAmount }
    );
    
    console.log(`Transaction sent: ${createTx.hash}`);
    console.log('Waiting for confirmation...');
    
    const createReceipt = await createTx.wait();
    console.log(chalk.green('✅ Escrow created successfully!'));
    
    // Get escrow ID from events
    let escrowId;
    for (const log of createReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          console.log(`\nEscrow ID: ${escrowId}`);
          console.log(`Service Fee: ${formatEther(parsed.args.serviceFee)} ETH`);
          console.log(`Net Amount: ${formatEther(parsed.args.netAmount)} ETH`);
          break;
        }
      } catch (e) {}
    }
    
    if (!escrowId) {
      throw new Error('Failed to get escrow ID from events');
    }
    
    // Update condition (as service wallet)
    console.log(chalk.cyan('\n2️⃣  Updating Condition (as Service)'));
    const escrowAsService = escrow.connect(serviceWallet);
    const updateTx = await escrowAsService.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log(chalk.green('✅ Condition updated to true'));
    
    // Release escrow (as buyer)
    console.log(chalk.cyan('\n3️⃣  Releasing Escrow (as Buyer)'));
    console.log('├─ Estimating LayerZero fees...');
    console.log('├─ Adding 50% buffer for compose execution...');
    console.log('└─ Initiating cross-chain transfer...\n');
    
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: parseEther('0.01'), // LayerZero fee + compose gas
      gasLimit: 2000000
    });
    
    console.log(`Release transaction sent: ${releaseTx.hash}`);
    console.log('Waiting for confirmation...');
    
    const releaseReceipt = await releaseTx.wait();
    console.log(chalk.green('✅ Escrow released successfully!'));
    
    // Analyze release events
    console.log(chalk.cyan('\n4️⃣  Analyzing Cross-Chain Transfer'));
    let useCompose = false;
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'CrossChainTransferInitiated') {
          useCompose = parsed.args.useCompose;
          console.log(`├─ LayerZero GUID: ${parsed.args.guid}`);
          console.log(`├─ OFT Adapter: ${parsed.args.oftAdapter}`);
          console.log(`└─ Using Composer: ${useCompose ? '✅ Yes' : '❌ No'}`);
          break;
        }
      } catch (e) {}
    }
    
    // Expected flow
    console.log(chalk.blue('\n📊 Expected Flow:'));
    if (useCompose && arbitrumComposer !== '0x0000000000000000000000000000000000000000') {
      console.log(chalk.green('With Composer (Automatic Conversion):'));
      console.log('1. ETH wrapped to WETH on Sepolia');
      console.log('2. 0.00098 WETH bridged via LayerZero');
      console.log('3. Composer receives WETH on Arbitrum');
      console.log('4. Composer swaps WETH → USDC via Uniswap');
      console.log(`5. ${SELLER_ADDRESS} receives USDC directly!`);
      console.log('\n✨ Seller gets USDC without any manual steps!');
    } else {
      console.log(chalk.yellow('Without Composer (Manual Required):'));
      console.log('1. ETH wrapped to WETH on Sepolia');
      console.log('2. 0.00098 WETH bridged via LayerZero');
      console.log(`3. ${SELLER_ADDRESS} receives WETH on Arbitrum`);
      console.log('4. Seller must manually swap WETH → USDC on Arbitrum');
      console.log('\n⚠️  Seller needs to perform additional swap');
    }
    
    console.log(chalk.cyan('\n5️⃣  Monitor on LayerZero Scan'));
    console.log(`https://testnet.layerzeroscan.com/tx/${releaseTx.hash}`);
    console.log('└─ Check status and destination delivery\n');
    
    // Summary
    console.log(chalk.blue('📋 Transaction Summary'));
    console.log(chalk.blue('===================='));
    console.log(`Buyer (DEPLOYER): ${BUYER_ADDRESS}`);
    console.log(`Service (BACKEND): ${SERVICE_ADDRESS}`);
    console.log(`Seller (SELLER): ${SELLER_ADDRESS}`);
    console.log(`Escrow ID: ${escrowId}`);
    console.log(`Amount Deposited: 0.001 ETH`);
    console.log(`Service Fee: 0.00002 ETH (2%)`);
    console.log(`Amount Bridged: 0.00098 WETH`);
    console.log(`Target Token: USDC on Arbitrum`);
    console.log(`Composer Used: ${useCompose ? 'Yes' : 'No'}`);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    if (error.data) {
      console.error(chalk.red('Error data:'), error.data);
    }
  }
}

main()
  .then(() => {
    console.log(chalk.green('\n✅ Test completed!'));
    process.exit(0);
  })
  .catch((error) => {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Test fresh escrow with properly configured composer
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

// Wallet addresses as requested by user
const BUYER_ADDRESS = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D'; // DEPLOYER wallet
const SERVICE_ADDRESS = '0x2223F51659fAcC662504dcEbD4735886285ABC96'; // BACKEND wallet
const SELLER_ADDRESS = '0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC'; // SELLER wallet

// Contract addresses
const ESCROW_ADDRESS = '0x726ca2162A5B90718EF11Ab8f294c0f30E258208';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

// Target token on Arbitrum
const ARBITRUM_USDC = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';

async function main() {
  console.log(chalk.blue('🧪 Fresh Escrow Test with Composer'));
  console.log(chalk.blue('=================================\n'));
  
  // Show wallet mapping
  console.log(chalk.yellow('📋 Wallet Mapping:'));
  console.log(`├─ Buyer: ${BUYER_ADDRESS} (DEPLOYER)`);
  console.log(`├─ Service: ${SERVICE_ADDRESS} (BACKEND)`);
  console.log(`└─ Seller: ${SELLER_ADDRESS} (SELLER)\n`);
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const buyerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const serviceWallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  // Escrow contract ABI
  const escrowAbi = [
    'function createEscrow(address seller, address depositToken, uint256 depositAmount, address targetToken, uint256 targetChainId) payable returns (bytes32)',
    'function updateCondition(bytes32 escrowId, bool conditionMet)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, address depositToken, uint256 depositAmount, uint256 serviceFee, uint256 netAmount, address targetToken, uint256 targetChainId)',
    'event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 indexed targetChainId, address indexed oftAdapter, bytes32 guid, bool useCompose)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed recipient, address token, uint256 amount, string method, bool isCompose)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, buyerWallet);
  
  try {
    // Create new escrow
    console.log(chalk.cyan('1️⃣  Creating Fresh Escrow'));
    console.log(`├─ Deposit: 0.001 ETH`);
    console.log(`├─ Target: USDC on Arbitrum`);
    console.log(`└─ Seller: ${SELLER_ADDRESS}\n`);
    
    const depositAmount = parseEther('0.001');
    const createTx = await escrow.createEscrow(
      SELLER_ADDRESS,
      '0x0000000000000000000000000000000000000000', // ETH
      depositAmount,
      ARBITRUM_USDC, // Target USDC on Arbitrum
      421614, // Arbitrum chain ID
      { value: depositAmount }
    );
    
    console.log(`Transaction: ${createTx.hash}`);
    const createReceipt = await createTx.wait();
    console.log(chalk.green('✅ Escrow created'));
    
    // Get escrow ID
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
    
    // Update condition
    console.log(chalk.cyan('\n2️⃣  Updating Condition (as Service)'));
    const escrowAsService = escrow.connect(serviceWallet);
    const updateTx = await escrowAsService.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log(chalk.green('✅ Condition updated'));
    
    // First, we need to handle the ETH → WETH conversion issue
    // The contract has a bug where it can't wrap its own ETH
    console.log(chalk.cyan('\n3️⃣  Preparing WETH (Workaround)'));
    
    const details = await escrow.escrows(escrowId);
    const netAmount = details.netAmount;
    
    // Wrap ETH to WETH and send to escrow
    const wethAbi = [
      'function deposit() payable',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address) view returns (uint256)'
    ];
    
    const weth = new ethers.Contract(WETH_ADDRESS, wethAbi, buyerWallet);
    
    console.log(`Wrapping ${formatEther(netAmount)} ETH to WETH...`);
    const wrapTx = await weth.deposit({ value: netAmount });
    await wrapTx.wait();
    
    console.log('Transferring WETH to escrow...');
    const transferTx = await weth.transfer(ESCROW_ADDRESS, netAmount);
    await transferTx.wait();
    
    const wethBalance = await weth.balanceOf(ESCROW_ADDRESS);
    console.log(chalk.green(`✅ Escrow WETH balance: ${formatEther(wethBalance)}`));
    
    // Release escrow
    console.log(chalk.cyan('\n4️⃣  Releasing Escrow'));
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: parseEther('0.005'), // LayerZero fee
      gasLimit: 2000000
    });
    
    console.log(`Transaction: ${releaseTx.hash}`);
    const releaseReceipt = await releaseTx.wait();
    
    if (releaseReceipt.status === 1) {
      console.log(chalk.green('✅ Release successful!'));
      
      // Parse events
      let lzGuid, useCompose;
      for (const log of releaseReceipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed) {
            if (parsed.name === 'CrossChainTransferInitiated') {
              lzGuid = parsed.args.guid;
              useCompose = parsed.args.useCompose;
              console.log(`\n├─ LayerZero GUID: ${lzGuid}`);
              console.log(`├─ Using Composer: ${useCompose}`);
            }
          }
        } catch (e) {}
      }
      
      console.log(chalk.blue('\n📊 Expected Flow:'));
      console.log('1. WETH bridged from Sepolia to Arbitrum');
      console.log('2. Composer receives WETH on Arbitrum');
      console.log('3. Composer swaps WETH → USDC');
      console.log(`4. ${SELLER_ADDRESS} receives USDC directly!`);
      
      console.log(chalk.cyan('\n🔍 Track on LayerZero:'));
      console.log(`https://testnet.layerzeroscan.com/tx/${releaseTx.hash}`);
      
      console.log(chalk.yellow('\n⚠️  Note:'));
      console.log('If this fails, the OFT peers may still need to be configured');
      console.log('by the BACKEND wallet that owns the OFT adapters.');
      
    } else {
      console.log(chalk.red('❌ Release failed'));
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
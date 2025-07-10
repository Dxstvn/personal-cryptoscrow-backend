#!/usr/bin/env node
/**
 * Test complete cross-chain flow with fixed contract and peers
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

// Fixed contract address
const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';
const ARBITRUM_WETH = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';

async function checkArbitrumBalance() {
  const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const wethAbi = ['function balanceOf(address) view returns (uint256)'];
  const weth = new ethers.Contract(ARBITRUM_WETH, wethAbi, arbitrumProvider);
  
  const balance = await weth.balanceOf(SELLER_ADDRESS);
  return formatEther(balance);
}

async function main() {
  console.log(chalk.blue('🚀 Testing Complete Cross-Chain Flow'));
  console.log(chalk.blue('==================================\n'));
  
  // Show initial Arbitrum balance
  const initialBalance = await checkArbitrumBalance();
  console.log(chalk.yellow('📊 Initial Arbitrum WETH Balance:'));
  console.log(`Seller (${SELLER_ADDRESS}): ${initialBalance} WETH\n`);
  
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
    console.log(chalk.cyan('1️⃣  Creating Escrow'));
    console.log(`├─ Deposit: 0.001 ETH`);
    console.log(`├─ Target: WETH on Arbitrum`);
    console.log(`└─ Seller: ${SELLER_ADDRESS}\n`);
    
    const depositAmount = parseEther('0.001');
    const createTx = await escrow.createEscrow(
      SELLER_ADDRESS,
      '0x0000000000000000000000000000000000000000', // ETH
      depositAmount,
      ARBITRUM_WETH, // Target WETH on Arbitrum
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
          console.log(`Net Amount: ${formatEther(parsed.args.netAmount)} ETH`);
          break;
        }
      } catch (e) {}
    }
    
    // Update condition
    console.log(chalk.cyan('\n2️⃣  Updating Condition'));
    const escrowAsService = escrow.connect(serviceWallet);
    const updateTx = await escrowAsService.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log(chalk.green('✅ Condition updated'));
    
    // Release escrow
    console.log(chalk.cyan('\n3️⃣  Releasing Escrow'));
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: parseEther('0.01'), // LayerZero fee
      gasLimit: 2000000
    });
    
    console.log(`Transaction: ${releaseTx.hash}`);
    const releaseReceipt = await releaseTx.wait();
    
    if (releaseReceipt.status === 1) {
      console.log(chalk.green('✅ Release successful!'));
      
      // Parse events
      let lzGuid;
      for (const log of releaseReceipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed && parsed.name === 'CrossChainTransferInitiated') {
            lzGuid = parsed.args.guid;
            console.log(`\n├─ LayerZero GUID: ${lzGuid}`);
          }
        } catch (e) {}
      }
      
      console.log(chalk.cyan('\n🔍 Track on LayerZero:'));
      console.log(`https://testnet.layerzeroscan.com/tx/${releaseTx.hash}`);
      
      // Wait a bit for cross-chain message
      console.log(chalk.yellow('\n⏳ Waiting 30s for cross-chain delivery...'));
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Check final balance
      const finalBalance = await checkArbitrumBalance();
      console.log(chalk.yellow('\n📊 Final Arbitrum WETH Balance:'));
      console.log(`Seller: ${finalBalance} WETH`);
      
      const received = parseFloat(finalBalance) - parseFloat(initialBalance);
      if (received > 0) {
        console.log(chalk.green(`\n✅ SUCCESS! Seller received ${received.toFixed(6)} WETH on Arbitrum!`));
      } else {
        console.log(chalk.yellow('\n⏳ Transfer may still be processing. Check LayerZero scan for status.'));
      }
      
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
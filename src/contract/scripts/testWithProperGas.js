#!/usr/bin/env node
/**
 * Test escrow release with proper gas configuration
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Addresses
const BUYER_ADDRESS = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D';
const SERVICE_ADDRESS = '0x2223F51659fAcC662504dcEbD4735886285ABC96';
const SELLER_ADDRESS = '0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC';
const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';

async function main() {
  console.log(chalk.blue('🚀 Testing Escrow with Proper Gas'));
  console.log(chalk.blue('================================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const buyerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const serviceWallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
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
  
  console.log(chalk.yellow('💡 Key Insights from Research:'));
  console.log('1. Our implementation is correct - we approve and the OFT pulls tokens');
  console.log('2. The simple test worked, so the issue might be gas-related');
  console.log('3. LayerZero needs sufficient gas for destination execution\n');
  
  try {
    // Create escrow
    console.log(chalk.cyan('1️⃣  Creating Escrow'));
    const depositAmount = parseEther('0.001');
    const createTx = await escrow.createEscrow(
      SELLER_ADDRESS,
      '0x0000000000000000000000000000000000000000', // ETH
      depositAmount,
      '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', // WETH on Arbitrum
      421614,
      { value: depositAmount }
    );
    
    const createReceipt = await createTx.wait();
    console.log(chalk.green('✅ Escrow created'));
    
    // Get escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          console.log(`Escrow ID: ${escrowId}`);
          break;
        }
      } catch (e) {}
    }
    
    // Update condition
    console.log(chalk.cyan('\n2️⃣  Updating Condition'));
    const escrowAsService = escrow.connect(serviceWallet);
    await (await escrowAsService.updateCondition(escrowId, true)).wait();
    console.log(chalk.green('✅ Condition updated'));
    
    // Release with higher gas
    console.log(chalk.cyan('\n3️⃣  Releasing with Sufficient Gas'));
    console.log(chalk.yellow('📍 Using 0.02 ETH for LayerZero fees (higher than before)'));
    
    const releaseTx = await escrow.releaseEscrow(escrowId, {
      value: parseEther('0.02'), // Higher fee
      gasLimit: 2000000
    });
    
    console.log(`Transaction: ${releaseTx.hash}`);
    const releaseReceipt = await releaseTx.wait();
    
    if (releaseReceipt.status === 1) {
      console.log(chalk.green('✅ Release successful!'));
      
      // Parse events
      for (const log of releaseReceipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed && parsed.name === 'CrossChainTransferInitiated') {
            console.log(`\nLayerZero GUID: ${parsed.args.guid}`);
          }
        } catch (e) {}
      }
      
      console.log(chalk.cyan('\n🔍 Track on LayerZero:'));
      console.log(`https://testnet.layerzeroscan.com/tx/${releaseTx.hash}`);
      
      // Monitor for 1 minute
      console.log(chalk.yellow('\n⏳ Monitoring for cross-chain delivery...'));
      
      const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
      const wethAbi = ['function balanceOf(address) view returns (uint256)'];
      const arbitrumWeth = new ethers.Contract('0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', wethAbi, arbitrumProvider);
      
      let delivered = false;
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        const balance = await arbitrumWeth.balanceOf(SELLER_ADDRESS);
        
        if (balance > 0n) {
          console.log(chalk.green(`\n✅ SUCCESS! Seller received ${formatEther(balance)} WETH on Arbitrum!`));
          delivered = true;
          break;
        } else {
          process.stdout.write('.');
        }
      }
      
      if (!delivered) {
        console.log(chalk.yellow('\n\n⏱️  Still processing. Check LayerZero scan for status.'));
        
        // Check OFT balance
        const sepoliaWeth = new ethers.Contract('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', wethAbi, provider);
        const oftBalance = await sepoliaWeth.balanceOf('0x51aF053a6BB282284E4407FaDfd13b09D93B82eE');
        console.log(`Sepolia OFT WETH balance: ${formatEther(oftBalance)}`);
      }
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
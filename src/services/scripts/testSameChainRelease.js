#!/usr/bin/env node
/**
 * Test same-chain release to verify the escrow works
 * This avoids cross-chain complexity while we sort out Arbitrum
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
// Use one of the existing escrows that's already created
const EXISTING_ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';

async function testSameChain() {
  console.log(chalk.blue('🧪 Testing Same-Chain Release'));
  console.log(chalk.blue('============================='));
  console.log('This will test if your escrow contract can release funds');
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function createEscrow(address seller, address depositToken, uint256 amount, address targetToken, uint256 targetChainId) payable returns (bytes32)',
    'function updateCondition(bytes32 escrowId, bool conditionMet)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'function serviceWallet() view returns (address)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Option 1: Try to modify existing escrow for same-chain
    console.log(chalk.cyan('Checking existing escrow:'));
    const existingEscrow = await escrow.escrows(EXISTING_ESCROW_ID);
    console.log(`Amount: ${formatEther(existingEscrow.depositAmount)} ETH`);
    console.log(`Target Chain: ${existingEscrow.targetChainId}`);
    console.log(`Released: ${existingEscrow.released ? '✅' : '❌'}`);
    
    // Option 2: Create a new same-chain escrow
    console.log(chalk.cyan('\n📝 Creating new same-chain escrow:'));
    
    const seller = ethers.Wallet.createRandom().address;
    const amount = '0.0001';
    
    console.log(`Seller: ${seller}`);
    console.log(`Amount: ${amount} ETH`);
    console.log(`Chain: Sepolia → Sepolia (same-chain)`);
    
    // Create same-chain escrow
    const createTx = await escrow.createEscrow(
      seller,
      ethers.ZeroAddress, // ETH
      parseEther(amount),
      ethers.ZeroAddress, // ETH
      11155111, // Same chain - Sepolia!
      { value: parseEther(amount) }
    );
    
    console.log(`Creating... TX: https://sepolia.etherscan.io/tx/${createTx.hash}`);
    const createReceipt = await createTx.wait();
    
    // Get escrow ID from events
    const iface = new ethers.Interface([
      'event EscrowCreated(bytes32 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount)'
    ]);
    
    let escrowId;
    for (const log of createReceipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          break;
        }
      } catch (e) {}
    }
    
    console.log(chalk.green(`✅ Escrow created: ${escrowId}`));
    
    // Set condition
    console.log(chalk.cyan('\n🔄 Setting condition:'));
    const condTx = await escrow.updateCondition(escrowId, true);
    await condTx.wait();
    console.log(chalk.green('✅ Condition set'));
    
    // Check seller balance before
    const sellerBalanceBefore = await provider.getBalance(seller);
    console.log(`\nSeller balance before: ${formatEther(sellerBalanceBefore)} ETH`);
    
    // Release same-chain (no LayerZero fees needed!)
    console.log(chalk.cyan('\n🚀 Releasing same-chain:'));
    const releaseTx = await escrow.releaseEscrow(escrowId, { gasLimit: 300000 });
    console.log(`TX: https://sepolia.etherscan.io/tx/${releaseTx.hash}`);
    
    const releaseReceipt = await releaseTx.wait();
    console.log(chalk.green('✅ Transaction confirmed!'));
    
    // Check seller balance after
    const sellerBalanceAfter = await provider.getBalance(seller);
    const received = sellerBalanceAfter - sellerBalanceBefore;
    
    console.log(`\nSeller balance after: ${formatEther(sellerBalanceAfter)} ETH`);
    console.log(`Received: ${formatEther(received)} ETH`);
    
    const expectedAmount = parseEther(amount) * 98n / 100n; // 2% fee
    console.log(`Expected (98%): ${formatEther(expectedAmount)} ETH`);
    
    if (received >= expectedAmount) {
      console.log(chalk.green('\n🎉 SUCCESS! Same-chain release works perfectly!'));
      console.log('Your escrow contract is functioning correctly.');
      console.log('\nFor cross-chain, you need:');
      console.log('1. ETH on Arbitrum to deploy OFT adapter there');
      console.log('2. Configure trusted remotes between OFT adapters');
    }
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
    if (error.data) {
      console.log('Error data:', error.data);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testSameChain().catch(console.error);
}
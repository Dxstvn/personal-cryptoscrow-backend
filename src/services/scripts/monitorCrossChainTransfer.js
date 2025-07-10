#!/usr/bin/env node
/**
 * Monitor a cross-chain transfer from creation to destination
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const ESCROW_CONTRACT = '0xDb3C220fc27f1459af0Fe489830De080151C090b';

async function monitorTransfer() {
  console.log(chalk.blue('🔍 Cross-Chain Transfer Monitor'));
  console.log(chalk.blue('=============================='));
  
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  
  // Create a specific seller address we can track
  const sellerWallet = ethers.Wallet.createRandom();
  const seller = sellerWallet.address;
  
  console.log('📍 Tracking Address:', seller);
  console.log('This address will receive WETH on Arbitrum\n');
  
  const escrowAbi = [
    'function createEscrow(address,address,uint256,address,uint256) payable returns (bytes32)',
    'function updateCondition(bytes32,bool)',
    'function releaseEscrow(bytes32) payable',
    'event EscrowCreated(bytes32 indexed, address indexed, address indexed, address, uint256, uint256, uint256, address, uint256)',
    'event CrossChainTransferInitiated(bytes32 indexed, uint256 indexed, address indexed, bytes32, bool)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_CONTRACT, escrowAbi, sepoliaWallet);
  
  try {
    // Step 1: Create cross-chain escrow
    console.log(chalk.cyan('Step 1: Creating Cross-Chain Escrow'));
    const amount = parseEther('0.0001');
    
    const createTx = await escrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000', // ETH
      amount,
      '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', // Arbitrum WETH
      421614,
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    
    // Get escrow ID from logs
    let escrowId;
    for (const log of createReceipt.logs) {
      if (log.topics.length > 1) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    console.log('✅ Escrow created');
    console.log('Escrow ID:', escrowId);
    console.log('Amount:', formatEther(amount), 'ETH → WETH');
    
    // Step 2: Update and release
    console.log(chalk.cyan('\nStep 2: Releasing Cross-Chain'));
    
    await escrow.updateCondition(escrowId, true);
    console.log('✅ Condition updated');
    
    const releaseTx = await escrow.releaseEscrow(escrowId, { 
      value: parseEther('0.01'),
      gasLimit: 2000000 
    });
    
    const releaseReceipt = await releaseTx.wait();
    console.log('✅ Released on Sepolia');
    console.log('TX:', `https://sepolia.etherscan.io/tx/${releaseTx.hash}`);
    
    // Get LayerZero GUID
    let lzGuid;
    for (const log of releaseReceipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'CrossChainTransferInitiated') {
          lzGuid = parsed.args[3];
          break;
        }
      } catch {}
    }
    
    if (lzGuid) {
      console.log('LayerZero GUID:', lzGuid);
    }
    
    // Step 3: Monitor destination
    console.log(chalk.cyan('\nStep 3: Monitoring Arbitrum for WETH arrival'));
    
    const wethAddress = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const arbitrumWeth = new ethers.Contract(wethAddress, wethAbi, arbitrumProvider);
    
    console.log('Checking every 10 seconds for 3 minutes...\n');
    
    let found = false;
    const startTime = Date.now();
    const timeout = 180000; // 3 minutes
    
    while (!found && (Date.now() - startTime) < timeout) {
      const balance = await arbitrumWeth.balanceOf(seller);
      
      if (balance > 0n) {
        found = true;
        console.log(chalk.green('🎉 WETH RECEIVED ON ARBITRUM!'));
        console.log('Amount:', formatEther(balance), 'WETH');
        console.log('Recipient:', seller);
        console.log('Token Contract:', wethAddress);
        console.log('View on Arbiscan:', `https://sepolia.arbiscan.io/address/${seller}`);
        
        console.log(chalk.yellow('\n📊 Transfer Summary:'));
        console.log('1. User deposited ETH on Sepolia');
        console.log('2. Contract wrapped ETH → WETH');
        console.log('3. Contract bridged WETH via LayerZero');
        console.log('4. Seller received WETH on Arbitrum');
        console.log('\nℹ️  Note: Seller must manually swap WETH to desired token');
      } else {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        process.stdout.write(`\r⏳ Waiting... ${elapsed}s (Balance: 0 WETH)`);
      }
      
      if (!found) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second intervals
      }
    }
    
    if (!found) {
      console.log(chalk.yellow('\n\n⏰ Timeout after 3 minutes'));
      console.log('Transfer may still be processing. Check:');
      console.log('1. LayerZero Scan: https://layerzeroscan.com');
      console.log('2. Arbitrum address:', `https://sepolia.arbiscan.io/address/${seller}`);
    }
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
  }
}

// Run monitor
monitorTransfer().catch(console.error);
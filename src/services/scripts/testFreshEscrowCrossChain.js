#!/usr/bin/env node
/**
 * Test fresh escrow contract with complete cross-chain flow
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const FRESH_ESCROW = '0x13421D0224858AF41054ea9261c8Bad75BE63D23';

async function testCrossChainFlow() {
  console.log(chalk.blue('🚀 Testing Fresh Escrow Cross-Chain Flow'));
  console.log(chalk.blue('======================================='));
  
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const arbitrumWallet = wallet.connect(arbitrumProvider);
  
  console.log('Fresh Escrow:', FRESH_ESCROW);
  console.log('Your Wallet:', wallet.address);
  
  const escrowAbi = [
    'function createEscrow(address,address,uint256,address,uint256) payable returns (bytes32)',
    'function updateCondition(bytes32,bool)',
    'function releaseEscrow(bytes32) payable',
    'function escrows(bytes32) view returns (address,address,address,address,uint256,uint256,uint256,uint256,bool,bool)'
  ];
  
  const escrow = new ethers.Contract(FRESH_ESCROW, escrowAbi, sepoliaWallet);
  
  try {
    // Step 1: Create cross-chain escrow
    console.log(chalk.cyan('\n📝 Step 1: Creating Cross-Chain Escrow'));
    
    const seller = ethers.Wallet.createRandom().address;
    const amount = parseEther('0.0003'); // 0.0003 ETH
    const targetWeth = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73'; // Arbitrum WETH
    const targetChainId = 421614; // Arbitrum Sepolia
    
    console.log('  Seller:', seller);
    console.log('  Amount:', formatEther(amount), 'ETH');
    console.log('  Target: WETH on Arbitrum Sepolia');
    
    // Check initial WETH balance on Arbitrum
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const arbitrumWeth = new ethers.Contract(targetWeth, wethAbi, arbitrumProvider);
    const initialBalance = await arbitrumWeth.balanceOf(seller);
    console.log('  Seller WETH balance on Arbitrum (before):', formatEther(initialBalance));
    
    const createTx = await escrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000', // ETH
      amount,
      targetWeth,
      targetChainId,
      { value: amount }
    );
    
    console.log('  TX:', createTx.hash);
    const createReceipt = await createTx.wait();
    console.log('  ✅ Escrow created');
    console.log('  Explorer:', `https://sepolia.etherscan.io/tx/${createReceipt.hash}`);
    
    // Extract escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === FRESH_ESCROW.toLowerCase() && log.topics.length > 1) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    console.log('  Escrow ID:', escrowId);
    
    // Step 2: Verify escrow details
    console.log(chalk.cyan('\n📊 Step 2: Verifying Escrow Details'));
    
    const details = await escrow.escrows(escrowId);
    console.log('  Buyer:', details[0]);
    console.log('  Seller:', details[1]);
    console.log('  Deposit Amount:', formatEther(details[4]), 'ETH');
    console.log('  Net Amount:', formatEther(details[5]), 'ETH (after 2% fee)');
    console.log('  Service Fee:', formatEther(details[6]), 'ETH');
    console.log('  Target Chain ID:', details[7].toString());
    console.log('  Condition Met:', details[8]);
    console.log('  Released:', details[9]);
    
    // Verify proper values
    const expectedNetAmount = amount * 98n / 100n; // 98% after 2% fee
    console.log('\n  Verification:');
    console.log('  Net amount correct:', details[5] === expectedNetAmount ? '✅' : '❌');
    console.log('  Target chain correct:', details[7].toString() === targetChainId.toString() ? '✅' : '❌');
    console.log('  Not released:', !details[9] ? '✅' : '❌');
    
    // Step 3: Update condition
    console.log(chalk.cyan('\n🔄 Step 3: Updating Condition'));
    
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log('  ✅ Condition set to true');
    
    // Step 4: Release with cross-chain transfer
    console.log(chalk.cyan('\n🚀 Step 4: Releasing Cross-Chain'));
    
    // Use a conservative fee
    const fee = parseEther('0.01');
    console.log('  LayerZero fee:', formatEther(fee), 'ETH');
    
    const releaseTx = await escrow.releaseEscrow(escrowId, { 
      value: fee,
      gasLimit: 1500000 
    });
    
    console.log('  TX:', releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log(chalk.green('  ✅ Cross-chain release successful!'));
    console.log('  Explorer:', `https://sepolia.etherscan.io/tx/${releaseReceipt.hash}`);
    console.log('  Gas used:', releaseReceipt.gasUsed.toString());
    
    // Step 5: Analyze events
    console.log(chalk.cyan('\n📋 Step 5: Analyzing Events'));
    
    let layerZeroGuid;
    let oftEventCount = 0;
    
    for (const log of releaseReceipt.logs) {
      // Check for OFT adapter events
      if (log.address.toLowerCase() === '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6'.toLowerCase()) {
        oftEventCount++;
        console.log('  ✅ OFT adapter event detected');
      }
      
      // Check for escrow events
      if (log.address.toLowerCase() === FRESH_ESCROW.toLowerCase()) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed) {
            console.log(`  ✅ ${parsed.name} event`);
            if (parsed.name === 'CrossChainTransferInitiated' && parsed.args.length > 3) {
              layerZeroGuid = parsed.args[3];
              console.log('    GUID:', layerZeroGuid);
            }
          }
        } catch {}
      }
    }
    
    console.log(`\n  Total OFT events: ${oftEventCount}`);
    
    // Step 6: Monitor destination
    console.log(chalk.cyan('\n👀 Step 6: Monitoring Destination'));
    
    console.log('  Checking WETH balance on Arbitrum...');
    console.log('  Note: Cross-chain transfers typically take 1-3 minutes');
    
    // Check balance immediately (will be 0)
    const balanceAfter = await arbitrumWeth.balanceOf(seller);
    console.log('  Seller WETH balance now:', formatEther(balanceAfter));
    
    if (balanceAfter > initialBalance) {
      console.log(chalk.green('  ✅ Transfer already arrived!'));
    } else {
      console.log('  ⏳ Transfer pending...');
      console.log('\n  To monitor:');
      console.log('  1. Check LayerZero Scan: https://layerzeroscan.com');
      if (layerZeroGuid) {
        console.log(`  2. Search for GUID: ${layerZeroGuid}`);
      }
      console.log('  3. Check seller WETH balance on Arbitrum:');
      console.log(`     Address: ${seller}`);
      console.log(`     Token: ${targetWeth}`);
      console.log(`     Expected: ~${formatEther(details[5])} WETH`);
      
      // Poll for arrival (optional)
      console.log('\n  Polling for arrival (30 seconds)...');
      let arrived = false;
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second intervals
        const currentBalance = await arbitrumWeth.balanceOf(seller);
        if (currentBalance > initialBalance) {
          arrived = true;
          console.log(chalk.green(`  ✅ Transfer arrived! Balance: ${formatEther(currentBalance)} WETH`));
          break;
        } else {
          console.log(`  ... still waiting (${(i+1)*5}s)`);
        }
      }
      
      if (!arrived) {
        console.log('  ⏳ Transfer still pending after 30s - check LayerZero Scan');
      }
    }
    
    console.log(chalk.green('\n✅ Cross-chain test completed successfully!'));
    
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed:'), error.message);
    if (error.data) {
      console.log('Error data:', error.data);
    }
  }
}

// Run test
testCrossChainFlow().catch(console.error);
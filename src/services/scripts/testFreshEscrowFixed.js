#!/usr/bin/env node
/**
 * Test fresh escrow with correct struct handling
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const FRESH_ESCROW = '0x13421D0224858AF41054ea9261c8Bad75BE63D23';

async function testCrossChain() {
  console.log(chalk.blue('🚀 Testing Fresh Escrow - Correct Struct Handling'));
  console.log(chalk.blue('==============================================='));
  
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  
  console.log('Fresh Escrow:', FRESH_ESCROW);
  console.log('Your Wallet:', wallet.address);
  
  // Correct ABI based on the actual struct
  const escrowAbi = [
    'function createEscrow(address,address,uint256,address,uint256) payable returns (bytes32)',
    'function updateCondition(bytes32,bool)',
    'function releaseEscrow(bytes32) payable',
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)'
  ];
  
  const escrow = new ethers.Contract(FRESH_ESCROW, escrowAbi, sepoliaWallet);
  
  try {
    // Create escrow
    console.log(chalk.cyan('\n📝 Creating Cross-Chain Escrow'));
    
    const seller = ethers.Wallet.createRandom().address;
    const amount = parseEther('0.0003');
    const targetWeth = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';
    const targetChainId = 421614;
    
    console.log('Seller:', seller);
    console.log('Amount:', formatEther(amount), 'ETH');
    console.log('Target Chain:', targetChainId);
    
    const createTx = await escrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000',
      amount,
      targetWeth,
      targetChainId,
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    console.log('✅ Created:', createReceipt.hash);
    
    // Get escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === FRESH_ESCROW.toLowerCase() && log.topics.length > 1) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    console.log('Escrow ID:', escrowId);
    
    // Read with correct struct
    const details = await escrow.escrows(escrowId);
    console.log('\nEscrow Details:');
    console.log('Buyer:', details.buyer);
    console.log('Seller:', details.seller); 
    console.log('Deposit Token:', details.depositToken);
    console.log('Deposit Amount:', formatEther(details.depositAmount), 'ETH');
    console.log('Net Amount:', formatEther(details.netAmount), 'ETH');
    console.log('Target Token:', details.targetToken);
    console.log('Target Chain ID:', details.targetChainId.toString());
    console.log('Released:', details.released);
    console.log('Condition Met:', details.conditionMet);
    
    // Calculate expected values
    const expectedServiceFee = amount * 200n / 10000n; // 2%
    const expectedNetAmount = amount - expectedServiceFee;
    
    console.log('\nVerification:');
    console.log('Expected net amount:', formatEther(expectedNetAmount), 'ETH');
    console.log('Actual net amount:', formatEther(details.netAmount), 'ETH');
    console.log('Net amount correct:', details.netAmount === expectedNetAmount ? '✅' : '❌');
    console.log('Target chain correct:', details.targetChainId.toString() === targetChainId.toString() ? '✅' : '❌');
    console.log('Not released:', !details.released ? '✅' : '❌');
    
    if (details.netAmount === expectedNetAmount && 
        details.targetChainId.toString() === targetChainId.toString() && 
        !details.released) {
      
      // Update condition
      console.log(chalk.cyan('\n🔄 Updating Condition'));
      const updateTx = await escrow.updateCondition(escrowId, true);
      await updateTx.wait();
      console.log('✅ Condition updated');
      
      // Release
      console.log(chalk.cyan('\n🚀 Releasing Cross-Chain'));
      const fee = parseEther('0.01');
      console.log('Fee:', formatEther(fee), 'ETH');
      
      const releaseTx = await escrow.releaseEscrow(escrowId, { 
        value: fee,
        gasLimit: 1500000 
      });
      
      const releaseReceipt = await releaseTx.wait();
      console.log(chalk.green('✅ Released!'));
      console.log('TX:', `https://sepolia.etherscan.io/tx/${releaseReceipt.hash}`);
      
      // Check events
      let oftEvents = 0;
      for (const log of releaseReceipt.logs) {
        if (log.address.toLowerCase() === '0x5277270f4f4f7e03439f2ecdb6d6632ed921bff6'.toLowerCase()) {
          oftEvents++;
        }
      }
      console.log(`\nOFT Events: ${oftEvents}`);
      
      console.log(chalk.green('\n🎉 Cross-chain transfer initiated!'));
      console.log('Monitor on LayerZero Scan for completion');
      console.log(`Seller ${seller} will receive WETH on Arbitrum`);
      
    } else {
      console.log(chalk.red('\n❌ Storage appears corrupted'));
    }
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
  }
}

testCrossChain().catch(console.error);
#!/usr/bin/env node
import { ethers, parseEther, formatEther } from 'ethers';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
const escrowAddress = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';

console.log(chalk.blue('🚀 Testing Cross-Chain Escrow Flow'));

const escrowAbi = [
  'function createEscrow(address seller, address depositToken, uint256 depositAmount, address targetToken, uint256 targetChainId) payable returns (bytes32)',
  'function updateCondition(bytes32 escrowId, bool conditionMet)',
  'function releaseEscrow(bytes32 escrowId) payable',
  'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, address targetToken, uint256 depositAmount, uint256 netAmount, uint256 serviceFee, uint256 targetChainId, bool conditionMet, bool released)'
];

const escrow = new ethers.Contract(escrowAddress, escrowAbi, wallet);

async function testCrossChain() {
  try {
    // Create escrow
    const seller = '0x1111111111111111111111111111111111111111';
    const amount = parseEther('0.0003');
    const targetWeth = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';
    const targetChainId = 421614;
    
    console.log('Creating escrow...');
    const createTx = await escrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000',
      amount,
      targetWeth,
      targetChainId,
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    
    // Find escrow ID
    let escrowId = null;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    console.log('✅ Escrow created, ID:', escrowId);
    
    // Update condition
    console.log('\nUpdating condition...');
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log('✅ Condition updated');
    
    // Check state
    const details = await escrow.escrows(escrowId);
    console.log('\nEscrow details:');
    console.log('Net amount:', formatEther(details.netAmount), 'ETH');
    console.log('Target chain:', details.targetChainId.toString());
    console.log('Condition met:', details.conditionMet);
    console.log('Released:', details.released);
    
    // Release
    console.log('\nReleasing escrow...');
    const fee = parseEther('0.01');
    
    const releaseTx = await escrow.releaseEscrow(escrowId, { value: fee });
    const releaseReceipt = await releaseTx.wait();
    
    console.log(chalk.green('\n✅ SUCCESS! Cross-chain escrow completed!'));
    console.log('TX:', 'https://sepolia.etherscan.io/tx/' + releaseReceipt.hash);
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

testCrossChain();
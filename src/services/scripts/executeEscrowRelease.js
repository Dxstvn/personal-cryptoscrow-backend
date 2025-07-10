#!/usr/bin/env node
/**
 * Execute Escrow Release with Proper Configuration
 * This script will ensure OFT is configured and execute the release
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';

const CHAINS = {
  sepolia: {
    name: 'Sepolia',
    chainId: 11155111,
    endpointId: 40161,
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    oftAdapter: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4',
    explorer: 'https://sepolia.etherscan.io'
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    endpointId: 40231,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    oftAdapter: '0xbaa46938E3110187ED6a55EE139312b28c943d00',
    explorer: 'https://sepolia.arbiscan.io'
  }
};

async function executeRelease() {
  console.log(chalk.blue('🚀 Executing Escrow Release'));
  console.log(chalk.blue('=========================='));
  
  const provider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(`Service Wallet: ${wallet.address}`);
  console.log(`Escrow Contract: ${YOUR_ESCROW_CONTRACT}`);
  console.log(`Escrow ID: ${ESCROW_ID}`);
  
  const escrowAbi = [
    'function owner() view returns (address)',
    'function oftAdapters(uint32) view returns (address)',
    'function setOFTAdapter(uint32 endpointId, address adapter, string chainName)',
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'event OFTAdapterSet(uint32 indexed endpointId, address indexed adapter)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address finalToken, uint256 finalAmount, string method, bool withCompose)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Step 1: Check escrow state
    console.log(chalk.cyan('\n1. Checking Escrow State:'));
    const escrowData = await escrow.escrows(ESCROW_ID);
    
    if (escrowData.released) {
      console.log(chalk.yellow('⚠️  This escrow has already been released!'));
      return;
    }
    
    if (!escrowData.conditionMet) {
      console.log(chalk.red('❌ Condition not met! Cannot release.'));
      return;
    }
    
    console.log(`✅ Condition Met`);
    console.log(`Target Chain: ${escrowData.targetChainId} (Arbitrum Sepolia)`);
    console.log(`Amount: ${formatEther(escrowData.depositAmount)} ETH`);
    console.log(`Seller: ${escrowData.seller}`);
    
    // Step 2: Ensure OFT adapters are configured
    console.log(chalk.cyan('\n2. Configuring OFT Adapters:'));
    
    // Check if we're the owner
    const owner = await escrow.owner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log(chalk.red('❌ You are not the contract owner!'));
      return;
    }
    
    // Configure Arbitrum OFT adapter
    const currentArbitrumOFT = await escrow.oftAdapters(CHAINS.arbitrumSepolia.endpointId);
    if (currentArbitrumOFT === ethers.ZeroAddress || currentArbitrumOFT !== CHAINS.arbitrumSepolia.oftAdapter) {
      console.log(chalk.yellow('Setting Arbitrum OFT adapter...'));
      const tx = await escrow.setOFTAdapter(
        CHAINS.arbitrumSepolia.endpointId,
        CHAINS.arbitrumSepolia.oftAdapter,
        CHAINS.arbitrumSepolia.name
      );
      console.log(`TX: ${CHAINS.sepolia.explorer}/tx/${tx.hash}`);
      await tx.wait();
      console.log(chalk.green('✅ Arbitrum OFT adapter configured'));
    } else {
      console.log('✅ Arbitrum OFT already configured');
    }
    
    // Step 3: Estimate LayerZero fees
    console.log(chalk.cyan('\n3. Estimating LayerZero Fees:'));
    
    // We'll use a conservative estimate
    const feeEstimate = parseEther('0.003'); // 0.003 ETH for cross-chain
    console.log(`Fee Estimate: ${formatEther(feeEstimate)} ETH`);
    
    // Step 4: Execute release
    console.log(chalk.cyan('\n4. Executing Cross-Chain Release:'));
    console.log('Sending transaction...');
    
    const releaseTx = await escrow.releaseEscrow(ESCROW_ID, {
      value: feeEstimate,
      gasLimit: 500000 // Set explicit gas limit
    });
    
    console.log(`TX Hash: ${releaseTx.hash}`);
    console.log(`Explorer: ${CHAINS.sepolia.explorer}/tx/${releaseTx.hash}`);
    console.log('⏳ Waiting for confirmation...');
    
    const receipt = await releaseTx.wait();
    console.log(chalk.green(`✅ Transaction confirmed! (Block: ${receipt.blockNumber})`));
    
    // Parse events
    for (const log of receipt.logs) {
      try {
        const parsed = escrow.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowReleased') {
          console.log(chalk.green('\n✅ ESCROW RELEASED SUCCESSFULLY!'));
          console.log(`Seller: ${parsed.args.seller}`);
          console.log(`Amount: ${formatEther(parsed.args.finalAmount)} WETH`);
          console.log(`Method: ${parsed.args.method}`);
          
          // Get LayerZero GUID from logs if available
          console.log(chalk.cyan('\n📦 Cross-Chain Details:'));
          console.log('The tokens are being bridged to Arbitrum Sepolia');
          console.log('This typically takes 3-5 minutes on testnet');
          console.log(`Check seller's balance on Arbitrum: ${CHAINS.arbitrumSepolia.explorer}/address/${escrowData.seller}`);
        }
      } catch (e) {
        // Not our event
      }
    }
    
    // Step 5: Verify on destination chain
    console.log(chalk.cyan('\n5. Next Steps:'));
    console.log('1. Wait 3-5 minutes for LayerZero to deliver');
    console.log('2. Check the seller\'s WETH balance on Arbitrum Sepolia');
    console.log(`3. Seller address: ${escrowData.seller}`);
    console.log(`4. Expected amount: ${formatEther(escrowData.netAmount)} WETH (after 2% fee)`);
    
  } catch (error) {
    console.log(chalk.red('\n❌ Release failed:'), error.message);
    
    if (error.message.includes('insufficient funds')) {
      console.log(chalk.yellow('💡 Make sure your wallet has enough ETH for gas and LayerZero fees'));
    } else if (error.message.includes('0x5c427cd9')) {
      console.log(chalk.yellow('💡 You are not authorized to release this escrow'));
    } else if (error.data) {
      console.log('Error data:', error.data);
    }
  }
}

async function main() {
  console.log(chalk.blue('🔐 Escrow Release Executor'));
  console.log(chalk.gray('This will release your escrow cross-chain'));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('❌ BACKEND_WALLET_PRIVATE_KEY not set'));
    process.exit(1);
  }
  
  try {
    await executeRelease();
  } catch (error) {
    console.log(chalk.red('\n❌ Failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
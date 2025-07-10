#!/usr/bin/env node
/**
 * Test YOUR escrow contract with standard OFT adapters
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';

const CONFIG = {
  sepolia: {
    escrow: YOUR_ESCROW, // Your contract with full auth
    oftAdapter: '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    chainId: 11155111,
    endpointId: 40161,
    rpc: process.env.SEPOLIA_RPC_URL,
    explorer: 'https://sepolia.etherscan.io'
  },
  arbitrum: {
    escrow: '0xeb8e89c8872f476750C91a9557798ec83EDC7031',
    oftAdapter: '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B',
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    chainId: 421614,
    endpointId: 40231,
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    explorer: 'https://sepolia.arbiscan.io'
  }
};

async function testYourEscrow() {
  console.log(chalk.blue('🧪 Testing YOUR Escrow with Standard OFT Adapters'));
  console.log(chalk.blue('================================================'));
  
  const sepoliaProvider = new ethers.JsonRpcProvider(CONFIG.sepolia.rpc);
  const arbitrumProvider = new ethers.JsonRpcProvider(CONFIG.arbitrum.rpc);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const arbitrumWallet = wallet.connect(arbitrumProvider);
  
  console.log('Your Wallet:', wallet.address);
  console.log('Your Escrow:', YOUR_ESCROW);
  
  // First, verify OFT configuration on your escrow
  console.log(chalk.cyan('\n📋 Verifying OFT Configuration on Your Escrow'));
  
  const escrowAbi = [
    'function owner() view returns (address)',
    'function conditionUpdaters(address) view returns (bool)',
    'function oftAdapters(uint32) view returns (address)',
    'function chainIdToEndpointId(uint256) view returns (uint32)',
    'function createEscrow(address,address,uint256,address,uint256) payable returns (bytes32)',
    'function updateCondition(bytes32,bool)',
    'function releaseEscrow(bytes32) payable',
    'function escrows(bytes32) view returns (address,address,address,address,uint256,uint256,uint256,uint256,bool,bool)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW, escrowAbi, sepoliaWallet);
  
  try {
    // Check ownership and authorization
    const owner = await escrow.owner();
    const isUpdater = await escrow.conditionUpdaters(wallet.address);
    console.log('  Contract Owner:', owner);
    console.log('  You are owner:', owner.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌');
    console.log('  You are updater:', isUpdater ? '✅' : '❌');
    
    // Check OFT adapter configuration
    const sepoliaOFT = await escrow.oftAdapters(CONFIG.sepolia.endpointId);
    const arbitrumOFT = await escrow.oftAdapters(CONFIG.arbitrum.endpointId);
    console.log('\n  OFT Adapter Configuration:');
    console.log('  Sepolia OFT:', sepoliaOFT);
    console.log('  Expected:', CONFIG.sepolia.oftAdapter);
    console.log('  Match:', sepoliaOFT.toLowerCase() === CONFIG.sepolia.oftAdapter.toLowerCase() ? '✅' : '❌');
    console.log('  Arbitrum OFT:', arbitrumOFT);
    console.log('  Expected:', CONFIG.arbitrum.oftAdapter);
    console.log('  Match:', arbitrumOFT.toLowerCase() === CONFIG.arbitrum.oftAdapter.toLowerCase() ? '✅' : '❌');
    
    // Check chain mappings
    const arbitrumEndpointId = await escrow.chainIdToEndpointId(CONFIG.arbitrum.chainId);
    console.log('\n  Chain Mapping:');
    console.log('  Arbitrum Chain ID:', CONFIG.arbitrum.chainId);
    console.log('  Mapped Endpoint ID:', arbitrumEndpointId.toString());
    console.log('  Expected:', CONFIG.arbitrum.endpointId);
    console.log('  Correct:', arbitrumEndpointId.toString() === CONFIG.arbitrum.endpointId.toString() ? '✅' : '❌');
    
  } catch (error) {
    console.log(chalk.red('❌ Configuration check failed:'), error.message);
  }
  
  // Test cross-chain escrow creation and release
  console.log(chalk.cyan('\n📋 Testing Cross-Chain Escrow Flow'));
  
  try {
    // Create a unique seller address
    const timestamp = Date.now();
    const seller = '0x' + timestamp.toString(16).padEnd(40, '0');
    const amount = parseEther('0.00025'); // 0.00025 ETH
    
    console.log('\n  Creating cross-chain escrow:');
    console.log('  Seller:', seller);
    console.log('  Amount:', formatEther(amount), 'ETH');
    console.log('  Source: Sepolia');
    console.log('  Target: Arbitrum Sepolia');
    console.log('  Target Token: WETH on Arbitrum');
    
    // Check wallet balance
    const balance = await sepoliaProvider.getBalance(wallet.address);
    console.log('  Your balance:', formatEther(balance), 'ETH');
    
    // Create escrow
    const createTx = await escrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000', // ETH
      amount,
      CONFIG.arbitrum.weth, // Target WETH on Arbitrum
      CONFIG.arbitrum.chainId, // Target chain ID
      { value: amount }
    );
    
    console.log('  TX sent:', createTx.hash);
    const createReceipt = await createTx.wait();
    console.log('  ✅ Escrow created');
    console.log('  TX:', CONFIG.sepolia.explorer + '/tx/' + createReceipt.hash);
    
    // Extract escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === YOUR_ESCROW.toLowerCase() && log.topics.length > 1) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    if (!escrowId) {
      throw new Error('Could not find escrow ID in logs');
    }
    
    console.log('  Escrow ID:', escrowId);
    
    // Check escrow details
    const details = await escrow.escrows(escrowId);
    console.log('\n  Escrow Details:');
    console.log('  Buyer:', details[0]);
    console.log('  Seller:', details[1]);
    console.log('  Deposit Token:', details[2]);
    console.log('  Target Token:', details[3]);
    console.log('  Deposit Amount:', formatEther(details[4]), 'ETH');
    console.log('  Net Amount:', formatEther(details[5]), 'ETH');
    console.log('  Service Fee:', formatEther(details[6]), 'ETH');
    console.log('  Target Chain ID:', details[7].toString());
    console.log('  Condition Met:', details[8]);
    console.log('  Released:', details[9]);
    
    if (details[9]) {
      console.log(chalk.yellow('\n  ⚠️  This escrow is already released'));
      return;
    }
    
    // Update condition
    console.log('\n  Updating condition to true...');
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log('  ✅ Condition updated');
    
    // Prepare for cross-chain release
    console.log('\n  Preparing cross-chain release...');
    
    // Get fee quote from OFT adapter
    const oftAbi = [
      'function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))'
    ];
    const oft = new ethers.Contract(CONFIG.sepolia.oftAdapter, oftAbi, sepoliaProvider);
    
    // Build proper options for LayerZero
    const gasLimit = 200000n;
    const options = ethers.solidityPacked(
      ['uint16', 'uint256'],
      [1, gasLimit] // Option type 1 for gas
    );
    
    const sendParam = [
      CONFIG.arbitrum.endpointId, // dstEid
      ethers.zeroPadValue(seller, 32), // to (as bytes32)
      details[5], // amountLD (net amount)
      details[5] * 98n / 100n, // minAmountLD (2% slippage)
      options, // extraOptions
      '0x', // composeMsg
      '0x' // oftCmd
    ];
    
    let fee;
    try {
      const quote = await oft.quoteSend(sendParam, false);
      fee = quote[0] * 3n; // 3x buffer
      console.log('  LayerZero fee quote:', formatEther(quote[0]), 'ETH');
      console.log('  Using fee (3x buffer):', formatEther(fee), 'ETH');
    } catch (quoteError) {
      console.log('  Quote failed, using fallback fee');
      fee = parseEther('0.005');
      console.log('  Using fallback fee:', formatEther(fee), 'ETH');
    }
    
    // Release escrow with cross-chain transfer
    console.log('\n  Releasing escrow cross-chain...');
    const releaseTx = await escrow.releaseEscrow(escrowId, { 
      value: fee,
      gasLimit: 1000000 
    });
    
    console.log('  TX sent:', releaseTx.hash);
    const releaseReceipt = await releaseTx.wait();
    
    console.log(chalk.green('\n  ✅ Cross-chain release successful!'));
    console.log('  TX:', CONFIG.sepolia.explorer + '/tx/' + releaseReceipt.hash);
    
    // Check for LayerZero events
    console.log('\n  Analyzing transaction logs...');
    let oftEventFound = false;
    let crossChainEventFound = false;
    
    for (const log of releaseReceipt.logs) {
      if (log.address.toLowerCase() === CONFIG.sepolia.oftAdapter.toLowerCase()) {
        oftEventFound = true;
        console.log('  ✅ OFT adapter event detected');
      }
      if (log.address.toLowerCase() === YOUR_ESCROW.toLowerCase()) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed && parsed.name === 'CrossChainTransferInitiated') {
            crossChainEventFound = true;
            console.log('  ✅ CrossChainTransferInitiated event found');
            console.log('    GUID:', parsed.args[3]);
            console.log('    Target Chain:', parsed.args[1]?.toString());
          }
        } catch {}
      }
    }
    
    if (oftEventFound && crossChainEventFound) {
      console.log(chalk.green('\n  🎉 Cross-chain transfer successfully initiated!'));
      console.log('  Monitor on LayerZero Scan for completion');
      console.log('  Seller will receive WETH on Arbitrum Sepolia');
    }
    
  } catch (error) {
    console.log(chalk.red('\n❌ Test failed:'), error.message);
    if (error.data) {
      console.log('  Error data:', error.data);
    }
  }
  
  console.log(chalk.green('\n✅ Test completed!'));
}

// Run test
testYourEscrow().catch(console.error);
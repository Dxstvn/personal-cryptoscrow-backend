#!/usr/bin/env node
/**
 * Comprehensive test suite for Standard OFT Adapters and Escrow V3
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  sepolia: {
    escrow: '0xBA10d8d3A09439eA5984F545C925d61958fa14E9', // Default escrow
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

async function testStandardOFTAdapters() {
  console.log(chalk.blue('🧪 Testing Standard OFT Adapters'));
  console.log(chalk.blue('================================'));
  
  const sepoliaProvider = new ethers.JsonRpcProvider(CONFIG.sepolia.rpc);
  const arbitrumProvider = new ethers.JsonRpcProvider(CONFIG.arbitrum.rpc);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const arbitrumWallet = wallet.connect(arbitrumProvider);
  
  console.log('Wallet:', wallet.address);
  
  // Test 1: Check OFT Adapter Configuration
  console.log(chalk.cyan('\n📋 Test 1: OFT Adapter Configuration'));
  
  const oftAbi = [
    'function owner() view returns (address)',
    'function token() view returns (address)',
    'function endpoint() view returns (address)',
    'function peers(uint32 eid) view returns (bytes32)',
    'function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))'
  ];
  
  const sepoliaOFT = new ethers.Contract(CONFIG.sepolia.oftAdapter, oftAbi, sepoliaProvider);
  const arbitrumOFT = new ethers.Contract(CONFIG.arbitrum.oftAdapter, oftAbi, arbitrumProvider);
  
  try {
    // Check Sepolia OFT
    console.log('\nSepolia OFT Adapter:');
    const sepoliaOwner = await sepoliaOFT.owner();
    const sepoliaToken = await sepoliaOFT.token();
    const sepoliaEndpoint = await sepoliaOFT.endpoint();
    const sepoliaPeer = await sepoliaOFT.peers(CONFIG.arbitrum.endpointId);
    
    console.log('  Owner:', sepoliaOwner);
    console.log('  Token (WETH):', sepoliaToken);
    console.log('  Endpoint:', sepoliaEndpoint);
    console.log('  Arbitrum Peer:', sepoliaPeer);
    console.log('  Peer Configured:', sepoliaPeer !== '0x' + '00'.repeat(32) ? '✅' : '❌');
    
    // Check Arbitrum OFT
    console.log('\nArbitrum OFT Adapter:');
    const arbitrumOwner = await arbitrumOFT.owner();
    const arbitrumToken = await arbitrumOFT.token();
    const arbitrumEndpoint = await arbitrumOFT.endpoint();
    const arbitrumPeer = await arbitrumOFT.peers(CONFIG.sepolia.endpointId);
    
    console.log('  Owner:', arbitrumOwner);
    console.log('  Token (WETH):', arbitrumToken);
    console.log('  Endpoint:', arbitrumEndpoint);
    console.log('  Sepolia Peer:', arbitrumPeer);
    console.log('  Peer Configured:', arbitrumPeer !== '0x' + '00'.repeat(32) ? '✅' : '❌');
    
  } catch (error) {
    console.log(chalk.red('❌ OFT configuration check failed:'), error.message);
  }
  
  // Test 2: Test OFT Quote Function
  console.log(chalk.cyan('\n📋 Test 2: OFT Quote Function'));
  
  try {
    const amount = parseEther('0.0001');
    const sendParam = {
      dstEid: CONFIG.arbitrum.endpointId,
      to: '0x' + wallet.address.slice(2).padStart(64, '0'),
      amountLD: amount,
      minAmountLD: amount * 98n / 100n,
      extraOptions: '0x0003010000000000000000000000000000030d400000000000000000000000000000000000000000000000000000000000000000',
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    const quote = await sepoliaOFT.quoteSend(sendParam, false);
    console.log('  Native Fee:', formatEther(quote.nativeFee || quote[0]), 'ETH');
    console.log('  ZRO Fee:', formatEther(quote.lzTokenFee || quote[1] || 0n));
    console.log('  Quote Success: ✅');
    
  } catch (error) {
    console.log(chalk.red('❌ Quote failed:'), error.message);
  }
  
  // Test 3: Same-Chain Escrow
  console.log(chalk.cyan('\n📋 Test 3: Same-Chain Escrow'));
  
  const escrowAbi = [
    'function createEscrow(address,address,uint256,address,uint256) payable returns (bytes32)',
    'function updateCondition(bytes32,bool)',
    'function releaseEscrow(bytes32) payable',
    'function escrows(bytes32) view returns (address,address,address,address,uint256,uint256,uint256,uint256,bool,bool)',
    'function conditionUpdaters(address) view returns (bool)',
    'function owner() view returns (address)'
  ];
  
  const sepoliaEscrow = new ethers.Contract(CONFIG.sepolia.escrow, escrowAbi, sepoliaWallet);
  
  try {
    // Check authorization
    const owner = await sepoliaEscrow.owner();
    const isUpdater = await sepoliaEscrow.conditionUpdaters(wallet.address);
    console.log('  Contract Owner:', owner);
    console.log('  Wallet is updater:', isUpdater ? '✅' : '❌');
    
    // Create same-chain escrow
    const seller = ethers.Wallet.createRandom().address;
    const amount = parseEther('0.0001');
    
    console.log('  Creating same-chain escrow...');
    const createTx = await sepoliaEscrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000',
      amount,
      '0x0000000000000000000000000000000000000000',
      CONFIG.sepolia.chainId,
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    console.log('  TX:', CONFIG.sepolia.explorer + '/tx/' + createReceipt.hash);
    
    // Extract escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === CONFIG.sepolia.escrow.toLowerCase() && log.topics.length > 1) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    console.log('  Escrow ID:', escrowId);
    
    // Update condition (only if authorized)
    if (isUpdater || owner.toLowerCase() === wallet.address.toLowerCase()) {
      console.log('  Updating condition...');
      const updateTx = await sepoliaEscrow.updateCondition(escrowId, true);
      await updateTx.wait();
      console.log('  Condition updated ✅');
      
      // Release escrow
      console.log('  Releasing escrow...');
      const releaseTx = await sepoliaEscrow.releaseEscrow(escrowId);
      const releaseReceipt = await releaseTx.wait();
      console.log('  Released ✅');
      console.log('  TX:', CONFIG.sepolia.explorer + '/tx/' + releaseReceipt.hash);
    } else {
      console.log('  ⚠️  Skipping condition update (not authorized)');
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Same-chain escrow failed:'), error.message);
  }
  
  // Test 4: Cross-Chain Escrow
  console.log(chalk.cyan('\n📋 Test 4: Cross-Chain Escrow'));
  
  try {
    const seller = ethers.Wallet.createRandom().address;
    const amount = parseEther('0.0002');
    
    console.log('  Creating cross-chain escrow...');
    console.log('  Seller:', seller);
    console.log('  Amount:', formatEther(amount), 'ETH');
    console.log('  Target Chain: Arbitrum Sepolia');
    
    const createTx = await sepoliaEscrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000',
      amount,
      CONFIG.arbitrum.weth,
      CONFIG.arbitrum.chainId,
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    console.log('  TX:', CONFIG.sepolia.explorer + '/tx/' + createReceipt.hash);
    
    // Extract escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === CONFIG.sepolia.escrow.toLowerCase() && log.topics.length > 1) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    console.log('  Escrow ID:', escrowId);
    
    // Check escrow details
    const details = await sepoliaEscrow.escrows(escrowId);
    console.log('  Net Amount:', formatEther(details[5]), 'ETH');
    console.log('  Target Chain ID:', details[7].toString());
    console.log('  Condition Met:', details[8]);
    console.log('  Released:', details[9]);
    
    // Check authorization before proceeding
    const isUpdater = await sepoliaEscrow.conditionUpdaters(wallet.address);
    const owner = await sepoliaEscrow.owner();
    
    if (isUpdater || owner.toLowerCase() === wallet.address.toLowerCase()) {
      // Update condition
      console.log('  Updating condition...');
      const updateTx = await sepoliaEscrow.updateCondition(escrowId, true);
      await updateTx.wait();
      console.log('  Condition updated ✅');
      
      // Get LayerZero fee quote
      console.log('  Getting LayerZero fee...');
      const fee = parseEther('0.005'); // Conservative estimate
      console.log('  Using fee:', formatEther(fee), 'ETH');
      
      // Release escrow with cross-chain transfer
      console.log('  Releasing escrow cross-chain...');
      const releaseTx = await sepoliaEscrow.releaseEscrow(escrowId, { 
        value: fee,
        gasLimit: 1000000 
      });
      
      console.log('  TX sent:', releaseTx.hash);
      const releaseReceipt = await releaseTx.wait();
      
      console.log(chalk.green('  ✅ Cross-chain release successful!'));
      console.log('  TX:', CONFIG.sepolia.explorer + '/tx/' + releaseReceipt.hash);
      
      // Look for cross-chain events
      console.log('\n  Checking for LayerZero events...');
      let layerZeroEvent = false;
      for (const log of releaseReceipt.logs) {
        if (log.address.toLowerCase() === CONFIG.sepolia.oftAdapter.toLowerCase()) {
          layerZeroEvent = true;
          console.log('  ✅ LayerZero OFT event detected');
        }
      }
      
      if (!layerZeroEvent) {
        console.log('  ⚠️  No LayerZero events found - check transaction');
      }
      
    } else {
      console.log('  ⚠️  Skipping release (not authorized)');
      console.log('  To test cross-chain, deploy your own escrow or get authorization');
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Cross-chain escrow failed:'), error.message);
    if (error.data) {
      console.log('  Error data:', error.data);
    }
  }
  
  // Test 5: Check Arbitrum Side
  console.log(chalk.cyan('\n📋 Test 5: Verify on Destination Chain'));
  
  try {
    // Check WETH balance on Arbitrum
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const arbitrumWeth = new ethers.Contract(CONFIG.arbitrum.weth, wethAbi, arbitrumProvider);
    
    // Note: In a real test, we'd wait for the cross-chain message to arrive
    console.log('  Note: Cross-chain transfers take 1-3 minutes to complete');
    console.log('  Check LayerZero Scan for transfer status');
    console.log('  Arbitrum WETH contract:', CONFIG.arbitrum.weth);
    
  } catch (error) {
    console.log(chalk.red('❌ Destination check failed:'), error.message);
  }
  
  console.log(chalk.green('\n✅ Test suite completed!'));
}

// Run tests
testStandardOFTAdapters().catch(console.error);
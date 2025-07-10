#!/usr/bin/env node
/**
 * Debug the release step by step
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

async function debugRelease() {
  console.log(chalk.blue('🔍 Debugging Release Step by Step'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  // First, let's check if we can call the OFT quoteSend directly
  const oftAddress = '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6';
  const oftAbi = [
    'function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))'
  ];
  
  const oft = new ethers.Contract(oftAddress, oftAbi, provider);
  
  try {
    console.log('\n1. Testing OFT quoteSend...');
    
    // Build the SendParam struct
    const sendParam = [
      40231, // Arbitrum endpoint ID
      ethers.zeroPadValue('0x1927383E5dB134854b658EaE28831fdA776EeE87', 32), // seller as bytes32
      parseEther('0.000294'), // amount
      parseEther('0.000294') * 98n / 100n, // minAmount
      '0x0003010000000000000000000000000000030d400000000000000000000000000000000000000000000000000000000000000000', // options
      '0x', // composeMsg
      '0x' // oftCmd
    ];
    
    const quote = await oft.quoteSend(sendParam, false);
    console.log('✅ Quote successful!');
    console.log('Native fee:', formatEther(quote[0]), 'ETH');
    
  } catch (error) {
    console.log('❌ Quote failed:', error.message);
  }
  
  // Now let's check if the escrow contract can call WETH.deposit
  console.log('\n2. Checking WETH interaction...');
  
  const wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const wethAbi = [
    'function deposit() payable',
    'function balanceOf(address) view returns (uint256)'
  ];
  
  const weth = new ethers.Contract(wethAddress, wethAbi, wallet);
  
  // Test WETH deposit directly
  try {
    const testAmount = parseEther('0.0001');
    console.log('Testing WETH deposit with', formatEther(testAmount), 'ETH...');
    
    const balanceBefore = await weth.balanceOf(wallet.address);
    console.log('WETH balance before:', formatEther(balanceBefore));
    
    const tx = await weth.deposit({ value: testAmount });
    await tx.wait();
    
    const balanceAfter = await weth.balanceOf(wallet.address);
    console.log('WETH balance after:', formatEther(balanceAfter));
    console.log('✅ WETH deposit works');
    
  } catch (error) {
    console.log('❌ WETH deposit failed:', error.message);
  }
  
  // Let's also check the escrow contract's functions
  console.log('\n3. Checking escrow contract functions...');
  
  const escrowAddress = '0x13421D0224858AF41054ea9261c8Bad75BE63D23';
  const escrowAbi = [
    'function WETH() view returns (address)',
    'function oftAdapters(uint32) view returns (address)',
    'function chainIdToEndpointId(uint256) view returns (uint32)'
  ];
  
  const escrow = new ethers.Contract(escrowAddress, escrowAbi, provider);
  
  try {
    const escrowWeth = await escrow.WETH();
    console.log('Escrow WETH address:', escrowWeth);
    console.log('Expected WETH:', wethAddress);
    console.log('Match:', escrowWeth.toLowerCase() === wethAddress.toLowerCase() ? '✅' : '❌');
    
    const oftAdapter = await escrow.oftAdapters(40231);
    console.log('\nEscrow OFT adapter for Arbitrum:', oftAdapter);
    console.log('Expected:', oftAddress);
    console.log('Match:', oftAdapter.toLowerCase() === oftAddress.toLowerCase() ? '❌' : '✅');
    
    const endpointId = await escrow.chainIdToEndpointId(421614);
    console.log('\nChain ID 421614 maps to endpoint:', endpointId.toString());
    console.log('Expected: 40231');
    console.log('Match:', endpointId.toString() === '40231' ? '✅' : '❌');
    
  } catch (error) {
    console.log('❌ Escrow check failed:', error.message);
  }
  
  console.log(chalk.yellow('\n💡 Insights:'));
  console.log('If all checks pass, the issue might be:');
  console.log('1. Gas limit too low for the complex cross-chain operation');
  console.log('2. An internal revert in the escrow contract logic');
  console.log('3. LayerZero endpoint rejecting the transaction');
}

debugRelease().catch(console.error);
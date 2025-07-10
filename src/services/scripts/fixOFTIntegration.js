#!/usr/bin/env node
/**
 * Fix OFT Integration Issue
 * The problem: Escrow contract calls OFT.send() but our adapter expects different flow
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const YOUR_SEPOLIA_OFT = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const YOUR_ARBITRUM_OFT = '0x4E958435343fcb22128546561E078942B74DFb4b';
const WETH_SEPOLIA = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

async function diagnoseIssue() {
  console.log(chalk.blue('🔍 Diagnosing OFT Integration Issue'));
  console.log(chalk.blue('=================================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(chalk.cyan('📝 The Problem:'));
  console.log('1. The escrow contract expects standard OFT adapter interface');
  console.log('2. It calls IOFT(oftAdapter).send() after wrapping ETH to WETH');
  console.log('3. Our SimplePropertyOFTAdapter inherits from OFTAdapter but may have issues');
  
  // Check if our OFT adapter properly inherits the send function
  const oftAbi = [
    'function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable returns ((bytes32,uint64,bytes),())',
    'function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))',
    'function token() view returns (address)',
    'function approvalRequired() view returns (bool)'
  ];
  
  const oft = new ethers.Contract(YOUR_SEPOLIA_OFT, oftAbi, provider);
  
  try {
    console.log(chalk.cyan('\n🔍 Checking OFT Adapter:'));
    
    // Check what token the OFT adapter is for
    const token = await oft.token();
    console.log(`OFT Token: ${token}`);
    console.log(`Expected WETH: ${WETH_SEPOLIA}`);
    console.log(`Match: ${token.toLowerCase() === WETH_SEPOLIA.toLowerCase() ? '✅' : '❌'}`);
    
    // Check if approval is required
    const approvalRequired = await oft.approvalRequired();
    console.log(`Approval Required: ${approvalRequired ? 'Yes' : 'No'}`);
    
    // Test quote function
    console.log(chalk.cyan('\n🔍 Testing Quote Function:'));
    
    const sendParam = {
      dstEid: 40231, // Arbitrum endpoint
      to: '0x' + '0'.repeat(24) + wallet.address.slice(2).padStart(40, '0'),
      amountLD: parseEther('0.0001'),
      minAmountLD: parseEther('0.0001') * 98n / 100n,
      extraOptions: '0x',
      composeMsg: '0x',
      oftCmd: '0x'
    };
    
    try {
      const quote = await oft.quoteSend(sendParam, false);
      console.log(`Quote Success: ✅`);
      console.log(`Native Fee: ${formatEther(quote.nativeFee)} ETH`);
      console.log(`ZRO Fee: ${formatEther(quote.lzTokenFee)}`);
    } catch (error) {
      console.log(`Quote Failed: ❌`);
      console.log(`Error: ${error.message.substring(0, 100)}`);
    }
    
  } catch (error) {
    console.log(chalk.red('Error checking OFT:'), error.message);
  }
  
  console.log(chalk.cyan('\n💡 Solutions:'));
  console.log('\n1. Deploy Standard OFT Adapter (Recommended):');
  console.log('   - Deploy a standard LayerZero OFTAdapter for WETH');
  console.log('   - This will work with the escrow contract\'s expectations');
  
  console.log('\n2. Modify Escrow Contract:');
  console.log('   - Change to use SimplePropertyOFTAdapter\'s convertAndSend');
  console.log('   - But this requires redeploying the escrow contract');
  
  console.log('\n3. Create Wrapper Contract:');
  console.log('   - Deploy a wrapper that translates between interfaces');
  console.log('   - Acts as standard OFT but forwards to SimplePropertyOFTAdapter');
}

async function deployStandardOFT() {
  console.log(chalk.blue('\n🚀 Solution: Deploy Standard OFT Adapter'));
  console.log(chalk.blue('========================================'));
  
  console.log('To fix this, we need to deploy a standard OFTAdapter that:');
  console.log('1. Uses WETH as the token');
  console.log('2. Implements the standard LayerZero OFT interface');
  console.log('3. Works with the escrow contract\'s expectations');
  
  console.log(chalk.yellow('\nNext Steps:'));
  console.log('1. Deploy standard OFTAdapter contracts on both chains');
  console.log('2. Configure peers between them');
  console.log('3. Update escrow contract to use the new adapters');
  console.log('4. Test the cross-chain transfer');
}

async function main() {
  try {
    await diagnoseIssue();
    await deployStandardOFT();
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
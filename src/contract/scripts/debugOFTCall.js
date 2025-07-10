#!/usr/bin/env node
/**
 * Debug the OFT adapter call
 */
const hre = require('hardhat');
const chalk = require('chalk');

const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';
const OFT_ADAPTER = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

async function main() {
  console.log(chalk.blue('🔍 Debugging OFT Adapter Call'));
  console.log(chalk.blue('===========================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Check current state
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)'
  ];
  
  const weth = new hre.ethers.Contract(WETH_ADDRESS, wethAbi, provider);
  
  // Check balances
  const escrowBalance = await weth.balanceOf(ESCROW_ADDRESS);
  const oftBalance = await weth.balanceOf(OFT_ADAPTER);
  const allowance = await weth.allowance(ESCROW_ADDRESS, OFT_ADAPTER);
  
  console.log('💰 Current State:');
  console.log(`\nEscrow WETH Balance: ${hre.ethers.formatEther(escrowBalance)}`);
  console.log(`OFT WETH Balance: ${hre.ethers.formatEther(oftBalance)}`);
  console.log(`Escrow → OFT Allowance: ${hre.ethers.formatEther(allowance)}`);
  
  // Simulate OFT send parameters
  console.log(chalk.yellow('\n📦 Send Parameters:'));
  console.log('├─ Destination Endpoint: 40231 (Arbitrum)');
  console.log('├─ Recipient: 0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC');
  console.log('├─ Amount: 0.00098 WETH');
  console.log('└─ Min Amount: ~0.00097 WETH (with slippage)');
  
  // Check if OFT adapter can pull tokens
  const oftAbi = [
    'function token() view returns (address)',
    'function approvalRequired() view returns (bool)',
    'function owner() view returns (address)'
  ];
  
  const oft = new hre.ethers.Contract(OFT_ADAPTER, oftAbi, provider);
  
  try {
    const token = await oft.token();
    console.log(`\n🔧 OFT Configuration:`);
    console.log(`├─ Token: ${token}`);
    console.log(`└─ Matches WETH: ${token.toLowerCase() === WETH_ADDRESS.toLowerCase() ? '✅' : '❌'}`);
    
    try {
      const approvalRequired = await oft.approvalRequired();
      console.log(`├─ Approval Required: ${approvalRequired}`);
    } catch (e) {
      console.log(`├─ Approval Required: (method not found)`);
    }
  } catch (e) {
    console.log('\n❌ Error reading OFT configuration');
  }
  
  console.log(chalk.red('\n⚠️  Issue Identified:'));
  console.log('The escrow approved the OFT to spend WETH, but the OFT has the WETH.');
  console.log('This suggests the WETH was transferred TO the OFT instead of being pulled BY the OFT.');
  console.log('\nThe contract might be using the wrong pattern for OFT interaction.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
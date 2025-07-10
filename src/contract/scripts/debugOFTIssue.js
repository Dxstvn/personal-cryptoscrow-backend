#!/usr/bin/env node
/**
 * Debug why OFT send isn't working
 */
const hre = require('hardhat');
const chalk = require('chalk');

const OFT_ADAPTER = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';

async function main() {
  console.log(chalk.blue('🔍 Debugging OFT Issue'));
  console.log(chalk.blue('====================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Check WETH balances and allowances
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)'
  ];
  
  const weth = new hre.ethers.Contract(WETH_ADDRESS, wethAbi, provider);
  
  const escrowBalance = await weth.balanceOf(ESCROW_ADDRESS);
  const oftBalance = await weth.balanceOf(OFT_ADAPTER);
  const escrowAllowance = await weth.allowance(ESCROW_ADDRESS, OFT_ADAPTER);
  const oftAllowance = await weth.allowance(OFT_ADAPTER, ESCROW_ADDRESS);
  
  console.log('💰 WETH Status:');
  console.log(`\nEscrow Contract:`);
  console.log(`├─ Balance: ${hre.ethers.formatEther(escrowBalance)}`);
  console.log(`└─ Allowance to OFT: ${hre.ethers.formatEther(escrowAllowance)}`);
  
  console.log(`\nOFT Adapter:`);
  console.log(`├─ Balance: ${hre.ethers.formatEther(oftBalance)}`);
  console.log(`└─ Allowance to Escrow: ${hre.ethers.formatEther(oftAllowance)}`);
  
  // The issue seems to be that:
  // 1. Escrow approved OFT to spend WETH
  // 2. But OFT already has the WETH (it was transferred, not pulled)
  // 3. The OFT's send function was called but didn't complete the cross-chain transfer
  
  console.log(chalk.yellow('\n💡 Analysis:'));
  
  if (oftBalance > 0n && escrowBalance > 0n) {
    console.log('❌ WETH exists in BOTH contracts!');
    console.log('This suggests the OFT adapter received WETH but the send failed.');
    console.log('\nPossible issues:');
    console.log('1. OFT adapter doesn\'t have approval to spend its own WETH');
    console.log('2. The send parameters were incorrect');
    console.log('3. The LayerZero message failed on the destination chain');
  } else if (oftBalance > 0n) {
    console.log('✅ WETH is in the OFT adapter');
    console.log('❌ But the cross-chain transfer didn\'t complete');
  }
  
  // Check if we need to give OFT approval to spend its own WETH
  const oftSelfAllowance = await weth.allowance(OFT_ADAPTER, OFT_ADAPTER);
  console.log(`\nOFT self-allowance: ${hre.ethers.formatEther(oftSelfAllowance)}`);
  
  console.log(chalk.yellow('\n📋 Next Steps:'));
  console.log('1. The WETH is stuck in the OFT adapter');
  console.log('2. Need to manually trigger the send from the OFT');
  console.log('3. Or investigate why the initial send didn\'t complete');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
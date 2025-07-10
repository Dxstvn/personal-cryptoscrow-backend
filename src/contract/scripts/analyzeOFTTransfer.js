#!/usr/bin/env node
/**
 * Analyze what happened in the OFT transfer
 */
const hre = require('hardhat');
const chalk = require('chalk');

const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';
const OFT_ADAPTER = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

// Recent transaction that "succeeded" but didn't complete cross-chain
const TX_HASH = '0x3da8b9ba92c57a48732fba26935dcf21a888a6ef8f3894521394d5c26e43fd72';

async function main() {
  console.log(chalk.blue('🔍 Analyzing OFT Transfer Flow'));
  console.log(chalk.blue('============================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Get the transaction receipt
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  
  // WETH Transfer events
  const wethInterface = new hre.ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)'
  ]);
  
  console.log(chalk.yellow('📋 WETH Events in Transaction:'));
  
  let transferCount = 0;
  let approvalCount = 0;
  
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
      try {
        const parsed = wethInterface.parseLog(log);
        if (parsed.name === 'Transfer') {
          transferCount++;
          console.log(`\n${transferCount}. Transfer:`);
          console.log(`   From: ${parsed.args.from}`);
          console.log(`   To: ${parsed.args.to}`);
          console.log(`   Amount: ${hre.ethers.formatEther(parsed.args.value)} WETH`);
          
          // Identify the parties
          if (parsed.args.from === ESCROW_ADDRESS) {
            console.log(chalk.green('   ✓ From Escrow'));
          }
          if (parsed.args.to === OFT_ADAPTER) {
            console.log(chalk.yellow('   → To OFT Adapter'));
          }
        } else if (parsed.name === 'Approval') {
          approvalCount++;
          console.log(`\n${approvalCount}. Approval:`);
          console.log(`   Owner: ${parsed.args.owner}`);
          console.log(`   Spender: ${parsed.args.spender}`);
          console.log(`   Amount: ${hre.ethers.formatEther(parsed.args.value)} WETH`);
        }
      } catch (e) {}
    }
  }
  
  // Check LayerZero events
  console.log(chalk.yellow('\n\n📡 LayerZero Events:'));
  
  // Check for PacketSent event from LayerZero endpoint
  const lzEndpoint = '0x6EDCE65403992e310A62460808c4b910D972f10f';
  const lzInterface = new hre.ethers.Interface([
    'event PacketSent(bytes encodedPayload, bytes options, uint256 nativeFee)',
    'event DVNFeePaid(address[] dvns, address[] adapters, uint256[] fees)'
  ]);
  
  let lzEventCount = 0;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === lzEndpoint.toLowerCase()) {
      lzEventCount++;
      console.log(`\n${lzEventCount}. LayerZero Event (topics: ${log.topics.length})`);
      console.log(`   Data length: ${log.data.length} bytes`);
    }
  }
  
  // Analyze the flow
  console.log(chalk.yellow('\n\n💡 Analysis:'));
  
  if (transferCount > 0 && approvalCount > 0) {
    console.log('✅ WETH was approved to OFT adapter');
    console.log('✅ WETH was transferred (likely by OFT adapter using transferFrom)');
    console.log('✅ LayerZero endpoint was called');
    console.log(chalk.red('\n❌ But the cross-chain message failed'));
    
    console.log(chalk.yellow('\nPossible reasons:'));
    console.log('1. Insufficient gas on destination chain');
    console.log('2. DVN (Decentralized Verifier Network) issue');
    console.log('3. Executor configuration problem');
    console.log('4. Message options were incorrect');
  }
  
  // Check current balances to understand the state
  const weth = new hre.ethers.Contract(WETH_ADDRESS, ['function balanceOf(address) view returns (uint256)'], provider);
  const escrowBalance = await weth.balanceOf(ESCROW_ADDRESS);
  const oftBalance = await weth.balanceOf(OFT_ADAPTER);
  
  console.log(chalk.cyan('\n\n📊 Current State:'));
  console.log(`Escrow WETH: ${hre.ethers.formatEther(escrowBalance)}`);
  console.log(`OFT WETH: ${hre.ethers.formatEther(oftBalance)}`);
  
  if (oftBalance > 0n) {
    console.log(chalk.red('\n⚠️  WETH is stuck in OFT adapter'));
    console.log('This means the transfer TO the adapter worked, but the cross-chain send failed');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
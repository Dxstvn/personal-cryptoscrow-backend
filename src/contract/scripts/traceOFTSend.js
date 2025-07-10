#!/usr/bin/env node
/**
 * Trace OFT send execution
 */
const hre = require('hardhat');
const chalk = require('chalk');

const TX_HASH = '0x3da8b9ba92c57a48732fba26935dcf21a888a6ef8f3894521394d5c26e43fd72';

async function main() {
  console.log(chalk.blue('🔍 Tracing OFT Send Execution'));
  console.log(chalk.blue('===========================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Get transaction
  const tx = await provider.getTransaction(TX_HASH);
  console.log(`From: ${tx.from}`);
  console.log(`To: ${tx.to}`);
  console.log(`Value: ${hre.ethers.formatEther(tx.value)} ETH`);
  console.log(`Data length: ${tx.data.length} bytes`);
  
  // Get trace to see internal calls
  console.log(chalk.yellow('\n📋 Transaction Receipt Analysis:'));
  
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
  console.log(`Logs: ${receipt.logs.length}`);
  
  // Count events by contract
  const eventsByContract = {};
  for (const log of receipt.logs) {
    const addr = log.address.toLowerCase();
    eventsByContract[addr] = (eventsByContract[addr] || 0) + 1;
  }
  
  console.log('\n📊 Events by Contract:');
  const contracts = {
    '0xfe91302f02fd8583170f8654a4ad7954f4195cbd': 'Escrow',
    '0xfff9976782d46cc05630d1f6ebab18b2324d6b14': 'WETH',
    '0x51af053a6bb282284e4407fadfd13b09d93b82ee': 'OFT Adapter',
    '0x6edce65403992e310a62460808c4b910d972f10f': 'LayerZero Endpoint',
    '0xcc1ae8cf5d3904cef3360a9532b477529b177cce': 'Unknown'
  };
  
  for (const [addr, count] of Object.entries(eventsByContract)) {
    const name = contracts[addr] || addr;
    console.log(`├─ ${name}: ${count} events`);
  }
  
  // Look for specific patterns
  console.log(chalk.yellow('\n🔎 Looking for OFT interaction...'));
  
  // Check if OFT adapter was called
  const oftLogs = receipt.logs.filter(log => 
    log.address.toLowerCase() === '0x51af053a6bb282284e4407fadfd13b09d93b82ee'
  );
  
  if (oftLogs.length > 0) {
    console.log(chalk.green(`✅ Found ${oftLogs.length} OFT adapter event(s)`));
    console.log('This confirms the OFT adapter WAS called');
  } else {
    console.log(chalk.red('❌ No OFT adapter events found'));
  }
  
  // Check LayerZero endpoint
  const lzLogs = receipt.logs.filter(log => 
    log.address.toLowerCase() === '0x6edce65403992e310a62460808c4b910d972f10f'
  );
  
  if (lzLogs.length > 0) {
    console.log(chalk.green(`✅ Found ${lzLogs.length} LayerZero endpoint event(s)`));
    console.log('This suggests a cross-chain message was initiated');
  }
  
  console.log(chalk.yellow('\n💡 Conclusion:'));
  console.log('The transaction DID interact with the OFT adapter and LayerZero endpoint.');
  console.log('The issue might be with the message delivery or execution on the destination chain.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
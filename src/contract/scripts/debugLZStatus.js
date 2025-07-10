#!/usr/bin/env node
/**
 * Debug LayerZero status
 */
const hre = require('hardhat');
const chalk = require('chalk');

const TX_HASH = '0x3da8b9ba92c57a48732fba26935dcf21a888a6ef8f3894521394d5c26e43fd72';
const OFT_ADAPTER = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';

async function main() {
  console.log(chalk.blue('🔍 Debugging LayerZero Status'));
  console.log(chalk.blue('===========================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Get transaction receipt
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  console.log(`Transaction: ${TX_HASH}`);
  console.log(`Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
  console.log(`Block: ${receipt.blockNumber}`);
  
  // Check for OFTSent event
  const oftAbi = [
    'event OFTSent(bytes32 indexed guid, uint32 indexed dstEid, address indexed fromAddress, uint256 amountLD)',
    'event OFTReceived(bytes32 indexed guid, uint32 indexed srcEid, address indexed toAddress, uint256 amountLD)'
  ];
  
  const oftInterface = new hre.ethers.Interface(oftAbi);
  
  console.log(`\n📋 OFT Events:`);
  let foundOFTSent = false;
  
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === OFT_ADAPTER.toLowerCase()) {
      try {
        const parsed = oftInterface.parseLog(log);
        if (parsed && parsed.name === 'OFTSent') {
          foundOFTSent = true;
          console.log(chalk.green('\n✅ OFTSent Event Found:'));
          console.log(`├─ GUID: ${parsed.args.guid}`);
          console.log(`├─ Destination: ${parsed.args.dstEid} (Arbitrum)`);
          console.log(`├─ From: ${parsed.args.fromAddress}`);
          console.log(`└─ Amount: ${hre.ethers.formatEther(parsed.args.amountLD)} WETH`);
        }
      } catch (e) {
        // Try raw decoding
        if (log.topics[0] === '0x85496b760a4b7f8d66384b9df21b381f5d1b1e79f229a47aaf4c232edc2fe59a') {
          console.log(chalk.yellow('\n📦 Raw OFT Event (likely OFTSent):'));
          console.log(`├─ GUID: ${log.topics[1]}`);
          console.log(`├─ Topics: ${log.topics.length}`);
          console.log(`└─ Data: ${log.data.slice(0, 66)}...`);
        }
      }
    }
  }
  
  if (!foundOFTSent) {
    console.log(chalk.red('\n❌ No OFTSent event found'));
    console.log('This suggests the cross-chain transfer did not initiate properly');
  }
  
  // Check WETH Transfer events
  const wethAbi = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
  const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const wethInterface = new hre.ethers.Interface(wethAbi);
  
  console.log(`\n📋 WETH Transfers:`);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === WETH.toLowerCase()) {
      try {
        const parsed = wethInterface.parseLog(log);
        if (parsed && parsed.name === 'Transfer') {
          console.log(`\n💸 Transfer: ${parsed.args.from.slice(0, 10)}... → ${parsed.args.to.slice(0, 10)}...`);
          console.log(`   Amount: ${hre.ethers.formatEther(parsed.args.value)} WETH`);
          
          if (parsed.args.to.toLowerCase() === OFT_ADAPTER.toLowerCase()) {
            console.log(chalk.green('   ✅ Transfer to OFT adapter confirmed'));
          }
        }
      } catch (e) {}
    }
  }
  
  console.log(chalk.yellow('\n📍 Check LayerZero Scan:'));
  console.log(`https://testnet.layerzeroscan.com/tx/${TX_HASH}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
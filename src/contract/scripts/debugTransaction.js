#!/usr/bin/env node
/**
 * Debug the failed transaction
 */
const hre = require('hardhat');
const chalk = require('chalk');

const TX_HASH = '0x1ce833a0ff2896e820f5032afc20dd6406b45ab197eb6a4f7829fe4d4c4fc65f';
const ESCROW_ADDRESS = '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd';
const OFT_ADAPTER = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';

async function main() {
  console.log(chalk.blue('🔍 Debugging Transaction'));
  console.log(chalk.blue('======================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Get transaction receipt
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  console.log(`Transaction Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
  console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
  
  // Parse events
  const escrowAbi = [
    'event EscrowReleased(bytes32 indexed escrowId, address indexed recipient, address token, uint256 amount, string method, bool isCompose)',
    'event CrossChainTransferInitiated(bytes32 indexed escrowId, uint256 indexed targetChainId, address indexed oftAdapter, bytes32 guid, bool useCompose)'
  ];
  
  const escrowInterface = new hre.ethers.Interface(escrowAbi);
  
  console.log(`\n📋 Events (${receipt.logs.length} total):`);
  
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`\n[${i}] Contract: ${log.address}`);
    
    if (log.address.toLowerCase() === ESCROW_ADDRESS.toLowerCase()) {
      try {
        const parsed = escrowInterface.parseLog(log);
        console.log(`    Event: ${parsed.name}`);
        console.log(`    Args:`, parsed.args);
      } catch (e) {
        console.log(`    Topics: ${log.topics.length}`);
        console.log(`    Data length: ${log.data.length}`);
      }
    } else if (log.address.toLowerCase() === OFT_ADAPTER.toLowerCase()) {
      console.log(`    OFT Adapter Event`);
      console.log(`    Topics:`, log.topics.slice(0, 2));
    }
  }
  
  // Check approval
  const wethAbi = ['function allowance(address owner, address spender) view returns (uint256)'];
  const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
  const weth = new hre.ethers.Contract(WETH_ADDRESS, wethAbi, provider);
  
  const allowance = await weth.allowance(ESCROW_ADDRESS, OFT_ADAPTER);
  console.log(`\n💰 WETH Allowance:`);
  console.log(`Escrow → OFT Adapter: ${hre.ethers.formatEther(allowance)} WETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
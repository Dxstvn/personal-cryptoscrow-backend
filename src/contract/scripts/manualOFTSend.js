#!/usr/bin/env node
/**
 * Manually send WETH from OFT adapter
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const OFT_ADAPTER = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const SELLER_ADDRESS = '0xA1a5961F5F3f5B488af86b37E112bC26e4aC41DC';

async function main() {
  console.log(chalk.blue('🚀 Manual OFT Send'));
  console.log(chalk.blue('================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(`Using wallet: ${signer.address} (BACKEND)`);
  
  // Check WETH balance
  const wethAbi = ['function balanceOf(address) view returns (uint256)'];
  const weth = new ethers.Contract(WETH_ADDRESS, wethAbi, provider);
  const balance = await weth.balanceOf(OFT_ADAPTER);
  
  console.log(`\nOFT Adapter WETH Balance: ${formatEther(balance)}`);
  
  if (balance === 0n) {
    console.log(chalk.red('❌ No WETH to send'));
    return;
  }
  
  // OFT adapter ABI with proper struct definitions
  const oftAbi = [
    {
      "inputs": [
        {
          "components": [
            { "internalType": "uint32", "name": "dstEid", "type": "uint32" },
            { "internalType": "bytes32", "name": "to", "type": "bytes32" },
            { "internalType": "uint256", "name": "amountLD", "type": "uint256" },
            { "internalType": "uint256", "name": "minAmountLD", "type": "uint256" },
            { "internalType": "bytes", "name": "extraOptions", "type": "bytes" },
            { "internalType": "bytes", "name": "composeMsg", "type": "bytes" },
            { "internalType": "bytes", "name": "oftCmd", "type": "bytes" }
          ],
          "internalType": "struct SendParam",
          "name": "sendParam",
          "type": "tuple"
        },
        {
          "components": [
            { "internalType": "uint256", "name": "nativeFee", "type": "uint256" },
            { "internalType": "uint256", "name": "lzTokenFee", "type": "uint256" }
          ],
          "internalType": "struct MessagingFee",
          "name": "fee",
          "type": "tuple"
        },
        { "internalType": "address", "name": "refundAddress", "type": "address" }
      ],
      "name": "send",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "components": [
            { "internalType": "uint32", "name": "dstEid", "type": "uint32" },
            { "internalType": "bytes32", "name": "to", "type": "bytes32" },
            { "internalType": "uint256", "name": "amountLD", "type": "uint256" },
            { "internalType": "uint256", "name": "minAmountLD", "type": "uint256" },
            { "internalType": "bytes", "name": "extraOptions", "type": "bytes" },
            { "internalType": "bytes", "name": "composeMsg", "type": "bytes" },
            { "internalType": "bytes", "name": "oftCmd", "type": "bytes" }
          ],
          "internalType": "struct SendParam",
          "name": "sendParam",
          "type": "tuple"
        },
        { "internalType": "bool", "name": "payInLzToken", "type": "bool" }
      ],
      "name": "quoteSend",
      "outputs": [
        {
          "components": [
            { "internalType": "uint256", "name": "nativeFee", "type": "uint256" },
            { "internalType": "uint256", "name": "lzTokenFee", "type": "uint256" }
          ],
          "internalType": "struct MessagingFee",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    'function owner() view returns (address)'
  ];
  
  const oft = new ethers.Contract(OFT_ADAPTER, oftAbi, signer);
  
  // Check ownership
  const owner = await oft.owner();
  console.log(`OFT Owner: ${owner}`);
  
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log(chalk.red('❌ You are not the owner'));
    return;
  }
  
  // Prepare send parameters
  const sendParam = {
    dstEid: 40231, // Arbitrum endpoint
    to: ethers.zeroPadValue(SELLER_ADDRESS, 32),
    amountLD: balance,
    minAmountLD: balance * 99n / 100n, // 1% slippage
    extraOptions: '0x00030100110100000000000000000000000000030d40', // Standard options
    composeMsg: '0x',
    oftCmd: '0x'
  };
  
  console.log(chalk.cyan('\n📦 Send Parameters:'));
  console.log(`├─ Amount: ${formatEther(balance)} WETH`);
  console.log(`├─ To: ${SELLER_ADDRESS}`);
  console.log(`└─ Chain: Arbitrum Sepolia`);
  
  // Get quote
  const fee = await oft.quoteSend(sendParam, false);
  console.log(`\n💰 LayerZero Fee: ${formatEther(fee.nativeFee)} ETH`);
  
  // Send
  console.log(chalk.cyan('\n🚀 Sending...'));
  const tx = await oft.send(sendParam, fee, signer.address, {
    value: fee.nativeFee,
    gasLimit: 500000
  });
  
  console.log(`Transaction: ${tx.hash}`);
  const receipt = await tx.wait();
  
  if (receipt.status === 1) {
    console.log(chalk.green('✅ Send successful!'));
    console.log(chalk.cyan('\n🔍 Track on LayerZero:'));
    console.log(`https://testnet.layerzeroscan.com/tx/${tx.hash}`);
  } else {
    console.log(chalk.red('❌ Send failed'));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
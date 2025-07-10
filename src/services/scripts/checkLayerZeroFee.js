#!/usr/bin/env node
/**
 * Check LayerZero fee requirements
 */

import { ethers, formatEther, parseEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const ESCROW_ADDRESS = '0x726ca2162A5B90718EF11Ab8f294c0f30E258208';
const OFT_ADAPTER = '0x7612fc49B82D42623468BB966E0d59a7D35eA8b9';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const ESCROW_ID = '0x1b81e1faaf7525a3c3572504e54b475c7b5e0b83eb12f696155ac8b5fbddb50a';

async function main() {
  console.log(chalk.blue('💰 Checking LayerZero Fee Requirements'));
  console.log(chalk.blue('=====================================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  // OFT Adapter ABI for fee estimation
  const oftAbi = [
    'function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) msgFee)',
    'function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, tuple(uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) payable returns (tuple(bytes32 guid, uint64 nonce, tuple(uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt) msgReceipt, tuple(uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt)'
  ];
  
  const oft = new ethers.Contract(OFT_ADAPTER, oftAbi, wallet);
  
  // Get escrow details
  const escrowAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function swapComposers(uint32) view returns (address)',
    'function maxSlippageBps() view returns (uint256)',
    'function lzReceiveGas() view returns (uint128)',
    'function lzComposeGas() view returns (uint128)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, provider);
  const details = await escrow.escrows(ESCROW_ID);
  
  console.log(chalk.cyan('Escrow Details:'));
  console.log(`├─ Net Amount: ${formatEther(details.netAmount)} ETH`);
  console.log(`├─ Target Chain ID: ${details.targetChainId}`);
  console.log(`└─ Target Token: ${details.targetToken}\n`);
  
  // Get LayerZero configuration
  const maxSlippage = await escrow.maxSlippageBps();
  const lzReceiveGas = await escrow.lzReceiveGas();
  const lzComposeGas = await escrow.lzComposeGas();
  
  console.log(chalk.cyan('LayerZero Configuration:'));
  console.log(`├─ Max Slippage: ${maxSlippage} bps`);
  console.log(`├─ LZ Receive Gas: ${lzReceiveGas}`);
  console.log(`└─ LZ Compose Gas: ${lzComposeGas}\n`);
  
  // Check if composer is configured
  const composer = await escrow.swapComposers(40231); // Arbitrum endpoint
  const useCompose = composer !== '0x0000000000000000000000000000000000000000' && details.targetToken !== WETH_ADDRESS;
  
  console.log(chalk.cyan('Composer Configuration:'));
  console.log(`├─ Composer Address: ${composer}`);
  console.log(`└─ Will Use Compose: ${useCompose}\n`);
  
  try {
    // Build the send parameters
    const bridgeAmount = details.netAmount;
    const minAmountLD = bridgeAmount * (10000n - BigInt(maxSlippage)) / 10000n;
    
    // Build options based on whether compose is used
    console.log(chalk.yellow('Building LayerZero options...'));
    
    // Import OptionsBuilder functionality
    let options;
    if (useCompose) {
      // Options with compose: executorLzReceiveOption + executorLzComposeOption
      // Format: 0x00030100 (receive) + gas + value + 0x00030101 (compose) + index + gas + value
      const receiveOption = '0x0003010000000000000000000000000000000000000000000000000000000000000186a00000000000000000000000000000000000000000'; // 100k gas
      const composeOption = '0x000301010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000493e00000000000000000000000000000000000000000'; // 300k gas
      options = '0x' + receiveOption.slice(2) + composeOption.slice(2);
    } else {
      // Standard receive option only
      options = '0x0003010000000000000000000000000000000000000000000000000000000000000186a00000000000000000000000000000000000000000'; // 100k gas
    }
    
    console.log(`├─ Options length: ${options.length}`);
    console.log(`└─ Using compose: ${useCompose}\n`);
    
    // Build compose message if needed
    let composeMsg = '0x';
    if (useCompose) {
      composeMsg = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint256', 'uint256', 'uint32'],
        [
          details.seller,
          details.targetToken,
          bridgeAmount,
          minAmountLD,
          Math.floor(Date.now() / 1000) + 3600
        ]
      );
    }
    
    // Build send parameters
    const sendParam = {
      dstEid: 40231, // Arbitrum endpoint
      to: ethers.zeroPadValue(useCompose ? composer : details.seller, 32),
      amountLD: bridgeAmount,
      minAmountLD: minAmountLD,
      extraOptions: options,
      composeMsg: composeMsg,
      oftCmd: '0x'
    };
    
    console.log(chalk.cyan('Send Parameters:'));
    console.log(`├─ Destination: ${sendParam.dstEid}`);
    console.log(`├─ To: ${sendParam.to}`);
    console.log(`├─ Amount: ${formatEther(sendParam.amountLD)}`);
    console.log(`├─ Min Amount: ${formatEther(sendParam.minAmountLD)}`);
    console.log(`├─ Compose Msg Length: ${composeMsg.length}`);
    console.log(`└─ Options: ${options}\n`);
    
    // Get fee quote
    console.log(chalk.yellow('Getting fee quote from OFT adapter...'));
    const feeQuote = await oft.quoteSend(sendParam, false);
    
    console.log(chalk.green('LayerZero Fee Quote:'));
    console.log(`├─ Native Fee: ${formatEther(feeQuote.nativeFee)} ETH`);
    console.log(`└─ LZ Token Fee: ${formatEther(feeQuote.lzTokenFee)} LZ\n`);
    
    // Calculate required fee with buffer
    const requiredFee = useCompose ? feeQuote.nativeFee * 150n / 100n : feeQuote.nativeFee;
    console.log(chalk.cyan('Fee Calculation:'));
    console.log(`├─ Base Fee: ${formatEther(feeQuote.nativeFee)} ETH`);
    console.log(`├─ With Buffer (150%): ${formatEther(requiredFee)} ETH`);
    console.log(`└─ Recommended: ${formatEther(requiredFee)} ETH\n`);
    
  } catch (error) {
    console.error(chalk.red('❌ Error getting fee quote:'), error.message);
    if (error.data) {
      console.log('Error data:', error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
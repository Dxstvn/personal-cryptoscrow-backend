#!/usr/bin/env node
/**
 * Debug the escrow release failure
 */

import { ethers, parseEther } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const YOUR_ESCROW_ID = '0xca5a3b576aca680f63bc76275197bd8c81fc0de10317b5f9d70ecf1992f3f3a8';

class YourEscrowServiceV3 extends EscrowServiceV3 {
  constructor() {
    super();
    this.chainConfigs[11155111].contractAddress = YOUR_CONTRACT;
  }
}

async function debugRelease() {
  console.log(chalk.blue('🔍 Debugging Escrow Release'));
  console.log(chalk.blue('==========================='));
  
  const service = new YourEscrowServiceV3();
  await service.initialize();
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  // Full contract ABI for debugging
  const contractAbi = [
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
    'function releaseEscrow(bytes32 escrowId) payable',
    'function chainIdToEndpointId(uint256) view returns (uint32)',
    'function oftAdapters(uint32) view returns (address)',
    'function owner() view returns (address)',
    'function serviceWallet() view returns (address)',
    'event EscrowReleased(bytes32 indexed escrowId, address indexed seller, address finalToken, uint256 finalAmount, string method, bool withCompose)'
  ];
  
  const contract = new ethers.Contract(YOUR_CONTRACT, contractAbi, wallet);
  
  try {
    console.log(chalk.cyan('\n1. Checking Escrow State:'));
    const escrow = await contract.escrows(YOUR_ESCROW_ID);
    
    console.log(`Buyer: ${escrow.buyer}`);
    console.log(`Seller: ${escrow.seller}`);
    console.log(`Deposit Amount: ${ethers.formatEther(escrow.depositAmount)} ETH`);
    console.log(`Net Amount: ${ethers.formatEther(escrow.netAmount)} ETH`);
    console.log(`Target Chain ID: ${escrow.targetChainId}`);
    console.log(`Target Token: ${escrow.targetToken}`);
    console.log(`Condition Met: ${escrow.conditionMet ? chalk.green('✅') : chalk.red('❌')}`);
    console.log(`Released: ${escrow.released ? chalk.green('✅') : chalk.red('❌')}`);
    
    if (escrow.released) {
      console.log(chalk.yellow('\n⚠️  This escrow has already been released!'));
      return;
    }
    
    if (!escrow.conditionMet) {
      console.log(chalk.red('\n❌ Condition not met! Cannot release.'));
      return;
    }
    
    console.log(chalk.cyan('\n2. Checking Contract Configuration:'));
    
    // Check service wallet
    const serviceWallet = await contract.serviceWallet();
    console.log(`Service Wallet: ${serviceWallet}`);
    console.log(`Is your wallet: ${serviceWallet.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
    
    // Check chain mapping
    const targetEndpointId = await contract.chainIdToEndpointId(escrow.targetChainId);
    console.log(`Target Chain ${escrow.targetChainId} -> Endpoint ${targetEndpointId}`);
    
    if (targetEndpointId === 0) {
      console.log(chalk.red('❌ No endpoint mapping for target chain!'));
      return;
    }
    
    // Check OFT adapter
    const oftAdapter = await contract.oftAdapters(targetEndpointId);
    console.log(`OFT Adapter for endpoint ${targetEndpointId}: ${oftAdapter}`);
    
    if (oftAdapter === ethers.ZeroAddress) {
      console.log(chalk.red('❌ No OFT adapter configured for target endpoint!'));
      return;
    }
    
    console.log(chalk.cyan('\n3. Checking OFT Adapter Authorization:'));
    
    // Check if escrow contract is authorized on OFT adapter
    const oftAbi = [
      'function owner() view returns (address)',
      'function isAuthorized(address) view returns (bool)',
      'function escrowContracts(address) view returns (bool)'
    ];
    
    const oft = new ethers.Contract(oftAdapter, oftAbi, provider);
    
    try {
      const isAuth = await oft.escrowContracts(YOUR_CONTRACT);
      console.log(`Your contract authorized on OFT: ${isAuth ? '✅' : '❌'}`);
      
      if (!isAuth) {
        console.log(chalk.red('\n❌ Your escrow contract is not authorized on the OFT adapter!'));
        console.log('The OFT adapter needs to authorize your contract.');
        console.log(`OFT Adapter: ${oftAdapter}`);
        console.log(`Your Contract: ${YOUR_CONTRACT}`);
        
        const oftOwner = await oft.owner();
        console.log(`\nOFT Owner: ${oftOwner}`);
        console.log('They need to run:');
        console.log(chalk.gray(`await oftAdapter.authorizeEscrowContract("${YOUR_CONTRACT}", true)`));
      }
    } catch (error) {
      console.log('Could not check OFT authorization (method may not exist)');
    }
    
    console.log(chalk.cyan('\n4. Attempting Release with Different Values:'));
    
    // Try with no value first
    console.log('\nTrying with 0 ETH (same-chain test)...');
    try {
      const tx = await contract.releaseEscrow.staticCall(YOUR_ESCROW_ID, { value: 0 });
      console.log('✅ Static call succeeded with 0 ETH');
    } catch (error) {
      console.log(`❌ Failed with 0 ETH: ${error.message}`);
      
      // If it's cross-chain, we need fees
      if (escrow.targetChainId !== 11155111) {
        console.log('\nTrying with LayerZero fees...');
        
        const feeAmounts = [
          parseEther('0.001'),
          parseEther('0.003'),
          parseEther('0.01')
        ];
        
        for (const fee of feeAmounts) {
          try {
            console.log(`\nTrying with ${ethers.formatEther(fee)} ETH...`);
            const tx = await contract.releaseEscrow.staticCall(YOUR_ESCROW_ID, { value: fee });
            console.log(`✅ Static call succeeded with ${ethers.formatEther(fee)} ETH`);
            
            // If static call works, do the actual transaction
            console.log('\nExecuting actual transaction...');
            const realTx = await contract.releaseEscrow(YOUR_ESCROW_ID, { value: fee });
            console.log(`TX: https://sepolia.etherscan.io/tx/${realTx.hash}`);
            
            const receipt = await realTx.wait();
            console.log(chalk.green('✅ Release successful!'));
            
            // Extract events
            for (const log of receipt.logs) {
              try {
                const parsed = contract.interface.parseLog(log);
                if (parsed && parsed.name === 'EscrowReleased') {
                  console.log(`\nRelease Details:`);
                  console.log(`- Method: ${parsed.args.method}`);
                  console.log(`- Final Amount: ${ethers.formatEther(parsed.args.finalAmount)}`);
                }
              } catch {}
            }
            
            break;
          } catch (error) {
            console.log(`❌ Failed with ${ethers.formatEther(fee)} ETH`);
            if (error.message.includes('insufficient fee')) {
              console.log('   → Need more LayerZero fees');
            } else {
              console.log(`   → ${error.message}`);
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  debugRelease().catch(console.error);
}
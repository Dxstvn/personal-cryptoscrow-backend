#!/usr/bin/env node
/**
 * Debug the exact release failure
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x2528c9dd1924d8850968d4b1c83d884754d891180c7f5cdbdc64cff9df35c6fd';

async function debug() {
  console.log(chalk.blue('🔍 Debugging Contract Release'));
  console.log(chalk.blue('============================'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  // Load the actual contract bytecode to check what version it is
  const code = await provider.getCode(YOUR_ESCROW_CONTRACT);
  console.log(`Contract bytecode length: ${code.length} chars`);
  
  // Try to load V3 ABI from file
  let abi;
  try {
    const v3Path = path.join(__dirname, '../../contract/artifacts/contracts/UniversalEscrowServiceV3.sol/UniversalEscrowServiceV3.json');
    const v3Json = JSON.parse(await fs.readFile(v3Path, 'utf8'));
    abi = v3Json.abi;
    console.log('✅ Loaded V3 ABI from artifacts');
  } catch (error) {
    console.log('❌ Could not load V3 ABI from artifacts');
    // Minimal ABI
    abi = [
      'function releaseEscrow(bytes32 escrowId) external payable',
      'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)'
    ];
  }
  
  const contract = new ethers.Contract(YOUR_ESCROW_CONTRACT, abi, wallet);
  
  try {
    // Get the escrow data
    const escrow = await contract.escrows(ESCROW_ID);
    console.log(chalk.cyan('\nEscrow Details:'));
    console.log(`Deposit Token: ${escrow.depositToken} (${escrow.depositToken === ethers.ZeroAddress ? 'ETH' : 'Token'})`);
    console.log(`Target Token: ${escrow.targetToken}`);
    console.log(`Target Chain: ${escrow.targetChainId}`);
    
    // Try to simulate the release and capture the exact error
    console.log(chalk.cyan('\nSimulating Release:'));
    
    // Encode the function data
    const iface = new ethers.Interface(abi);
    const data = iface.encodeFunctionData('releaseEscrow', [ESCROW_ID]);
    
    try {
      // Try the call with trace
      const result = await provider.send('eth_call', [{
        from: wallet.address,
        to: YOUR_ESCROW_CONTRACT,
        data: data,
        value: ethers.toQuantity(ethers.parseEther('0.005'))
      }, 'latest']);
      
      console.log('Call result:', result);
    } catch (error) {
      console.log('Call failed:', error.message);
      
      // Try to get more details
      if (error.data) {
        console.log('Error data:', error.data);
      }
    }
    
    // Check if it's a V2 vs V3 issue
    console.log(chalk.cyan('\n🔍 Contract Version Check:'));
    
    // V3 specific functions
    const v3Functions = [
      { name: 'chainIdToEndpointId', selector: '0x7d4e5601' },
      { name: 'oftAdapters', selector: '0x28655533' },
      { name: 'releaseEscrowCompose', selector: '0x6a3c5b6e' }
    ];
    
    for (const func of v3Functions) {
      try {
        await provider.call({
          to: YOUR_ESCROW_CONTRACT,
          data: func.selector + '0000000000000000000000000000000000000000000000000000000000000000'
        });
        console.log(`✅ Has ${func.name} - This is a V3 contract`);
      } catch {
        console.log(`❌ Missing ${func.name}`);
      }
    }
    
    console.log(chalk.yellow('\n💡 Diagnosis:'));
    console.log('The contract is reverting without error data.');
    console.log('This typically means a require() statement is failing.');
    console.log('\nCommon causes for V3 release failure:');
    console.log('1. Contract has ETH but needs WETH for cross-chain');
    console.log('2. WETH wrapping might be failing');
    console.log('3. OFT adapter approval might be missing');
    console.log('4. Insufficient gas for the complex operation');
    
  } catch (error) {
    console.log(chalk.red('Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  debug().catch(console.error);
}
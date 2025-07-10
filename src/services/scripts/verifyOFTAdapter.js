#!/usr/bin/env node
/**
 * Verify OFT adapter configuration and permissions
 */

import { ethers, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const OFT_ADAPTER = '0x7612fc49B82D42623468BB966E0d59a7D35eA8b9';
const WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const ESCROW_ADDRESS = '0x726ca2162A5B90718EF11Ab8f294c0f30E258208';
const LZ_ENDPOINT = '0x6EDCE65403992e310A62460808c4b910D972f10f';

async function main() {
  console.log(chalk.blue('🔍 Verifying OFT Adapter Configuration'));
  console.log(chalk.blue('=====================================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Check if OFT adapter contract exists
  const oftCode = await provider.getCode(OFT_ADAPTER);
  console.log(chalk.cyan('OFT Adapter Status:'));
  console.log(`├─ Contract exists: ${oftCode !== '0x' ? 'Yes' : 'No'}`);
  console.log(`├─ Code length: ${oftCode.length}`);
  console.log(`└─ Address: ${OFT_ADAPTER}\n`);
  
  if (oftCode === '0x') {
    console.log(chalk.red('❌ OFT Adapter not deployed at this address!'));
    return;
  }
  
  // Basic OFT interface
  const oftAbi = [
    'function owner() view returns (address)',
    'function token() view returns (address)',
    'function approvalRequired() view returns (bool)',
    'function endpoint() view returns (address)',
    'function decimalConversionRate() view returns (uint256)',
    'function peers(uint32 eid) view returns (bytes32 peer)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)'
  ];
  
  const oft = new ethers.Contract(OFT_ADAPTER, oftAbi, provider);
  
  try {
    // Check basic configuration
    console.log(chalk.cyan('OFT Configuration:'));
    
    try {
      const owner = await oft.owner();
      console.log(`├─ Owner: ${owner}`);
    } catch (e) {
      console.log(`├─ Owner: Error reading (${e.message})`);
    }
    
    try {
      const token = await oft.token();
      console.log(`├─ Token: ${token}`);
      console.log(`├─ Is WETH: ${token.toLowerCase() === WETH_ADDRESS.toLowerCase() ? 'Yes' : 'No'}`);
    } catch (e) {
      console.log(`├─ Token: Error reading (${e.message})`);
    }
    
    try {
      const endpoint = await oft.endpoint();
      console.log(`├─ Endpoint: ${endpoint}`);
      console.log(`├─ Correct endpoint: ${endpoint.toLowerCase() === LZ_ENDPOINT.toLowerCase() ? 'Yes' : 'No'}`);
    } catch (e) {
      console.log(`├─ Endpoint: Error reading (${e.message})`);
    }
    
    try {
      const approvalReq = await oft.approvalRequired();
      console.log(`└─ Approval Required: ${approvalReq}\n`);
    } catch (e) {
      console.log(`└─ Approval Required: Error reading\n`);
    }
    
    // Check peer configuration
    console.log(chalk.cyan('Peer Configuration:'));
    const endpoints = [
      { id: 40161, name: 'Sepolia' },
      { id: 40231, name: 'Arbitrum Sepolia' },
      { id: 40267, name: 'Polygon Amoy' }
    ];
    
    for (const ep of endpoints) {
      try {
        const peer = await oft.peers(ep.id);
        console.log(`├─ ${ep.name} (${ep.id}): ${peer === '0x' + '0'.repeat(64) ? 'Not set' : peer}`);
      } catch (e) {
        console.log(`├─ ${ep.name} (${ep.id}): Error reading`);
      }
    }
    
    // Check WETH allowance from escrow to OFT
    console.log(chalk.cyan('\nToken Permissions:'));
    const weth = new ethers.Contract(WETH_ADDRESS, ['function allowance(address owner, address spender) view returns (uint256)'], provider);
    
    try {
      const allowance = await weth.allowance(ESCROW_ADDRESS, OFT_ADAPTER);
      console.log(`├─ Escrow → OFT allowance: ${formatEther(allowance)} WETH`);
    } catch (e) {
      console.log(`├─ Allowance check failed: ${e.message}`);
    }
    
    // Try alternative OFT interface (OFTCore)
    console.log(chalk.cyan('\nTrying Alternative OFT Interface:'));
    
    const oftCoreAbi = [
      'function sharedDecimals() view returns (uint8)',
      'function getAmountLD(uint64 _amountSD) view returns (uint256 amountLD)',
      'function getAmountSD(uint256 _amountLD) view returns (uint64 amountSD)'
    ];
    
    const oftCore = new ethers.Contract(OFT_ADAPTER, oftCoreAbi, provider);
    
    try {
      const sharedDecimals = await oftCore.sharedDecimals();
      console.log(`├─ Shared Decimals: ${sharedDecimals}`);
    } catch (e) {
      console.log(`├─ Shared Decimals: Not available`);
    }
    
    // Check actual adapter addresses from recent deployments
    console.log(chalk.yellow('\n⚠️  Checking known OFT adapters on Sepolia:'));
    const knownAdapters = [
      '0x7612fc49B82D42623468BB966E0d59a7D35eA8b9', // Current
      '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6', // Previous
      '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6'  // Another
    ];
    
    for (const adapter of knownAdapters) {
      const code = await provider.getCode(adapter);
      if (code !== '0x') {
        console.log(`├─ ${adapter}: Deployed (${code.length} bytes)`);
      }
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Diagnose V3 Release Issue
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';

async function diagnose() {
  console.log(chalk.blue('🔍 Diagnosing V3 Release Issue'));
  console.log(chalk.blue('=============================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  // Load the V3 ABI
  const abiPath = path.join(__dirname, '../../contract/abi/UniversalEscrowServiceV3.json');
  let v3Abi;
  
  try {
    v3Abi = JSON.parse(await fs.readFile(abiPath, 'utf8'));
    console.log('✅ Loaded V3 ABI');
  } catch (error) {
    console.log('❌ Could not load V3 ABI, using minimal ABI');
    v3Abi = [
      'function releaseEscrow(bytes32 escrowId) external payable',
      'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)',
      'function serviceWallet() view returns (address)',
      'function oftAdapters(uint32) view returns (address)',
      'function chainIdToEndpointId(uint256) view returns (uint32)'
    ];
  }
  
  const contract = new ethers.Contract(YOUR_ESCROW_CONTRACT, v3Abi, wallet);
  
  try {
    console.log(chalk.cyan('1. Escrow State:'));
    const escrow = await contract.escrows(ESCROW_ID);
    console.log(`Released: ${escrow.released ? '✅ Already Released!' : '❌ Not Released'}`);
    
    if (escrow.released) {
      console.log(chalk.yellow('\n⚠️  This escrow has already been released!'));
      console.log('The transaction may have succeeded in a previous attempt.');
      return;
    }
    
    console.log(`Condition Met: ${escrow.conditionMet ? '✅' : '❌'}`);
    console.log(`Buyer: ${escrow.buyer}`);
    console.log(`Service Wallet: ${await contract.serviceWallet()}`);
    console.log(`Authorized: ${escrow.buyer === wallet.address || (await contract.serviceWallet()) === wallet.address ? '✅' : '❌'}`);
    
    console.log(chalk.cyan('\n2. Cross-Chain Configuration:'));
    const targetEndpoint = await contract.chainIdToEndpointId(escrow.targetChainId);
    const oftAdapter = await contract.oftAdapters(targetEndpoint);
    console.log(`Target Chain: ${escrow.targetChainId}`);
    console.log(`Target Endpoint: ${targetEndpoint}`);
    console.log(`OFT Adapter: ${oftAdapter}`);
    console.log(`OFT Configured: ${oftAdapter !== ethers.ZeroAddress ? '✅' : '❌'}`);
    
    console.log(chalk.cyan('\n3. Balance Check:'));
    const contractBalance = await provider.getBalance(YOUR_ESCROW_CONTRACT);
    console.log(`Contract ETH Balance: ${formatEther(contractBalance)} ETH`);
    console.log(`Expected Amount: ${formatEther(escrow.depositAmount)} ETH`);
    console.log(`Has Funds: ${contractBalance >= escrow.depositAmount ? '✅' : '❌'}`);
    
    // Check if the issue is with OFT adapter authorization
    if (oftAdapter !== ethers.ZeroAddress) {
      console.log(chalk.cyan('\n4. OFT Adapter Check:'));
      const oftAbi = ['function escrowContracts(address) view returns (bool)'];
      const oft = new ethers.Contract(oftAdapter, oftAbi, provider);
      
      try {
        const isAuthorized = await oft.escrowContracts(YOUR_ESCROW_CONTRACT);
        console.log(`Contract Authorized on OFT: ${isAuthorized ? '✅' : '❌'}`);
        
        if (!isAuthorized) {
          console.log(chalk.red('\n❌ YOUR CONTRACT IS NOT AUTHORIZED ON THE OFT ADAPTER!'));
          console.log('This is why the release is failing.');
          console.log(`\nThe OFT adapter (${oftAdapter}) needs to authorize your contract.`);
          console.log('Run: npm run oft:authorize');
        }
      } catch (error) {
        console.log('Could not check OFT authorization');
      }
    }
    
    console.log(chalk.cyan('\n5. Attempting Simulation:'));
    try {
      const txData = contract.interface.encodeFunctionData('releaseEscrow', [ESCROW_ID]);
      console.log('Encoded data:', txData);
      
      // Try with the service wallet
      const result = await provider.call({
        from: wallet.address,
        to: YOUR_ESCROW_CONTRACT,
        data: txData,
        value: parseEther('0.003')
      });
      console.log('✅ Simulation succeeded!');
    } catch (error) {
      console.log('❌ Simulation failed:', error.message);
      
      // Try to decode the error
      if (error.data) {
        try {
          const iface = new ethers.Interface(v3Abi);
          const decoded = iface.parseError(error.data);
          console.log('Error name:', decoded?.name);
          console.log('Error args:', decoded?.args);
        } catch (e) {
          console.log('Raw error data:', error.data);
        }
      }
    }
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  diagnose().catch(console.error);
}
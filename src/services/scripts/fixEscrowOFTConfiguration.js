#!/usr/bin/env node
/**
 * Fix Escrow Contract OFT Configuration
 * Ensures your escrow contract has the correct OFT adapter addresses set
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const ESCROW_ID = '0x3b63131bb4d49efd3dff60efc2540b64222c51a12230e1d552021e971fcc585a';

const CHAINS = {
  sepolia: {
    name: 'Sepolia',
    chainId: 11155111,
    endpointId: 40161,
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    oftAdapter: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4',
    explorer: 'https://sepolia.etherscan.io'
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    endpointId: 40231,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    oftAdapter: '0xbaa46938E3110187ED6a55EE139312b28c943d00',
    explorer: 'https://sepolia.arbiscan.io'
  }
};

async function diagnoseAndFix() {
  console.log(chalk.blue('🔧 Diagnosing Escrow OFT Configuration'));
  console.log(chalk.blue('======================================'));
  
  const provider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(`Service Wallet: ${wallet.address}`);
  console.log(`Escrow Contract: ${YOUR_ESCROW_CONTRACT}`);
  
  // Contract ABIs
  const escrowAbi = [
    'function owner() view returns (address)',
    'function oftAdapters(uint32) view returns (address)',
    'function setOFTAdapter(uint32 endpointId, address adapter, string chainName)',
    'function chainIdToEndpointId(uint256) view returns (uint32)',
    'function escrows(bytes32) view returns (address buyer, address seller, address depositToken, uint256 depositAmount, uint256 netAmount, address targetToken, uint256 targetChainId, bool released, bool conditionMet, uint256 timestamp, bytes32 transactionId)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Step 1: Check escrow details
    console.log(chalk.cyan('\n1. Checking Escrow Details:'));
    const escrowData = await escrow.escrows(ESCROW_ID);
    console.log(`Target Chain ID: ${escrowData.targetChainId}`);
    console.log(`Condition Met: ${escrowData.conditionMet ? '✅' : '❌'}`);
    console.log(`Released: ${escrowData.released ? '✅' : '❌'}`);
    
    // Step 2: Check chain mapping
    console.log(chalk.cyan('\n2. Checking Chain ID to Endpoint Mapping:'));
    const targetEndpointId = await escrow.chainIdToEndpointId(escrowData.targetChainId);
    console.log(`Chain ${escrowData.targetChainId} → Endpoint ${targetEndpointId}`);
    
    if (targetEndpointId === 0) {
      console.log(chalk.red('❌ No endpoint mapping found!'));
      // This might need to be set in the contract
    }
    
    // Step 3: Check OFT adapter configuration
    console.log(chalk.cyan('\n3. Checking OFT Adapter Configuration:'));
    
    // Check Sepolia OFT adapter
    const sepoliaOFT = await escrow.oftAdapters(CHAINS.sepolia.endpointId);
    console.log(`Sepolia OFT (${CHAINS.sepolia.endpointId}): ${sepoliaOFT}`);
    console.log(`Expected: ${CHAINS.sepolia.oftAdapter}`);
    console.log(`Status: ${sepoliaOFT === CHAINS.sepolia.oftAdapter ? '✅' : '❌'}`);
    
    // Check Arbitrum OFT adapter
    const arbitrumOFT = await escrow.oftAdapters(CHAINS.arbitrumSepolia.endpointId);
    console.log(`\nArbitrum OFT (${CHAINS.arbitrumSepolia.endpointId}): ${arbitrumOFT}`);
    console.log(`Expected: ${CHAINS.arbitrumSepolia.oftAdapter}`);
    console.log(`Status: ${arbitrumOFT === CHAINS.arbitrumSepolia.oftAdapter ? '✅' : '❌'}`);
    
    // Step 4: Check ownership
    console.log(chalk.cyan('\n4. Checking Contract Ownership:'));
    const owner = await escrow.owner();
    console.log(`Contract Owner: ${owner}`);
    console.log(`You are owner: ${owner.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
    
    // Step 5: Fix OFT adapter configuration if needed
    if (owner.toLowerCase() === wallet.address.toLowerCase()) {
      console.log(chalk.cyan('\n5. Fixing OFT Adapter Configuration:'));
      
      // Set Sepolia OFT if needed
      if (sepoliaOFT !== CHAINS.sepolia.oftAdapter) {
        console.log(chalk.yellow(`\nSetting Sepolia OFT adapter...`));
        const tx1 = await escrow.setOFTAdapter(
          CHAINS.sepolia.endpointId,
          CHAINS.sepolia.oftAdapter,
          CHAINS.sepolia.name
        );
        console.log(`TX: ${CHAINS.sepolia.explorer}/tx/${tx1.hash}`);
        await tx1.wait();
        console.log(chalk.green('✅ Sepolia OFT adapter set'));
      }
      
      // Set Arbitrum OFT if needed
      if (arbitrumOFT !== CHAINS.arbitrumSepolia.oftAdapter) {
        console.log(chalk.yellow(`\nSetting Arbitrum OFT adapter...`));
        const tx2 = await escrow.setOFTAdapter(
          CHAINS.arbitrumSepolia.endpointId,
          CHAINS.arbitrumSepolia.oftAdapter,
          CHAINS.arbitrumSepolia.name
        );
        console.log(`TX: ${CHAINS.sepolia.explorer}/tx/${tx2.hash}`);
        await tx2.wait();
        console.log(chalk.green('✅ Arbitrum OFT adapter set'));
      }
      
      // Verify configuration
      console.log(chalk.cyan('\n6. Verifying Configuration:'));
      const newSepoliaOFT = await escrow.oftAdapters(CHAINS.sepolia.endpointId);
      const newArbitrumOFT = await escrow.oftAdapters(CHAINS.arbitrumSepolia.endpointId);
      
      console.log(`Sepolia OFT: ${newSepoliaOFT === CHAINS.sepolia.oftAdapter ? '✅' : '❌'}`);
      console.log(`Arbitrum OFT: ${newArbitrumOFT === CHAINS.arbitrumSepolia.oftAdapter ? '✅' : '❌'}`);
      
      if (newSepoliaOFT === CHAINS.sepolia.oftAdapter && newArbitrumOFT === CHAINS.arbitrumSepolia.oftAdapter) {
        console.log(chalk.green('\n✅ OFT adapters configured correctly!'));
        console.log(chalk.green('You can now retry the cross-chain transfer:'));
        console.log(chalk.yellow('npm run verify:crosschain:yours'));
      }
    } else {
      console.log(chalk.red('\n❌ You are not the contract owner!'));
      console.log('Cannot update OFT adapter configuration.');
    }
    
    // Step 6: Check OFT adapter authorization
    console.log(chalk.cyan('\n7. Checking OFT Adapter Authorization:'));
    const oftAbi = ['function authorizedReleaseCallers(address) view returns (bool)'];
    
    const sepoliaOFTContract = new ethers.Contract(CHAINS.sepolia.oftAdapter, oftAbi, provider);
    const isAuthSepolia = await sepoliaOFTContract.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
    console.log(`Sepolia OFT authorizes your contract: ${isAuthSepolia ? '✅' : '❌'}`);
    
    const arbProvider = new ethers.JsonRpcProvider(CHAINS.arbitrumSepolia.rpcUrl);
    const arbitrumOFTContract = new ethers.Contract(CHAINS.arbitrumSepolia.oftAdapter, oftAbi, arbProvider);
    const isAuthArbitrum = await arbitrumOFTContract.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
    console.log(`Arbitrum OFT authorizes your contract: ${isAuthArbitrum ? '✅' : '❌'}`);
    
    if (!isAuthSepolia || !isAuthArbitrum) {
      console.log(chalk.yellow('\n⚠️  OFT authorization needed!'));
      console.log('Run: npm run oft:authorize');
    }
    
  } catch (error) {
    console.log(chalk.red('\n❌ Error:'), error.message);
  }
}

async function main() {
  console.log(chalk.blue('🚀 Escrow OFT Configuration Fixer'));
  console.log(chalk.gray('This will ensure your escrow contract has the correct OFT adapters'));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('❌ BACKEND_WALLET_PRIVATE_KEY not set'));
    process.exit(1);
  }
  
  try {
    await diagnoseAndFix();
  } catch (error) {
    console.log(chalk.red('\n❌ Failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
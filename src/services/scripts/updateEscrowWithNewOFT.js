#!/usr/bin/env node
/**
 * Update your escrow contract to use the newly deployed OFT adapter
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const NEW_SEPOLIA_OFT = '0x4087be44242E56ca502eeC8ccD7a4ff5dD03D736'; // Your newly deployed OFT

const CHAINS = {
  sepolia: {
    name: 'Sepolia',
    endpointId: 40161,
    rpcUrl: process.env.SEPOLIA_RPC_URL
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia', 
    endpointId: 40231,
    // We'll keep using the existing Arbitrum OFT since we can't deploy there yet
    existingOFT: '0xbaa46938E3110187ED6a55EE139312b28c943d00'
  }
};

async function updateEscrow() {
  console.log(chalk.blue('🔄 Updating Escrow with New OFT Adapter'));
  console.log(chalk.blue('======================================='));
  
  const provider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(`Your Escrow: ${YOUR_ESCROW_CONTRACT}`);
  console.log(`New Sepolia OFT: ${NEW_SEPOLIA_OFT} (You own this!)`);
  console.log(`Service Wallet: ${wallet.address}`);
  
  const escrowAbi = [
    'function owner() view returns (address)',
    'function oftAdapters(uint32) view returns (address)',
    'function setOFTAdapter(uint32 endpointId, address adapter, string chainName)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Check ownership
    const owner = await escrow.owner();
    console.log(`\nEscrow Owner: ${owner}`);
    console.log(`You are owner: ${owner.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log(chalk.red('❌ You are not the escrow owner!'));
      return;
    }
    
    // Check current OFT adapters
    console.log(chalk.cyan('\n📊 Current OFT Configuration:'));
    const currentSepoliaOFT = await escrow.oftAdapters(CHAINS.sepolia.endpointId);
    const currentArbitrumOFT = await escrow.oftAdapters(CHAINS.arbitrumSepolia.endpointId);
    
    console.log(`Sepolia OFT: ${currentSepoliaOFT}`);
    console.log(`Arbitrum OFT: ${currentArbitrumOFT}`);
    
    // Update Sepolia OFT to use YOUR adapter
    console.log(chalk.cyan('\n🔧 Updating to YOUR OFT Adapter:'));
    
    if (currentSepoliaOFT !== NEW_SEPOLIA_OFT) {
      console.log('Setting new Sepolia OFT adapter...');
      const tx = await escrow.setOFTAdapter(
        CHAINS.sepolia.endpointId,
        NEW_SEPOLIA_OFT,
        CHAINS.sepolia.name
      );
      console.log(`TX: https://sepolia.etherscan.io/tx/${tx.hash}`);
      await tx.wait();
      console.log(chalk.green('✅ Sepolia OFT updated to YOUR adapter!'));
    } else {
      console.log('✅ Already using your OFT adapter');
    }
    
    // Now we need to authorize your escrow on YOUR OFT
    console.log(chalk.cyan('\n🔐 Authorizing Escrow on YOUR OFT:'));
    
    const oftAbi = [
      'function setAuthorizedReleaseCaller(address caller, bool authorized)',
      'function authorizedReleaseCallers(address) view returns (bool)',
      'function owner() view returns (address)'
    ];
    
    const yourOFT = new ethers.Contract(NEW_SEPOLIA_OFT, oftAbi, wallet);
    
    // Check OFT ownership
    const oftOwner = await yourOFT.owner();
    console.log(`OFT Owner: ${oftOwner}`);
    console.log(`You own it: ${oftOwner.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
    
    // Check if escrow is authorized
    const isAuthorized = await yourOFT.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
    console.log(`Escrow authorized: ${isAuthorized ? '✅' : '❌'}`);
    
    if (!isAuthorized) {
      console.log('Authorizing your escrow contract...');
      const authTx = await yourOFT.setAuthorizedReleaseCaller(YOUR_ESCROW_CONTRACT, true);
      console.log(`TX: https://sepolia.etherscan.io/tx/${authTx.hash}`);
      await authTx.wait();
      console.log(chalk.green('✅ Escrow authorized on YOUR OFT!'));
    }
    
    console.log(chalk.green('\n✅ Configuration Complete!'));
    console.log('Your escrow now uses YOUR OFT adapter on Sepolia.');
    console.log('You have full control over the authorization.');
    
    console.log(chalk.yellow('\n⚠️  Note:'));
    console.log('Cross-chain to Arbitrum still requires:');
    console.log('1. Deploy an OFT adapter on Arbitrum (need ETH there)');
    console.log('2. Configure trusted remotes between the OFT adapters');
    console.log('3. Or use the existing Arbitrum OFT (need authorization)');
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateEscrow().catch(console.error);
}
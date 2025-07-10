#!/usr/bin/env node
/**
 * Update escrow contract to use the new standard OFT adapters
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const NEW_OFT_ADAPTERS = {
  sepolia: '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6',
  arbitrumSepolia: '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B'
};

async function updateEscrow() {
  console.log(chalk.blue('🔄 Updating Escrow with Standard OFT Adapters'));
  console.log(chalk.blue('============================================'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(`Escrow Contract: ${YOUR_ESCROW_CONTRACT}`);
  console.log(`New Sepolia OFT: ${NEW_OFT_ADAPTERS.sepolia}`);
  console.log(`New Arbitrum OFT: ${NEW_OFT_ADAPTERS.arbitrumSepolia}`);
  
  const escrowAbi = [
    'function owner() view returns (address)',
    'function oftAdapters(uint32) view returns (address)',
    'function setOFTAdapter(uint32 endpointId, address adapter, string chainName)'
  ];
  
  const escrow = new ethers.Contract(YOUR_ESCROW_CONTRACT, escrowAbi, wallet);
  
  try {
    // Check ownership
    const owner = await escrow.owner();
    console.log(`\nContract Owner: ${owner}`);
    console.log(`Your Address: ${wallet.address}`);
    console.log(`Authorized: ${owner.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log(chalk.red('❌ You are not the contract owner!'));
      return;
    }
    
    // Update Sepolia OFT
    console.log(chalk.cyan('\n📝 Updating Sepolia OFT Adapter...'));
    const tx1 = await escrow.setOFTAdapter(
      40161, // Sepolia endpoint ID
      NEW_OFT_ADAPTERS.sepolia,
      'Sepolia'
    );
    console.log(`TX: https://sepolia.etherscan.io/tx/${tx1.hash}`);
    await tx1.wait();
    console.log(chalk.green('✅ Sepolia OFT updated'));
    
    // Update Arbitrum OFT
    console.log(chalk.cyan('\n📝 Updating Arbitrum OFT Adapter...'));
    const tx2 = await escrow.setOFTAdapter(
      40231, // Arbitrum endpoint ID
      NEW_OFT_ADAPTERS.arbitrumSepolia,
      'Arbitrum Sepolia'
    );
    console.log(`TX: https://sepolia.etherscan.io/tx/${tx2.hash}`);
    await tx2.wait();
    console.log(chalk.green('✅ Arbitrum OFT updated'));
    
    // Verify configuration
    console.log(chalk.cyan('\n✅ Verifying Configuration:'));
    const sepoliaOFT = await escrow.oftAdapters(40161);
    const arbitrumOFT = await escrow.oftAdapters(40231);
    
    console.log(`Sepolia OFT: ${sepoliaOFT}`);
    console.log(`Expected: ${NEW_OFT_ADAPTERS.sepolia}`);
    console.log(`Match: ${sepoliaOFT === NEW_OFT_ADAPTERS.sepolia ? '✅' : '❌'}`);
    
    console.log(`\nArbitrum OFT: ${arbitrumOFT}`);
    console.log(`Expected: ${NEW_OFT_ADAPTERS.arbitrumSepolia}`);
    console.log(`Match: ${arbitrumOFT === NEW_OFT_ADAPTERS.arbitrumSepolia ? '✅' : '❌'}`);
    
    console.log(chalk.green('\n✅ Escrow contract updated with standard OFT adapters!'));
    console.log(chalk.yellow('\n🎯 Next Step:'));
    console.log('Run cross-chain verification: npm run verify:crosschain:yours');
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateEscrow().catch(console.error);
}
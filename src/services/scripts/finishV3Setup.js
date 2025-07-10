#!/usr/bin/env node
/**
 * Finish setting up your deployed V3 contract
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const CONTRACT_ADDRESS = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55'; // Your deployed contract
const CONTRACT_ABI = [
  'function owner() view returns (address)',
  'function setOFTAdapter(uint32 endpointId, address adapter, string memory chainName)',
  'function setConditionUpdater(address updater, bool authorized)',
  'function conditionUpdaters(address) view returns (bool)',
  'function oftAdapters(uint32) view returns (address)',
  'function chainIdToEndpointId(uint256) view returns (uint32)'
];

async function finishSetup() {
  console.log(chalk.blue('🔧 Finishing V3 Contract Setup'));
  console.log(chalk.blue('=============================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  
  console.log(`\n📍 Contract: ${CONTRACT_ADDRESS}`);
  console.log(`🔑 Your wallet: ${wallet.address}`);
  
  try {
    // Check ownership
    const owner = await contract.owner();
    console.log(`📋 Contract owner: ${owner}`);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('You are not the contract owner!');
    }
    
    console.log(chalk.green('✅ You are the owner!'));
    
    // Set OFT adapters
    console.log(chalk.cyan('\n🌉 Setting OFT Adapters...'));
    
    const adapters = [
      { eid: 40161, adapter: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4', name: 'Sepolia' },
      { eid: 40231, adapter: '0xbaa46938E3110187ED6a55EE139312b28c943d00', name: 'Arbitrum Sepolia' },
      { eid: 40267, adapter: '0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725', name: 'Polygon Amoy' }
    ];
    
    for (const config of adapters) {
      // Check if already set
      const currentAdapter = await contract.oftAdapters(config.eid);
      if (currentAdapter !== ethers.ZeroAddress && currentAdapter !== '0x0000000000000000000000000000000000000000') {
        console.log(`✅ ${config.name} adapter already set: ${currentAdapter}`);
        continue;
      }
      
      console.log(`Setting OFT adapter for ${config.name}...`);
      const tx = await contract.setOFTAdapter(config.eid, config.adapter, config.name);
      console.log(`TX: https://sepolia.etherscan.io/tx/${tx.hash}`);
      await tx.wait();
      console.log(`✅ ${config.name} adapter set`);
    }
    
    // Add yourself as condition updater
    console.log(chalk.cyan('\n🔐 Setting Condition Updater...'));
    
    const isUpdater = await contract.conditionUpdaters(wallet.address);
    if (isUpdater) {
      console.log('✅ You are already a condition updater');
    } else {
      console.log('Adding you as condition updater...');
      const tx = await contract.setConditionUpdater(wallet.address, true);
      console.log(`TX: https://sepolia.etherscan.io/tx/${tx.hash}`);
      await tx.wait();
      console.log('✅ You are now a condition updater');
    }
    
    // Verify configuration
    console.log(chalk.cyan('\n🔍 Verifying Configuration...'));
    
    // Check chain mappings
    const chainChecks = [
      { chainId: 11155111, expectedEid: 40161, name: 'Sepolia' },
      { chainId: 421614, expectedEid: 40231, name: 'Arbitrum Sepolia' },
      { chainId: 80002, expectedEid: 40267, name: 'Polygon Amoy' }
    ];
    
    for (const check of chainChecks) {
      const eid = await contract.chainIdToEndpointId(check.chainId);
      console.log(`${check.name}: ${eid === check.expectedEid ? '✅' : '❌'} (${eid})`);
    }
    
    console.log(chalk.green('\n✅ Contract fully configured!'));
    console.log(chalk.cyan('\n📝 Your Contract Details:'));
    console.log(`Address: ${CONTRACT_ADDRESS}`);
    console.log(`Owner: ${wallet.address}`);
    console.log(`Network: Sepolia`);
    console.log(`Explorer: https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`);
    
    console.log(chalk.cyan('\n✨ Next Steps:'));
    console.log('1. Update escrowServiceV3.js to use your contract address');
    console.log('2. Run: npm run verify:crosschain');
    console.log('\nOr manually update the Sepolia config in escrowServiceV3.js:');
    console.log(chalk.gray(`contractAddress: '${CONTRACT_ADDRESS}',`));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  finishSetup().catch(console.error);
}
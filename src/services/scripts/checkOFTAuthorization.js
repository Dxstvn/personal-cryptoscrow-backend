#!/usr/bin/env node
/**
 * Check OFT adapter authorization for your contract
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const EXISTING_V3_CONTRACT = '0xBA10d8d3A09439eA5984F545C925d61958fa14E9'; // The original V3 on Sepolia

const OFT_ADAPTERS = {
  'Sepolia': {
    address: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4',
    chainId: 11155111
  },
  'Arbitrum Sepolia': {
    address: '0xbaa46938E3110187ED6a55EE139312b28c943d00',
    chainId: 421614
  },
  'Polygon Amoy': {
    address: '0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725',
    chainId: 80002
  }
};

async function checkAuthorization() {
  console.log(chalk.blue('🔍 Checking OFT Adapter Authorization'));
  console.log(chalk.blue('====================================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Load the actual OFT adapter ABI
  const oftAbi = [
    'function owner() view returns (address)',
    'function escrowContracts(address) view returns (bool)',
    'function authorizeEscrowContract(address escrow, bool authorized)',
    'event EscrowContractAuthorized(address indexed escrow, bool authorized)'
  ];
  
  for (const [name, config] of Object.entries(OFT_ADAPTERS)) {
    if (config.chainId !== 11155111) continue; // Only check Sepolia for now
    
    console.log(chalk.cyan(`\n📍 ${name} OFT Adapter`));
    console.log(`Address: ${config.address}`);
    
    try {
      const oft = new ethers.Contract(config.address, oftAbi, provider);
      
      // Check owner
      const owner = await oft.owner();
      console.log(`Owner: ${owner}`);
      
      // Check if existing V3 is authorized
      const existingAuth = await oft.escrowContracts(EXISTING_V3_CONTRACT);
      console.log(`Original V3 authorized: ${existingAuth ? '✅' : '❌'} (${EXISTING_V3_CONTRACT})`);
      
      // Check if your contract is authorized
      const yourAuth = await oft.escrowContracts(YOUR_CONTRACT);
      console.log(`Your contract authorized: ${yourAuth ? '✅' : '❌'} (${YOUR_CONTRACT})`);
      
      if (!yourAuth) {
        console.log(chalk.yellow('\n⚠️  Your contract is NOT authorized!'));
        console.log('This is why the release is failing.');
        console.log(`\nThe OFT adapter owner (${owner}) needs to run:`);
        console.log(chalk.gray(`await oftAdapter.authorizeEscrowContract("${YOUR_CONTRACT}", true)`));
        
        // Check if we're the owner
        const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
        if (owner.toLowerCase() === wallet.address.toLowerCase()) {
          console.log(chalk.green('\n✅ Good news! You ARE the OFT adapter owner!'));
          console.log('Would you like to authorize your contract? (This will cost gas)');
          // We could add authorization here if you want
        } else {
          console.log(chalk.red('\n❌ You are NOT the OFT adapter owner'));
          console.log(`Owner is: ${owner}`);
        }
      }
      
    } catch (error) {
      console.log(chalk.red(`Error: ${error.message}`));
    }
  }
  
  console.log(chalk.cyan('\n📝 Summary:'));
  console.log('The OFT adapters are separate contracts that handle cross-chain transfers.');
  console.log('They maintain a whitelist of authorized escrow contracts.');
  console.log('Your newly deployed contract needs to be added to this whitelist.');
  
  console.log(chalk.cyan('\n💡 Solutions:'));
  console.log('1. Contact the OFT adapter owner to authorize your contract');
  console.log('2. Deploy your own OFT adapters (more complex)');
  console.log('3. Use the existing V3 contract (where you lack condition updater auth)');
  console.log('4. Test same-chain operations only (no cross-chain)');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkAuthorization().catch(console.error);
}
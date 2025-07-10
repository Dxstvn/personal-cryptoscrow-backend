#!/usr/bin/env node
/**
 * Generate authorization request for current OFT adapter owner
 * Option 1 Alternative: Quick fix for immediate testing
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';
const OFT_ADAPTER_SEPOLIA = '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4';
const OFT_ADAPTER_ARBITRUM = '0xbaa46938E3110187ED6a55EE139312b28c943d00';
const OFT_OWNER = '0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D';

async function generateAuthorizationRequest() {
  console.log(chalk.blue('🔐 OFT Authorization Request Generator'));
  console.log(chalk.blue('====================================='));
  
  console.log(chalk.cyan('\n📋 Current Situation:'));
  console.log(`Your Escrow Contract: ${chalk.yellow(YOUR_ESCROW_CONTRACT)}`);
  console.log(`OFT Adapter Owner: ${chalk.yellow(OFT_OWNER)}`);
  console.log(`Status: ${chalk.red('NOT AUTHORIZED')}`);
  
  console.log(chalk.cyan('\n📝 Authorization Commands Needed:'));
  console.log('\nThe OFT adapter owner needs to execute these commands:\n');
  
  // Generate Ethers.js commands
  console.log(chalk.green('// Using ethers.js:'));
  console.log(`const oftAdapterSepolia = new ethers.Contract(`);
  console.log(`  '${OFT_ADAPTER_SEPOLIA}',`);
  console.log(`  ['function setAuthorizedReleaseCaller(address caller, bool authorized)'],`);
  console.log(`  signer`);
  console.log(`);\n`);
  console.log(`const oftAdapterArbitrum = new ethers.Contract(`);
  console.log(`  '${OFT_ADAPTER_ARBITRUM}',`);
  console.log(`  ['function setAuthorizedReleaseCaller(address caller, bool authorized)'],`);
  console.log(`  signer`);
  console.log(`);\n`);
  console.log(chalk.yellow(`// Authorize on Sepolia`));
  console.log(`await oftAdapterSepolia.setAuthorizedReleaseCaller(`);
  console.log(`  '${YOUR_ESCROW_CONTRACT}',`);
  console.log(`  true`);
  console.log(`);\n`);
  console.log(chalk.yellow(`// Authorize on Arbitrum Sepolia`));
  console.log(`await oftAdapterArbitrum.setAuthorizedReleaseCaller(`);
  console.log(`  '${YOUR_ESCROW_CONTRACT}',`);
  console.log(`  true`);
  console.log(`);\n`);
  
  // Generate direct Etherscan commands
  console.log(chalk.green('// Or via Etherscan Write Contract:'));
  console.log('\n1. Sepolia OFT Adapter:');
  console.log(`   ${chalk.blue('https://sepolia.etherscan.io/address/' + OFT_ADAPTER_SEPOLIA + '#writeContract')}`);
  console.log(`   Function: setAuthorizedReleaseCaller`);
  console.log(`   caller: ${YOUR_ESCROW_CONTRACT}`);
  console.log(`   authorized: true`);
  
  console.log('\n2. Arbitrum Sepolia OFT Adapter:');
  console.log(`   ${chalk.blue('https://sepolia.arbiscan.io/address/' + OFT_ADAPTER_ARBITRUM + '#writeContract')}`);
  console.log(`   Function: setAuthorizedReleaseCaller`);
  console.log(`   caller: ${YOUR_ESCROW_CONTRACT}`);
  console.log(`   authorized: true`);
  
  // Check current status
  console.log(chalk.cyan('\n🔍 Checking Current Authorization Status...'));
  
  try {
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const oftAbi = [
      'function authorizedReleaseCallers(address) view returns (bool)',
      'function owner() view returns (address)'
    ];
    
    const oftSepolia = new ethers.Contract(OFT_ADAPTER_SEPOLIA, oftAbi, provider);
    
    const isAuthorized = await oftSepolia.authorizedReleaseCallers(YOUR_ESCROW_CONTRACT);
    const currentOwner = await oftSepolia.owner();
    
    console.log(`\nSepolia OFT Status:`);
    console.log(`Owner: ${currentOwner === OFT_OWNER ? chalk.green('✓') : chalk.red('✗')} ${currentOwner}`);
    console.log(`Your Contract Authorized: ${isAuthorized ? chalk.green('✓ YES') : chalk.red('✗ NO')}`);
    
    if (isAuthorized) {
      console.log(chalk.green('\n🎉 Great news! Your contract is already authorized on Sepolia!'));
    }
    
  } catch (error) {
    console.log(chalk.yellow('\nCould not verify current status:'), error.message);
  }
  
  // Message template
  console.log(chalk.cyan('\n📧 Message Template for OFT Owner:'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(`
Hello,

I need authorization for my escrow contract on your OFT adapters to enable cross-chain functionality.

Escrow Contract: ${YOUR_ESCROW_CONTRACT}

Please execute these commands:

Sepolia:
await oftAdapterSepolia.setAuthorizedReleaseCaller('${YOUR_ESCROW_CONTRACT}', true)

Arbitrum Sepolia:  
await oftAdapterArbitrum.setAuthorizedReleaseCaller('${YOUR_ESCROW_CONTRACT}', true)

This will allow my escrow contract to perform cross-chain token transfers through your OFT adapters.

Thank you!
`);
  console.log(chalk.gray('─'.repeat(60)));
  
  console.log(chalk.yellow('\n⏳ While Waiting for Authorization:'));
  console.log('1. You can test same-chain operations (no OFT needed)');
  console.log('2. Prepare for production by deploying your own OFT adapters');
  console.log('3. Run this script again to check authorization status');
  
  console.log(chalk.cyan('\n📌 Next Steps:'));
  console.log('1. Send the authorization request to the OFT owner');
  console.log('2. Once authorized, run: ' + chalk.green('npm run verify:crosschain:yours'));
  console.log('3. For production, deploy your own OFT adapters');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateAuthorizationRequest().catch(console.error);
}
#!/usr/bin/env node
/**
 * Fix Composer authorization on Arbitrum
 */
const hre = require('hardhat');
const chalk = require('chalk');

const ARBITRUM_COMPOSER = '0x7ffd15F8C2696d76D19145AdB856B118e087D6DA';
const ARBITRUM_OFT = '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B';

async function main() {
  console.log(chalk.blue('🔧 Fixing Composer Authorization'));
  console.log(chalk.blue('=============================='));
  
  const [signer] = await hre.ethers.getSigners();
  console.log(`\nUsing wallet: ${signer.address}`);
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  if (chainId !== 421614) {
    console.log(chalk.red('This script must be run on Arbitrum Sepolia'));
    return;
  }
  
  const composerAbi = [
    'function setOFTAdapterAuthorization(address oftAdapter, bool authorized)',
    'function authorizedOFTAdapters(address) view returns (bool)',
    'function owner() view returns (address)'
  ];
  
  const composer = new hre.ethers.Contract(ARBITRUM_COMPOSER, composerAbi, signer);
  
  // Check ownership
  const owner = await composer.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log(chalk.red('❌ You are not the owner of this composer'));
    console.log(`Owner: ${owner}`);
    console.log(`You: ${signer.address}`);
    return;
  }
  
  // Check current authorization
  const isAuthorized = await composer.authorizedOFTAdapters(ARBITRUM_OFT);
  console.log(`\nCurrent authorization: ${isAuthorized}`);
  
  if (isAuthorized) {
    console.log(chalk.green('✅ OFT adapter already authorized'));
    return;
  }
  
  // Authorize OFT adapter
  console.log(`\nAuthorizing OFT adapter: ${ARBITRUM_OFT}`);
  const tx = await composer.setOFTAdapterAuthorization(ARBITRUM_OFT, true);
  console.log(`Transaction: ${tx.hash}`);
  await tx.wait();
  
  // Verify
  const newAuth = await composer.authorizedOFTAdapters(ARBITRUM_OFT);
  console.log(chalk.green(`✅ OFT adapter authorized: ${newAuth}`));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
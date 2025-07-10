#!/usr/bin/env node
/**
 * Setup authorization for fixed escrow
 */
const hre = require('hardhat');
const chalk = require('chalk');

const ESCROWS = {
  sepolia: '0xFe91302F02FD8583170F8654a4Ad7954F4195cbd',
  arbitrum: '0x51383412506994Bc8C0cA59CD9D6be0167996E5D'
};

const SERVICE_WALLET = '0x2223F51659fAcC662504dcEbD4735886285ABC96';

async function setupAuth(network, address) {
  console.log(chalk.blue(`\n📍 Setting up auth on ${network}...`));
  
  const [deployer] = await hre.ethers.getSigners();
  
  const escrowAbi = [
    'function setConditionUpdater(address updater, bool authorized)',
    'function conditionUpdaters(address) view returns (bool)',
    'function owner() view returns (address)'
  ];
  
  const escrow = new hre.ethers.Contract(address, escrowAbi, deployer);
  
  // Check ownership
  const owner = await escrow.owner();
  console.log(`Contract owner: ${owner}`);
  console.log(`Deployer: ${deployer.address}`);
  
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(chalk.red('❌ You are not the owner'));
    return;
  }
  
  // Check if already authorized
  const isAuthorized = await escrow.conditionUpdaters(SERVICE_WALLET);
  if (isAuthorized) {
    console.log(chalk.green('✅ Service wallet already authorized'));
    return;
  }
  
  // Add condition updater
  console.log(`Adding condition updater: ${SERVICE_WALLET}`);
  const tx = await escrow.setConditionUpdater(SERVICE_WALLET, true);
  await tx.wait();
  
  // Verify
  const newAuth = await escrow.conditionUpdaters(SERVICE_WALLET);
  console.log(chalk.green(`✅ Service wallet authorized: ${newAuth}`));
}

async function main() {
  console.log(chalk.blue('🔑 Setting Up Fixed Escrow Authorization'));
  console.log(chalk.blue('======================================'));
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  if (chainId === 11155111) {
    await setupAuth('sepolia', ESCROWS.sepolia);
  } else if (chainId === 421614) {
    await setupAuth('arbitrum', ESCROWS.arbitrum);
  } else {
    console.log(chalk.red('Unsupported network'));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Deploy the fixed escrow contract
 */
const hre = require('hardhat');
const chalk = require('chalk');

const CONFIG = {
  sepolia: {
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    uniswapRouter: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008',
    oftAdapter: '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE',
    endpointId: 40161,
    chainId: 11155111
  },
  arbitrum: {
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    uniswapRouter: '0x101F443B4d1b059569D643917553c771E1b9663E',
    oftAdapter: '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B',
    endpointId: 40231,
    chainId: 421614
  }
};

async function deployOnChain(network) {
  console.log(chalk.blue(`\n📍 Deploying on ${network}...`));
  
  const [deployer] = await hre.ethers.getSigners();
  const config = CONFIG[network];
  const serviceWallet = '0x2223F51659fAcC662504dcEbD4735886285ABC96'; // BACKEND wallet
  
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Service Wallet: ${serviceWallet}`);
  
  // Deploy fixed escrow
  const UniversalEscrowServiceV3Fixed = await hre.ethers.getContractFactory('UniversalEscrowServiceV3Fixed');
  const escrow = await UniversalEscrowServiceV3Fixed.deploy(
    serviceWallet,
    config.weth,
    config.uniswapRouter
  );
  
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(chalk.green(`✅ Fixed Escrow deployed: ${escrowAddress}`));
  
  // Configure escrow
  console.log(chalk.cyan('\n⚙️  Configuring escrow...'));
  
  // Set OFT adapter for source chain
  await escrow.setOFTAdapter(config.endpointId, config.oftAdapter, network);
  console.log(`├─ OFT adapter set for ${network}`);
  
  // Map chain IDs to endpoint IDs
  await escrow.setChainMapping(config.chainId, config.endpointId);
  console.log(`└─ Chain mapping set: ${config.chainId} -> ${config.endpointId}`);
  
  return escrowAddress;
}

async function main() {
  console.log(chalk.blue('🚀 Deploying Fixed Escrow Contract'));
  console.log(chalk.blue('================================'));
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let networkName;
  if (chainId === 11155111) {
    networkName = 'sepolia';
  } else if (chainId === 421614) {
    networkName = 'arbitrum';
  } else {
    console.log(chalk.red('Unsupported network'));
    return;
  }
  
  const escrowAddress = await deployOnChain(networkName);
  
  console.log(chalk.green('\n✅ Deployment complete!'));
  console.log(chalk.yellow('\n📋 Deployment Summary:'));
  console.log(`├─ Network: ${networkName}`);
  console.log(`└─ Fixed Escrow: ${escrowAddress}`);
  
  console.log(chalk.yellow('\n⚠️  Next Steps:'));
  console.log('1. Deploy on the other chain');
  console.log('2. Configure OFT adapters and chain mappings');
  console.log('3. Set composer addresses if using composer functionality');
  console.log('4. Update .env with new contract addresses');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
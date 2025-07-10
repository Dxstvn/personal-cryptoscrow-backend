#!/usr/bin/env node
/**
 * Deploy and configure the Universal Swap Composer system
 */
import hre from 'hardhat';
import chalk from 'chalk';
import { formatEther } from 'ethers';

const CONFIGS = {
  sepolia: {
    chainId: 11155111,
    endpointId: 40161,
    lzEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    uniswapRouter: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008',
    oftAdapter: '0x7612FC49B82D42623468Bb966E0D59a7d35ea8b9'
  },
  arbitrum: {
    chainId: 421614,
    endpointId: 40231,
    lzEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    uniswapRouter: '0x101F443B4d1b059569D643917553c771E1b9663E',
    oftAdapter: '0x5da4745a766d5eabd30ffbdc32b3b953d399dd1f'
  }
};

async function main() {
  console.log(chalk.blue('🚀 Deploying Composer System'));
  console.log(chalk.blue('===========================\n'));
  
  // Get signer
  const [deployer] = await hre.ethers.getSigners();
  console.log(chalk.yellow(`Deployer: ${deployer.address}`));
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(chalk.yellow(`Balance: ${formatEther(balance)} ETH\n`));
  
  // Get current network
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let currentConfig, remoteConfig;
  if (chainId === 11155111) {
    currentConfig = CONFIGS.sepolia;
    remoteConfig = CONFIGS.arbitrum;
    console.log(chalk.cyan('📍 Current Chain: Sepolia'));
    console.log(chalk.cyan('🎯 Remote Chain: Arbitrum Sepolia\n'));
  } else if (chainId === 421614) {
    currentConfig = CONFIGS.arbitrum;
    remoteConfig = CONFIGS.sepolia;
    console.log(chalk.cyan('📍 Current Chain: Arbitrum Sepolia'));
    console.log(chalk.cyan('🎯 Remote Chain: Sepolia\n'));
  } else {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  
  // Deploy Composer
  console.log(chalk.yellow('1️⃣  Deploying UniversalSwapComposer...'));
  
  const Composer = await hre.ethers.getContractFactory('UniversalSwapComposer');
  const composer = await Composer.deploy(
    currentConfig.lzEndpoint,
    deployer.address,  // Admin/delegate
    currentConfig.weth,
    currentConfig.uniswapRouter
  );
  
  await composer.waitForDeployment();
  const composerAddress = await composer.getAddress();
  
  console.log(chalk.green(`✅ Composer deployed at: ${composerAddress}`));
  
  // Configure Composer
  console.log(chalk.yellow('\n2️⃣  Configuring Composer...'));
  
  // Authorize OFT adapter
  console.log('├─ Authorizing OFT adapter...');
  const authTx = await composer.setOFTAdapterAuthorization(currentConfig.oftAdapter, true);
  await authTx.wait();
  console.log(chalk.green('├─ ✅ OFT adapter authorized'));
  
  // Set slippage
  console.log('├─ Setting max slippage to 5%...');
  const slippageTx = await composer.setMaxSlippageBps(500); // 5%
  await slippageTx.wait();
  console.log(chalk.green('└─ ✅ Slippage configured'));
  
  // Deploy Escrow with Composer
  console.log(chalk.yellow('\n3️⃣  Deploying UniversalEscrowServiceV3WithComposer...'));
  
  const EscrowWithComposer = await hre.ethers.getContractFactory('UniversalEscrowServiceV3WithComposer');
  const escrow = await EscrowWithComposer.deploy(
    deployer.address,  // Service wallet (for testing)
    currentConfig.weth,
    currentConfig.uniswapRouter
  );
  
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  
  console.log(chalk.green(`✅ Escrow deployed at: ${escrowAddress}`));
  
  // Configure Escrow
  console.log(chalk.yellow('\n4️⃣  Configuring Escrow...'));
  
  // Set OFT adapter
  console.log('├─ Setting OFT adapter...');
  const setOftTx = await escrow.setOFTAdapter(
    currentConfig.endpointId,
    currentConfig.oftAdapter,
    chainId === 11155111 ? 'Sepolia' : 'Arbitrum'
  );
  await setOftTx.wait();
  console.log(chalk.green('├─ ✅ OFT adapter configured'));
  
  // Set backend wallet as condition updater
  const BACKEND_WALLET = '0x2223F51659fAcC662504dcEbD4735886285ABC96';
  console.log(`├─ Adding condition updater: ${BACKEND_WALLET}...`);
  const updaterTx = await escrow.setConditionUpdater(BACKEND_WALLET, true);
  await updaterTx.wait();
  console.log(chalk.green('└─ ✅ Condition updater added'));
  
  // Summary
  console.log(chalk.blue('\n📋 Deployment Summary'));
  console.log(chalk.blue('===================='));
  console.log(`Chain: ${chainId === 11155111 ? 'Sepolia' : 'Arbitrum Sepolia'}`);
  console.log(`Composer: ${composerAddress}`);
  console.log(`Escrow: ${escrowAddress}`);
  console.log(`OFT Adapter: ${currentConfig.oftAdapter}`);
  
  console.log(chalk.yellow('\n⚠️  Next Steps:'));
  console.log('1. Deploy on the other chain');
  console.log('2. Update both escrows with remote composer addresses:');
  console.log(`   await escrow.setSwapComposerWithValidation(${remoteConfig.endpointId}, REMOTE_COMPOSER, "${chainId === 11155111 ? 'Arbitrum' : 'Sepolia'}")`);
  console.log('3. Run end-to-end tests');
  
  // Save deployment info
  const deployment = {
    chain: chainId === 11155111 ? 'sepolia' : 'arbitrum',
    chainId,
    composer: composerAddress,
    escrow: escrowAddress,
    oftAdapter: currentConfig.oftAdapter,
    timestamp: new Date().toISOString()
  };
  
  console.log(chalk.cyan('\n📄 Deployment JSON:'));
  console.log(JSON.stringify(deployment, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
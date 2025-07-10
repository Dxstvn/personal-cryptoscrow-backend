#!/usr/bin/env node
/**
 * Deploy UniversalEscrowServiceV3Stargate contracts
 */
const hre = require('hardhat');
const chalk = require('chalk');

// Testnet configuration
const CHAINS = {
  sepolia: {
    chainId: 11155111,
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    stargateRouter: '0x2836045A50744FB50D3d04a9C8D18aD7B5012102',
    stargateRouterETH: '0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D',
    stargateChainId: 10161,
    layerZeroEndpointId: 40161
  },
  arbitrum: {
    chainId: 421614,
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    stargateRouter: '0x2a4C2F5ffB0E0F2dcB3f9EBBd442B8F77ECDB9Cc',
    stargateRouterETH: '0x771A4f8a880b499A40c8fF53c7925798E0f2E594',
    stargateChainId: 10231,
    layerZeroEndpointId: 40231
  }
};

async function deployContract(chainName, config) {
  console.log(chalk.blue(`\n🚀 Deploying to ${chainName}...`));
  
  const [deployer] = await hre.ethers.getSigners();
  const serviceWallet = process.env.BACKEND_WALLET_ADDRESS || deployer.address;
  
  console.log('├─ Deployer:', deployer.address);
  console.log('├─ Service Wallet:', serviceWallet);
  console.log('├─ WETH:', config.weth);
  console.log('├─ Uniswap Router:', config.uniswapRouter);
  console.log('├─ Stargate Router:', config.stargateRouter);
  console.log('├─ Stargate RouterETH:', config.stargateRouterETH);
  
  // Deploy the contract
  const EscrowContract = await hre.ethers.getContractFactory('UniversalEscrowServiceV3Stargate');
  const escrow = await EscrowContract.deploy(
    serviceWallet,
    config.weth,
    config.uniswapRouter
  );
  
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  
  console.log(chalk.green('✅ Contract deployed at:'), address);
  
  return { address, contract: escrow };
}

async function configureContract(contract, chainName, config, otherChains) {
  console.log(chalk.yellow(`\n⚙️  Configuring ${chainName} contract...`));
  
  // Set Stargate configuration for current chain
  console.log('Setting Stargate routers...');
  const tx1 = await contract.setStargateRouter(
    config.chainId,
    config.stargateRouter,
    config.stargateRouterETH
  );
  await tx1.wait();
  
  const tx2 = await contract.setStargateChainId(config.chainId, config.stargateChainId);
  await tx2.wait();
  
  console.log('✅ Stargate configuration set');
  
  // Configure cross-chain routing for other chains
  for (const [otherChainName, otherConfig] of Object.entries(otherChains)) {
    if (otherChainName === chainName) continue;
    
    console.log(`Setting cross-chain mode for ${otherChainName}...`);
    
    // Set cross-chain mode to STARGATE (mode = 2)
    const tx3 = await contract.setCrossChainMode(otherConfig.chainId, 2);
    await tx3.wait();
    
    // Set Stargate configuration for target chain
    const tx4 = await contract.setStargateRouter(
      otherConfig.chainId,
      otherConfig.stargateRouter,
      otherConfig.stargateRouterETH
    );
    await tx4.wait();
    
    const tx5 = await contract.setStargateChainId(otherConfig.chainId, otherConfig.stargateChainId);
    await tx5.wait();
    
    console.log(`✅ ${otherChainName} routing configured`);
  }
  
  // Set LayerZero endpoint mappings (for fallback OFT mode if needed)
  for (const [otherChainName, otherConfig] of Object.entries(otherChains)) {
    console.log(`Setting LayerZero endpoint for ${otherChainName}...`);
    
    const tx6 = await contract.setChainIdToEndpointId(otherConfig.chainId, otherConfig.layerZeroEndpointId);
    await tx6.wait();
    
    const tx7 = await contract.setEndpointIdToChainId(otherConfig.layerZeroEndpointId, otherConfig.chainId);
    await tx7.wait();
    
    console.log(`✅ ${otherChainName} LayerZero mapping set`);
  }
}

async function main() {
  console.log(chalk.blue('🌟 Deploying UniversalEscrowServiceV3Stargate'));
  console.log(chalk.blue('================================================'));
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  // Determine current chain
  let currentChain, currentConfig;
  for (const [name, config] of Object.entries(CHAINS)) {
    if (config.chainId === chainId) {
      currentChain = name;
      currentConfig = config;
      break;
    }
  }
  
  if (!currentChain) {
    console.log(chalk.red('❌ Unsupported network:', chainId));
    return;
  }
  
  console.log(chalk.cyan(`\n📍 Detected network: ${currentChain} (${chainId})`));
  
  // Deploy contract
  const { address, contract } = await deployContract(currentChain, currentConfig);
  
  // Configure contract
  await configureContract(contract, currentChain, currentConfig, CHAINS);
  
  console.log(chalk.green(`\n✅ ${currentChain} deployment complete!`));
  console.log(chalk.cyan('📋 Contract Address:'), address);
  
  // Generate summary
  console.log(chalk.yellow('\n📊 Configuration Summary:'));
  console.log('├─ Stargate Integration: ✅ Enabled');
  console.log('├─ Same-chain transfers: ✅ Direct + Uniswap swaps');
  console.log('├─ Cross-chain transfers: ✅ Stargate (primary)');
  console.log('├─ LayerZero OFT fallback: ✅ Available');
  console.log('└─ Supported chains:', Object.keys(CHAINS).join(', '));
  
  console.log(chalk.yellow('\n🔗 Cross-chain Routing:'));
  for (const [chainName, config] of Object.entries(CHAINS)) {
    if (chainName !== currentChain) {
      console.log(`├─ To ${chainName}: Stargate (Chain ID: ${config.stargateChainId})`);
    }
  }
  
  console.log(chalk.blue('\n📝 Next Steps:'));
  console.log('1. Deploy this script on other supported chains');
  console.log('2. Test same-chain functionality (direct + swap)');
  console.log('3. Test cross-chain functionality with Stargate');
  console.log('4. Compare performance with previous OFT implementation');
  
  // Save deployment info
  const deploymentInfo = {
    network: currentChain,
    chainId: chainId,
    contractAddress: address,
    serviceWallet: currentConfig.serviceWallet || process.env.BACKEND_WALLET_ADDRESS,
    stargateRouter: currentConfig.stargateRouter,
    stargateRouterETH: currentConfig.stargateRouterETH,
    stargateChainId: currentConfig.stargateChainId,
    features: {
      sameChainDirect: true,
      sameChainSwap: true,
      crossChainStargate: true,
      crossChainOFTFallback: true
    },
    deployedAt: new Date().toISOString()
  };
  
  console.log(chalk.gray('\n💾 Deployment Info:'));
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Deployment failed:'), error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Deploy updated Stargate Enhanced contracts with hardcoded testnet fees
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🚀 Deploy Updated Stargate Enhanced Contracts'));
  console.log('============================================\n');
  
  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let networkName;
  if (chainId === 11155111) {
    networkName = 'Sepolia';
  } else if (chainId === 421614) {
    networkName = 'Arbitrum Sepolia';
  } else {
    throw new Error('Unsupported network');
  }
  
  console.log('📍 Network:', networkName);
  console.log('👤 Deployer:', signer.address);
  
  const balance = await signer.provider.getBalance(signer.address);
  console.log('💰 Balance:', hre.ethers.formatEther(balance), 'ETH\n');
  
  // Deploy contract
  console.log(chalk.blue('1️⃣ Deploying UniversalEscrowServiceV3StargateEnhanced...'));
  
  const serviceWallet = process.env.SERVICE_WALLET_ADDRESS || signer.address;
  const config = {
    11155111: { // Sepolia
      weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E'
    },
    421614: { // Arbitrum Sepolia
      weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
      uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
    }
  };
  
  const deployConfig = config[chainId];
  
  const Enhanced = await hre.ethers.getContractFactory('UniversalEscrowServiceV3StargateEnhanced');
  const enhanced = await Enhanced.deploy(
    serviceWallet,
    deployConfig.weth,
    deployConfig.uniswapRouter
  );
  await enhanced.waitForDeployment();
  
  console.log('✅ Enhanced contract deployed to:', enhanced.target);
  console.log('📝 Note: This version includes hardcoded testnet fees for Stargate\n');
  
  // Initialize configuration
  console.log(chalk.blue('2️⃣ Initializing contract configuration...'));
  
  // Extended configuration
  const addresses = {
    11155111: { // Sepolia
      weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
      uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
      layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
      stargateRouter: '0xF7ec0f66C101E8aa221c122Ae5B1A50DDf99a049',
      stargateRouterETH: '0xaF732fF97b8e29bDeB0270e75E0281bA7b5501Ce'
    },
    421614: { // Arbitrum Sepolia
      weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
      usdc: '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773',
      uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
      stargateRouter: '0x0C5f934321cc7377bb26e7184F50b97170EA1563',
      stargateRouterETH: '0x05B7337080A8B387772411212FAbA5F4d5DCc623'
    }
  };
  
  const extendedConfig = addresses[chainId];
  
  // Set basic parameters
  await (await enhanced.setWETH(extendedConfig.weth)).wait();
  await (await enhanced.setUniswapRouter(extendedConfig.uniswapRouter)).wait();
  await (await enhanced.setLayerZeroEndpoint(extendedConfig.layerZeroEndpoint)).wait();
  console.log('✅ Basic configuration set');
  
  // Set Stargate routers
  const targetChainId = chainId === 11155111 ? 421614 : 11155111;
  
  // Source chain routers
  await (await enhanced.setStargateRouters(chainId, extendedConfig.stargateRouter, extendedConfig.stargateRouterETH)).wait();
  
  // Target chain routers
  const targetConfig = addresses[targetChainId];
  await (await enhanced.setStargateRouters(targetChainId, targetConfig.stargateRouter, targetConfig.stargateRouterETH)).wait();
  
  console.log('✅ Stargate routers configured');
  
  // Set Stargate chain IDs
  const stargateChainIds = {
    11155111: 10161,  // Sepolia
    421614: 10231     // Arbitrum Sepolia
  };
  
  await (await enhanced.setStargateChainId(chainId, stargateChainIds[chainId])).wait();
  await (await enhanced.setStargateChainId(targetChainId, stargateChainIds[targetChainId])).wait();
  console.log('✅ Stargate chain IDs set');
  
  // Configure tokens
  console.log(chalk.blue('\n3️⃣ Configuring Stargate tokens...'));
  
  // ETH (native) configuration
  await (await enhanced.configureStargateToken(chainId, hre.ethers.ZeroAddress, 13, true)).wait();
  await (await enhanced.configureStargateToken(targetChainId, hre.ethers.ZeroAddress, 13, true)).wait();
  
  // USDC configuration
  await (await enhanced.configureStargateToken(chainId, extendedConfig.usdc, 1, false)).wait();
  await (await enhanced.configureStargateToken(targetChainId, targetConfig.usdc, 1, false)).wait();
  
  console.log('✅ Token configurations complete');
  
  // Enable cross-chain mode
  await (await enhanced.setCrossChainMode(targetChainId, 2)).wait(); // STARGATE mode
  console.log('✅ Cross-chain mode set to STARGATE');
  
  // Final summary
  console.log(chalk.green('\n✅ Deployment Complete!'));
  console.log('=====================================');
  console.log('📋 Contract:', enhanced.target);
  console.log('🌐 Network:', networkName);
  console.log('🔧 Features:');
  console.log('  ├─ Hardcoded testnet fees (0.002/0.001 ETH)');
  console.log('  ├─ Stargate integration for ETH/USDC');
  console.log('  ├─ Uniswap V2 for token swaps');
  console.log('  └─ LayerZero OFT fallback support\n');
  
  // Update environment variable suggestion
  const envKey = chainId === 11155111 
    ? 'SEPOLIA_STARGATE_ENHANCED_CONTRACT' 
    : 'ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT';
    
  console.log(chalk.yellow('📝 Update your .env file:'));
  console.log(`${envKey}=${enhanced.target}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Deployment failed:'), error);
    process.exit(1);
  });
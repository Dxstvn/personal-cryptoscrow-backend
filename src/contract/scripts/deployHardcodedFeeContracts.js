#!/usr/bin/env node
/**
 * Deploy Stargate Enhanced contracts with hardcoded testnet fees
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🚀 Deploy Hardcoded Fee Contracts'));
  console.log('=================================\n');
  
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
  
  // Deploy contract with constructor parameters
  console.log(chalk.blue('Deploying Contract...'));
  
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
  
  const Enhanced = await hre.ethers.getContractFactory('UniversalEscrowServiceV3StargateEnhanced');
  const enhanced = await Enhanced.deploy(
    serviceWallet,
    config[chainId].weth,
    config[chainId].uniswapRouter
  );
  await enhanced.waitForDeployment();
  
  console.log('✅ Contract deployed to:', enhanced.target);
  
  // Update Stargate router addresses to match our documentation
  console.log(chalk.blue('\nUpdating Stargate Configuration...'));
  
  const targetChainId = chainId === 11155111 ? 421614 : 11155111;
  
  // Updated router addresses from Stargate testnet docs
  const stargateRouters = {
    11155111: {
      router: '0xF7ec0f66C101E8aa221c122Ae5B1A50DDf99a049',
      routerETH: '0xaF732fF97b8e29bDeB0270e75E0281bA7b5501Ce'
    },
    421614: {
      router: '0x0C5f934321cc7377bb26e7184F50b97170EA1563', 
      routerETH: '0x05B7337080A8B387772411212FAbA5F4d5DCc623'
    }
  };
  
  // Set routers for both chains
  await (await enhanced.setStargateRouters(
    chainId, 
    stargateRouters[chainId].router, 
    stargateRouters[chainId].routerETH
  )).wait();
  console.log('✅ Source chain routers updated');
  
  await (await enhanced.setStargateRouters(
    targetChainId,
    stargateRouters[targetChainId].router,
    stargateRouters[targetChainId].routerETH
  )).wait();
  console.log('✅ Target chain routers updated');
  
  // Enable cross-chain mode
  await (await enhanced.setCrossChainMode(targetChainId, 2)).wait(); // STARGATE mode
  console.log('✅ Cross-chain mode set to STARGATE');
  
  // Verify configuration
  console.log(chalk.blue('\nVerifying Configuration...'));
  const mode = await enhanced.crossChainModes(targetChainId);
  const srcRouter = await enhanced.stargateRouters(chainId);
  const srcRouterETH = await enhanced.stargateRouterETHs(chainId);
  
  console.log('├─ Cross-chain mode:', ['DISABLED', 'LAYERZERO_OFT', 'STARGATE'][Number(mode)]);
  console.log('├─ Source Router:', srcRouter);
  console.log('└─ Source RouterETH:', srcRouterETH);
  
  // Final summary
  console.log(chalk.green('\n✅ Deployment Complete!'));
  console.log('=====================================');
  console.log('📋 Contract:', enhanced.target);
  console.log('🌐 Network:', networkName);
  console.log('💸 Hardcoded Fees:');
  console.log('  ├─ Sepolia → Arbitrum: 0.002 ETH');
  console.log('  └─ Arbitrum → Sepolia: 0.001 ETH');
  console.log('\n🔧 Features:');
  console.log('  ├─ Hardcoded testnet fees (bypasses broken quote)');
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
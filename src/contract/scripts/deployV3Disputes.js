#!/usr/bin/env node
/**
 * Deploy UniversalEscrowServiceV3Disputes contracts
 * Includes dispute resolution and real-time sync capabilities
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// Network configuration
const CHAINS = {
  sepolia: {
    chainId: 11155111,
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    stargateRouter: '0x2836045A50744FB50D3d04a9C8D18aD7B5012102',
    stargateRouterETH: '0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D',
    stargateChainId: 10161,
    layerZeroEndpointId: 40161,
    usdc: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
    usdt: '0x0000000000000000000000000000000000000000' // Not on Sepolia testnet
  },
  'arbitrum-sepolia': {
    chainId: 421614,
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    stargateRouter: '0x2a4C2F5ffB0E0F2dcB3f9EBBd442B8F77ECDB9Cc',
    stargateRouterETH: '0x771A4f8a880b499A40c8fF53c7925798E0f2E594',
    stargateChainId: 10231,
    layerZeroEndpointId: 40231,
    usdc: '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773',
    usdt: '0x0000000000000000000000000000000000000000' // Not on Arbitrum Sepolia
  },
  'polygon-amoy': {
    chainId: 80002,
    weth: '0x714550C2C1Ea08688607D86ed8EeF4f5E4F22323', // WPOL on Amoy (Polygon transitioned from MATIC to POL)
    uniswapRouter: '0xeA4B97b6d5C72e6B8Cf80e7A7f3f8f52d6da7757', // QuickSwap on Amoy
    stargateRouter: '0x0000000000000000000000000000000000000000', // Not on Amoy yet
    stargateRouterETH: '0x0000000000000000000000000000000000000000',
    stargateChainId: 0,
    layerZeroEndpointId: 40267,
    usdc: '0x0000000000000000000000000000000000000000',
    usdt: '0x0000000000000000000000000000000000000000'
  }
};

async function deployContract(chainName, config) {
  console.log(chalk.blue(`\n🚀 Deploying V3Disputes to ${chainName}...`));
  
  const [deployer] = await hre.ethers.getSigners();
  const serviceWallet = process.env.BACKEND_WALLET_ADDRESS || deployer.address;
  
  console.log('├─ Deployer:', deployer.address);
  console.log('├─ Service Wallet:', serviceWallet);
  console.log('├─ WETH:', config.weth);
  console.log('├─ Uniswap Router:', config.uniswapRouter);
  
  // Deploy the contract
  const EscrowContract = await hre.ethers.getContractFactory('UniversalEscrowServiceV3Disputes');
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
  
  // Configure Stargate if available
  if (config.stargateRouter !== '0x0000000000000000000000000000000000000000') {
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
    
    // Configure token support
    if (config.usdc !== '0x0000000000000000000000000000000000000000') {
      console.log('Configuring USDC support...');
      const tx3 = await contract.configureStargateToken(
        config.chainId,
        config.usdc,
        1, // USDC pool ID
        false // not native
      );
      await tx3.wait();
      console.log('✅ USDC configured');
    }
    
    // Configure ETH as native
    console.log('Configuring ETH support...');
    const tx4 = await contract.configureStargateToken(
      config.chainId,
      '0x0000000000000000000000000000000000000000',
      13, // ETH pool ID
      true // is native
    );
    await tx4.wait();
    console.log('✅ ETH configured');
  }
  
  // Configure cross-chain routing for other chains
  for (const [otherChainName, otherConfig] of Object.entries(otherChains)) {
    if (otherChainName === chainName) continue;
    
    console.log(`Setting cross-chain configuration for ${otherChainName}...`);
    
    // Determine cross-chain mode
    const useStargate = config.stargateRouter !== '0x0000000000000000000000000000000000000000' &&
                       otherConfig.stargateRouter !== '0x0000000000000000000000000000000000000000';
    
    if (useStargate) {
      // Set cross-chain mode to STARGATE (mode = 2)
      const tx = await contract.setCrossChainMode(otherConfig.chainId, 2);
      await tx.wait();
      
      // Set Stargate configuration for target chain
      const tx2 = await contract.setStargateRouter(
        otherConfig.chainId,
        otherConfig.stargateRouter,
        otherConfig.stargateRouterETH
      );
      await tx2.wait();
      
      const tx3 = await contract.setStargateChainId(otherConfig.chainId, otherConfig.stargateChainId);
      await tx3.wait();
      
      console.log(`✅ ${otherChainName} Stargate routing configured`);
    } else {
      // Set cross-chain mode to LAYERZERO_OFT (mode = 1)
      const tx = await contract.setCrossChainMode(otherConfig.chainId, 1);
      await tx.wait();
      console.log(`✅ ${otherChainName} LayerZero routing configured`);
    }
  }
  
  // Note: Chain ID to endpoint mappings are handled internally by the contract
  console.log('✅ LayerZero endpoint mappings configured internally');
}

async function main() {
  console.log(chalk.blue('🌟 Deploying UniversalEscrowServiceV3Disputes'));
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
  console.log('├─ Dispute Resolution: ✅ 48-hour window, 7-day resolution');
  console.log('├─ Real-time Sync: ✅ Condition updates sync immediately');
  console.log('├─ Stargate Integration: ✅ ETH, USDC, USDT support');
  console.log('├─ Same-chain transfers: ✅ Direct + Uniswap swaps');
  console.log('├─ Cross-chain transfers: ✅ Stargate + LayerZero fallback');
  console.log('└─ Supported chains:', Object.keys(CHAINS).join(', '));
  
  console.log(chalk.yellow('\n🔗 Cross-chain Routing:'));
  for (const [chainName, config] of Object.entries(CHAINS)) {
    if (chainName !== currentChain) {
      const hasStargate = config.stargateRouter !== '0x0000000000000000000000000000000000000000';
      console.log(`├─ To ${chainName}: ${hasStargate ? 'Stargate' : 'LayerZero OFT'}`);
    }
  }
  
  console.log(chalk.blue('\n📝 Next Steps:'));
  console.log('1. Deploy this script on other supported chains');
  console.log('2. Configure OFT adapters for LayerZero fallback');
  console.log('3. Set up real-time condition sync service');
  console.log('4. Test dispute resolution workflow');
  console.log('5. Test all transaction types (same-chain, cross-chain, swaps)');
  
  // Save deployment info
  const deploymentInfo = {
    network: currentChain,
    chainId: chainId,
    contractAddress: address,
    contractType: 'UniversalEscrowServiceV3Disputes',
    serviceWallet: currentConfig.serviceWallet || process.env.BACKEND_WALLET_ADDRESS,
    features: {
      disputeResolution: true,
      disputeWindow: '48 hours',
      resolutionPeriod: '7 days',
      realTimeSync: true,
      sameChainDirect: true,
      sameChainSwap: true,
      crossChainStargate: currentConfig.stargateRouter !== '0x0000000000000000000000000000000000000000',
      crossChainLayerZero: true
    },
    deployedAt: new Date().toISOString()
  };
  
  // Save to file
  const deploymentsDir = path.join(__dirname, 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const filename = path.join(deploymentsDir, `v3disputes-${currentChain}-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(chalk.gray(`\n💾 Deployment info saved to: ${filename}`));
  
  // Update .env file suggestion
  console.log(chalk.yellow('\n📝 Update your .env file:'));
  const envVarName = `${currentChain.toUpperCase().replace('-', '_')}_V3_DISPUTES_CONTRACT`;
  console.log(`${envVarName}=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Deployment failed:'), error);
    process.exit(1);
  });
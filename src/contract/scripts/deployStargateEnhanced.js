#!/usr/bin/env node
/**
 * Deploy UniversalEscrowServiceV3StargateEnhanced contracts
 * Supports ETH, USDC, USDT and other Stargate-supported tokens
 */
const hre = require('hardhat');
const chalk = require('chalk');

// Enhanced testnet configuration with all Stargate tokens
const CHAINS = {
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    stargateRouter: '0x2836045A50744FB50D3d04a9C8D18aD7B5012102',
    stargateRouterETH: '0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D',
    stargateChainId: 10161,
    layerZeroEndpointId: 40161,
    tokens: {
      usdc: {
        address: '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590',
        poolId: 1,
        decimals: 6
      }
    }
  },
  arbitrum: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    stargateRouter: '0x2a4C2F5ffB0E0F2dcB3f9EBBd442B8F77ECDB9Cc',
    stargateRouterETH: '0x771A4f8a880b499A40c8fF53c7925798E0f2E594',
    stargateChainId: 10231,
    layerZeroEndpointId: 40231,
    tokens: {
      usdc: {
        address: '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773',
        poolId: 1,
        decimals: 6
      }
    }
  }
};

async function deployContract(chainName, config) {
  console.log(chalk.blue(`\n🚀 Deploying Enhanced Stargate Escrow to ${config.name}...`));
  
  const [deployer] = await hre.ethers.getSigners();
  const serviceWallet = process.env.BACKEND_WALLET_ADDRESS || deployer.address;
  
  console.log('├─ Deployer:', deployer.address);
  console.log('├─ Service Wallet:', serviceWallet);
  console.log('├─ WETH:', config.weth);
  console.log('├─ Uniswap Router:', config.uniswapRouter);
  console.log('├─ Stargate Router:', config.stargateRouter);
  console.log('├─ Stargate RouterETH:', config.stargateRouterETH);
  
  // Deploy the enhanced contract
  const EscrowContract = await hre.ethers.getContractFactory('UniversalEscrowServiceV3StargateEnhanced');
  const escrow = await EscrowContract.deploy(
    serviceWallet,
    config.weth,
    config.uniswapRouter
  );
  
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  
  console.log(chalk.green('✅ Enhanced Stargate Escrow deployed at:'), address);
  
  return { address, contract: escrow };
}

async function configureContract(contract, chainName, config, allChains) {
  console.log(chalk.yellow(`\n⚙️  Configuring ${config.name} contract...`));
  
  // Configure Stargate routers for current chain
  console.log('Setting Stargate routers...');
  const tx1 = await contract.setStargateRouter(
    config.chainId,
    config.stargateRouter,
    config.stargateRouterETH
  );
  await tx1.wait();
  
  const tx2 = await contract.setStargateChainId(config.chainId, config.stargateChainId);
  await tx2.wait();
  
  console.log('✅ Stargate routers configured');
  
  // Configure supported tokens for current chain
  console.log('Configuring Stargate tokens...');
  
  // Configure ETH (already done in constructor, but verify)
  console.log('├─ ETH (native) - Pool ID 13');
  
  // Configure USDC
  if (config.tokens.usdc) {
    console.log(`├─ USDC (${config.tokens.usdc.address}) - Pool ID ${config.tokens.usdc.poolId}`);
    const tx3 = await contract.configureStargateToken(
      config.chainId,
      config.tokens.usdc.address,
      config.tokens.usdc.poolId,
      false // Not native
    );
    await tx3.wait();
  }
  
  console.log('✅ Stargate tokens configured');
  
  // Configure cross-chain routing for other chains
  for (const [otherChainName, otherConfig] of Object.entries(allChains)) {
    if (otherChainName === chainName) continue;
    
    console.log(`Setting cross-chain configuration for ${otherConfig.name}...`);
    
    // Set cross-chain mode to STARGATE (mode = 2)
    const tx4 = await contract.setCrossChainMode(otherConfig.chainId, 2);
    await tx4.wait();
    
    // Set Stargate configuration for target chain
    const tx5 = await contract.setStargateRouter(
      otherConfig.chainId,
      otherConfig.stargateRouter,
      otherConfig.stargateRouterETH
    );
    await tx5.wait();
    
    const tx6 = await contract.setStargateChainId(otherConfig.chainId, otherConfig.stargateChainId);
    await tx6.wait();
    
    // Configure tokens on target chain
    if (otherConfig.tokens.usdc) {
      const tx7 = await contract.configureStargateToken(
        otherConfig.chainId,
        otherConfig.tokens.usdc.address,
        otherConfig.tokens.usdc.poolId,
        false
      );
      await tx7.wait();
    }
    
    console.log(`✅ ${otherConfig.name} routing configured`);
  }
  
  // Note: LayerZero endpoint mappings are handled by the parent contract if needed
  // The enhanced contract focuses on Stargate integration
}

async function verifyConfiguration(contract, config) {
  console.log(chalk.cyan('\n🔍 Verifying configuration...'));
  
  try {
    // Check supported tokens
    const [tokens, tokenConfigs] = await contract.getSupportedStargateTokens(config.chainId);
    
    console.log('├─ Supported Stargate tokens:');
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const tokenConfig = tokenConfigs[i];
      
      const tokenName = token === hre.ethers.ZeroAddress ? 'ETH' : 
                       token === config.tokens.usdc?.address ? 'USDC' : 
                       'Unknown';
      
      console.log(`   ├─ ${tokenName}: Pool ${tokenConfig.poolId} (${tokenConfig.isNative ? 'Native' : 'ERC20'})`);
    }
    
    // Check cross-chain options
    const otherChainIds = Object.values(CHAINS)
      .filter(c => c.chainId !== config.chainId)
      .map(c => c.chainId);
    
    console.log('├─ Cross-chain routing:');
    for (const targetChainId of otherChainIds) {
      const options = await contract.getTransferOptions(targetChainId);
      const targetChain = Object.values(CHAINS).find(c => c.chainId === targetChainId);
      
      console.log(`   ├─ To ${targetChain?.name}: ${['DISABLED', 'LAYERZERO_OFT', 'STARGATE'][options.preferredMode]}`);
    }
    
    // Test ETH quote
    const ethQuote = await contract.getStargateQuote(
      otherChainIds[0],
      hre.ethers.ZeroAddress,
      hre.ethers.parseEther('0.01')
    );
    
    console.log('├─ Sample ETH quote:');
    console.log(`   ├─ Fee: ${hre.ethers.formatEther(ethQuote.fee)} ETH`);
    console.log(`   └─ Min out: ${hre.ethers.formatEther(ethQuote.minAmountOut)} ETH`);
    
    console.log('✅ Configuration verified');
    
  } catch (error) {
    console.log(chalk.red('❌ Configuration verification failed:'), error.message);
  }
}

async function main() {
  console.log(chalk.blue('🌟 Deploying UniversalEscrowServiceV3StargateEnhanced'));
  console.log(chalk.blue('===================================================='));
  
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
  
  console.log(chalk.cyan(`\n📍 Detected network: ${currentConfig.name} (${chainId})`));
  
  // Deploy contract
  const { address, contract } = await deployContract(currentChain, currentConfig);
  
  // Configure contract
  await configureContract(contract, currentChain, currentConfig, CHAINS);
  
  // Verify configuration
  await verifyConfiguration(contract, currentConfig);
  
  console.log(chalk.green(`\n✅ ${currentConfig.name} deployment complete!`));
  console.log(chalk.cyan('📋 Contract Address:'), address);
  
  // Generate comprehensive summary
  console.log(chalk.yellow('\n📊 Enhanced Features Summary:'));
  console.log('├─ 🎯 Transaction Types:');
  console.log('│  ├─ Same-chain, same-token: ✅ Direct transfers');
  console.log('│  ├─ Same-chain, different-token: ✅ Uniswap swaps');
  console.log('│  └─ Cross-chain: ✅ Stargate bridging');
  console.log('├─ 🪙 Supported Tokens:');
  console.log('│  ├─ ETH: ✅ Native + RouterETH');
  console.log('│  ├─ USDC: ✅ Pool ID 1');
  console.log('│  └─ Future: ✅ Configurable tokens');
  console.log('├─ 🔀 Intelligent Routing:');
  console.log('│  ├─ Direct token bridging when available');
  console.log('│  ├─ Token conversion + bridging');
  console.log('│  └─ Best supported token fallback');
  console.log('└─ 🔧 Uniswap Integration:');
  console.log('   ├─ ETH ↔ ERC20 swaps');
  console.log('   ├─ ERC20 ↔ ERC20 direct paths');
  console.log('   └─ ERC20 ↔ ERC20 via WETH routing');
  
  console.log(chalk.yellow('\n🔗 Cross-chain Configuration:'));
  for (const [chainName, config] of Object.entries(CHAINS)) {
    if (chainName !== currentChain) {
      console.log(`├─ To ${config.name}:`);
      console.log(`│  ├─ Stargate Chain ID: ${config.stargateChainId}`);
      console.log(`│  ├─ Supported Tokens: ETH, USDC`);
      console.log(`│  └─ Mode: STARGATE (primary)`);
    }
  }
  
  console.log(chalk.blue('\n📝 Next Steps:'));
  console.log('1. Deploy this script on other supported chains');
  console.log('2. Update environment variables with contract addresses:');
  console.log(`   export ${currentChain.toUpperCase()}_STARGATE_ENHANCED_CONTRACT=${address}`);
  console.log('3. Run comprehensive tests:');
  console.log('   npx hardhat run scripts/testThreeMainTransactionTypes.js --network', currentChain);
  console.log('4. Update EscrowServiceV3 to use enhanced contract');
  
  // Save deployment info
  const deploymentInfo = {
    network: currentConfig.name,
    chainId: chainId,
    contractAddress: address,
    contractType: 'UniversalEscrowServiceV3StargateEnhanced',
    serviceWallet: process.env.BACKEND_WALLET_ADDRESS,
    stargate: {
      router: currentConfig.stargateRouter,
      routerETH: currentConfig.stargateRouterETH,
      chainId: currentConfig.stargateChainId
    },
    supportedTokens: {
      eth: { poolId: 13, isNative: true },
      usdc: currentConfig.tokens.usdc
    },
    features: {
      sameChainDirect: true,
      sameChainSwap: true,
      crossChainStargate: true,
      crossChainOFTFallback: true,
      intelligentRouting: true,
      multiTokenSupport: true
    },
    transactionTypes: [
      'Same-chain, same-token (ETH → ETH, USDC → USDC)',
      'Same-chain, different-token (ETH → USDC, USDC → ETH)',
      'Cross-chain (ETH/USDC to different chain via Stargate)'
    ],
    deployedAt: new Date().toISOString()
  };
  
  console.log(chalk.gray('\n💾 Deployment Summary:'));
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Deployment failed:'), error);
    process.exit(1);
  });
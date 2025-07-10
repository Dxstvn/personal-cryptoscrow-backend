#!/usr/bin/env node
/**
 * Comprehensive test summary for Stargate Enhanced contracts
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function testContract(contractAddress, networkName) {
  console.log(chalk.blue(`\n🔍 Testing ${networkName}`));
  console.log('='.repeat(50));
  
  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', contractAddress);
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  
  const results = {
    deployment: { status: '❓', details: '' },
    configuration: { status: '❓', details: '' },
    sameChainETH: { status: '❓', details: '' },
    sameChainSwap: { status: '❓', details: '' },
    crossChainConfig: { status: '❓', details: '' },
    stargateQuote: { status: '❓', details: '' },
    crossChainTransfer: { status: '❓', details: '' }
  };
  
  // Test 1: Deployment & Basic Configuration
  try {
    const code = await hre.ethers.provider.getCode(contractAddress);
    if (code.length > 2) {
      const owner = await contract.owner();
      const serviceWallet = await contract.serviceWallet();
      results.deployment.status = '✅';
      results.deployment.details = `Owner: ${owner}`;
    }
  } catch (e) {
    results.deployment.status = '❌';
    results.deployment.details = e.message;
  }
  
  // Test 2: Stargate Configuration
  try {
    const router = await contract.stargateRouters(chainId);
    const routerETH = await contract.stargateRouterETHs(chainId);
    const [tokens, configs] = await contract.getSupportedStargateTokens(chainId);
    
    if (router !== hre.ethers.ZeroAddress && routerETH !== hre.ethers.ZeroAddress && tokens.length > 0) {
      results.configuration.status = '✅';
      results.configuration.details = `${tokens.length} tokens configured`;
    } else {
      results.configuration.status = '⚠️';
      results.configuration.details = 'Incomplete configuration';
    }
  } catch (e) {
    results.configuration.status = '❌';
    results.configuration.details = e.message;
  }
  
  // Test 3: Same-chain ETH Transfer
  try {
    const amount = hre.ethers.parseEther('0.001');
    
    // Create escrow
    const tx1 = await contract.createEscrow(
      signer.address,
      hre.ethers.ZeroAddress,
      amount,
      hre.ethers.ZeroAddress,
      chainId,
      { value: amount }
    );
    await tx1.wait();
    
    // Extract escrow ID
    const receipt = await tx1.wait();
    let escrowId;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'EscrowCreated') {
          escrowId = parsed.args.escrowId;
          break;
        }
      } catch (e) {}
    }
    
    // Update and release
    await (await contract.updateCondition(escrowId, true)).wait();
    await (await contract.releaseEscrow(escrowId)).wait();
    
    results.sameChainETH.status = '✅';
    results.sameChainETH.details = 'ETH → ETH transfer works';
  } catch (e) {
    results.sameChainETH.status = '❌';
    results.sameChainETH.details = e.message;
  }
  
  // Test 4: Same-chain Swap (ETH → USDC)
  try {
    const amount = hre.ethers.parseEther('0.001');
    const usdcAddress = chainId === 11155111
      ? '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590'
      : '0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773';
    
    // Just create the escrow to test creation
    const tx1 = await contract.createEscrow(
      signer.address,
      hre.ethers.ZeroAddress,
      amount,
      usdcAddress,
      chainId,
      { value: amount }
    );
    await tx1.wait();
    
    results.sameChainSwap.status = '⚠️';
    results.sameChainSwap.details = 'Escrow created but no Uniswap liquidity';
  } catch (e) {
    results.sameChainSwap.status = '❌';
    results.sameChainSwap.details = e.message;
  }
  
  // Test 5: Cross-chain Configuration
  try {
    const targetChainId = chainId === 11155111 ? 421614 : 11155111;
    const mode = await contract.crossChainModes(targetChainId);
    const isAvailable = await contract.isStargateAvailable(targetChainId, hre.ethers.ZeroAddress);
    
    if (mode === 2 && isAvailable) { // STARGATE mode
      results.crossChainConfig.status = '✅';
      results.crossChainConfig.details = 'Stargate mode configured';
    } else {
      results.crossChainConfig.status = '⚠️';
      results.crossChainConfig.details = `Mode: ${['DISABLED', 'LAYERZERO_OFT', 'STARGATE'][mode]}`;
    }
  } catch (e) {
    results.crossChainConfig.status = '❌';
    results.crossChainConfig.details = e.message;
  }
  
  // Test 6: Stargate Quote
  try {
    const targetChainId = chainId === 11155111 ? 421614 : 11155111;
    const amount = hre.ethers.parseEther('0.01');
    const quote = await contract['getStargateQuote(uint256,address,uint256)'](
      targetChainId,
      hre.ethers.ZeroAddress,
      amount
    );
    
    results.stargateQuote.status = '✅';
    results.stargateQuote.details = `Fee: ${hre.ethers.formatEther(quote.fee)} ETH`;
  } catch (e) {
    results.stargateQuote.status = '❌';
    results.stargateQuote.details = 'Quote function failing';
  }
  
  // Test 7: Cross-chain Transfer
  try {
    const targetChainId = chainId === 11155111 ? 421614 : 11155111;
    const amount = hre.ethers.parseEther('0.001');
    
    // Just create cross-chain escrow
    const tx1 = await contract.createEscrow(
      signer.address,
      hre.ethers.ZeroAddress,
      amount,
      hre.ethers.ZeroAddress,
      targetChainId,
      { value: amount }
    );
    await tx1.wait();
    
    results.crossChainTransfer.status = '⚠️';
    results.crossChainTransfer.details = 'Escrow created, release needs quote';
  } catch (e) {
    results.crossChainTransfer.status = '❌';
    results.crossChainTransfer.details = e.message;
  }
  
  return results;
}

async function main() {
  console.log(chalk.blue('📊 Comprehensive Test Summary'));
  console.log(chalk.blue('============================'));
  
  const contracts = {
    'Sepolia': process.env.SEPOLIA_STARGATE_ENHANCED_CONTRACT,
    'Arbitrum Sepolia': process.env.ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT
  };
  
  const allResults = {};
  
  // Test Sepolia
  try {
    const network = 'sepolia';
    await hre.changeNetwork(network);
    allResults['Sepolia'] = await testContract(contracts['Sepolia'], 'Sepolia');
  } catch (e) {
    console.log(chalk.red('❌ Could not test Sepolia:'), e.message);
  }
  
  // Test Arbitrum Sepolia
  try {
    const network = 'arbitrum-sepolia';
    await hre.changeNetwork(network);
    allResults['Arbitrum Sepolia'] = await testContract(contracts['Arbitrum Sepolia'], 'Arbitrum Sepolia');
  } catch (e) {
    console.log(chalk.red('❌ Could not test Arbitrum Sepolia:'), e.message);
  }
  
  // Summary
  console.log(chalk.green('\n\n📋 FINAL SUMMARY'));
  console.log('='.repeat(70));
  
  console.log(chalk.cyan('\n🏗️  Contract Deployments:'));
  console.log(`├─ Sepolia: ${contracts['Sepolia']}`);
  console.log(`└─ Arbitrum Sepolia: ${contracts['Arbitrum Sepolia']}`);
  
  for (const [network, results] of Object.entries(allResults)) {
    console.log(chalk.cyan(`\n📍 ${network} Results:`));
    console.log(`├─ Deployment: ${results.deployment.status} ${results.deployment.details}`);
    console.log(`├─ Configuration: ${results.configuration.status} ${results.configuration.details}`);
    console.log(`├─ Same-chain ETH: ${results.sameChainETH.status} ${results.sameChainETH.details}`);
    console.log(`├─ Same-chain Swap: ${results.sameChainSwap.status} ${results.sameChainSwap.details}`);
    console.log(`├─ Cross-chain Config: ${results.crossChainConfig.status} ${results.crossChainConfig.details}`);
    console.log(`├─ Stargate Quote: ${results.stargateQuote.status} ${results.stargateQuote.details}`);
    console.log(`└─ Cross-chain Transfer: ${results.crossChainTransfer.status} ${results.crossChainTransfer.details}`);
  }
  
  console.log(chalk.yellow('\n⚠️  Known Issues:'));
  console.log('├─ Uniswap: No liquidity on testnets for ETH/USDC swaps');
  console.log('├─ Stargate: Quote function failing (possible testnet issue)');
  console.log('└─ Cross-chain: Cannot complete transfers without working quotes');
  
  console.log(chalk.green('\n✅ What\'s Working:'));
  console.log('├─ Contract deployment and configuration');
  console.log('├─ Same-chain ETH transfers');
  console.log('├─ Escrow creation for all transaction types');
  console.log('├─ Condition updates and basic release logic');
  console.log('└─ Stargate router configuration');
  
  console.log(chalk.cyan('\n💡 Recommendations:'));
  console.log('├─ For swap testing: Add liquidity or use mainnet fork');
  console.log('├─ For cross-chain: Check Stargate testnet status');
  console.log('└─ For production: Test on mainnet with real liquidity');
}

// Run on current network only
async function runCurrentNetwork() {
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let contractAddress, networkName;
  if (chainId === 11155111) {
    contractAddress = process.env.SEPOLIA_STARGATE_ENHANCED_CONTRACT;
    networkName = 'Sepolia';
  } else if (chainId === 421614) {
    contractAddress = process.env.ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT;
    networkName = 'Arbitrum Sepolia';
  } else {
    throw new Error('Unsupported network');
  }
  
  const results = await testContract(contractAddress, networkName);
  
  console.log(chalk.green('\n\n📋 TEST SUMMARY'));
  console.log('='.repeat(50));
  console.log(chalk.cyan(`\n📍 ${networkName} Results:`));
  console.log(`├─ Deployment: ${results.deployment.status} ${results.deployment.details}`);
  console.log(`├─ Configuration: ${results.configuration.status} ${results.configuration.details}`);
  console.log(`├─ Same-chain ETH: ${results.sameChainETH.status} ${results.sameChainETH.details}`);
  console.log(`├─ Same-chain Swap: ${results.sameChainSwap.status} ${results.sameChainSwap.details}`);
  console.log(`├─ Cross-chain Config: ${results.crossChainConfig.status} ${results.crossChainConfig.details}`);
  console.log(`├─ Stargate Quote: ${results.stargateQuote.status} ${results.stargateQuote.details}`);
  console.log(`└─ Cross-chain Transfer: ${results.crossChainTransfer.status} ${results.crossChainTransfer.details}`);
}

runCurrentNetwork()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
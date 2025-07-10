#!/usr/bin/env node
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Verifying Arbitrum Sepolia Contract'));
  console.log('=====================================');
  
  const contractAddress = '0x669D9Fd545Ce0C1e69ac332CfFC5dA4dFa4233C1';
  const provider = hre.ethers.provider;
  
  try {
    // Check if contract exists
    const code = await provider.getCode(contractAddress);
    console.log('✅ Contract exists:', code.length > 2);
    console.log('├─ Code size:', code.length, 'bytes');
    
    // Try to connect to contract
    const abi = [
      'function owner() view returns (address)',
      'function serviceWallet() view returns (address)',
      'function stargateRouters(uint256) view returns (address)',
      'function stargateRouterETHs(uint256) view returns (address)',
      'function getSupportedStargateTokens(uint256) view returns (address[], tuple(address tokenAddress, uint256 poolId, bool isNative, bool supported)[])'
    ];
    
    const contract = new hre.ethers.Contract(contractAddress, abi, provider);
    
    // Check basic configuration
    try {
      const owner = await contract.owner();
      console.log('\n📋 Basic Configuration:');
      console.log('├─ Owner:', owner);
    } catch (e) {
      console.log(chalk.yellow('⚠️  Could not read owner'));
    }
    
    try {
      const serviceWallet = await contract.serviceWallet();
      console.log('├─ Service Wallet:', serviceWallet);
    } catch (e) {
      console.log(chalk.yellow('⚠️  Could not read serviceWallet'));
    }
    
    // Check Stargate configuration
    const arbitrumChainId = 421614;
    console.log('\n🌟 Stargate Configuration:');
    
    try {
      const router = await contract.stargateRouters(arbitrumChainId);
      console.log('├─ Stargate Router:', router);
    } catch (e) {
      console.log(chalk.red('❌ No stargateRouters function - NOT a Stargate contract'));
    }
    
    try {
      const routerETH = await contract.stargateRouterETHs(arbitrumChainId);
      console.log('├─ Stargate RouterETH:', routerETH);
    } catch (e) {
      console.log(chalk.red('❌ No stargateRouterETHs function'));
    }
    
    // Check supported tokens
    try {
      const [tokens, configs] = await contract.getSupportedStargateTokens(arbitrumChainId);
      console.log('\n📊 Supported Tokens:');
      for (let i = 0; i < tokens.length; i++) {
        console.log(`├─ Token ${i}:`, tokens[i]);
        console.log(`   └─ Pool ID:`, configs[i].poolId);
      }
    } catch (e) {
      console.log(chalk.red('❌ No getSupportedStargateTokens function'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
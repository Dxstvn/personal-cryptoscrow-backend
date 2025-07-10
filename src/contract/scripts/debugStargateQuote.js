#!/usr/bin/env node
/**
 * Debug Stargate quote functionality
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Debug Stargate Quote'));
  console.log('======================\n');
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  const contractAddress = chainId === 11155111 
    ? process.env.SEPOLIA_STARGATE_ENHANCED_CONTRACT
    : process.env.ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT;
    
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', contractAddress);
  
  console.log('📍 Network:', chainId === 11155111 ? 'Sepolia' : 'Arbitrum Sepolia');
  console.log('📋 Contract:', contractAddress);
  
  // Test direct Stargate RouterETH interaction
  const routerETHAddress = await contract.stargateRouterETHs(chainId);
  console.log('\n🌟 Stargate RouterETH:', routerETHAddress);
  
  if (routerETHAddress === hre.ethers.ZeroAddress) {
    console.log(chalk.red('❌ No RouterETH configured for current chain'));
    return;
  }
  
  // Try to interact with RouterETH directly
  const routerETH = await hre.ethers.getContractAt([
    'function quoteLayerZeroFee(uint16 _dstChainId, bytes calldata _toAddress, tuple(uint256 dstGasForCall, uint256 dstNativeAmount, bytes dstNativeAddr) _lzTxParams) external view returns (uint256, uint256)'
  ], routerETHAddress);
  
  const targetChainId = chainId === 11155111 ? 421614 : 11155111;
  const stargateTargetChainId = chainId === 11155111 ? 10231 : 10161;
  
  console.log('\n📊 Quote Parameters:');
  console.log('├─ Target Chain ID:', targetChainId);
  console.log('├─ Stargate Target ID:', stargateTargetChainId);
  console.log('└─ Amount: 0.01 ETH');
  
  // Test 1: Try minimal quote
  console.log(chalk.blue('\n1️⃣ Minimal Quote Test:'));
  try {
    const toAddress = hre.ethers.AbiCoder.defaultAbiCoder().encode(['address'], ['0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D']);
    const lzTxParams = {
      dstGasForCall: 0,
      dstNativeAmount: 0,
      dstNativeAddr: '0x'
    };
    
    const [nativeFee, zroFee] = await routerETH.quoteLayerZeroFee(
      stargateTargetChainId,
      toAddress,
      lzTxParams
    );
    
    console.log('✅ Quote successful!');
    console.log('├─ Native Fee:', hre.ethers.formatEther(nativeFee), 'ETH');
    console.log('└─ ZRO Fee:', zroFee.toString());
  } catch (error) {
    console.log(chalk.red('❌ Quote failed:'), error.message);
  }
  
  // Test 2: Check contract's quote function implementation
  console.log(chalk.blue('\n2️⃣ Contract Quote Function:'));
  try {
    // Check if the token is configured for Stargate
    const tokenConfig = await contract.tokenConfigs(targetChainId, hre.ethers.ZeroAddress);
    console.log('├─ Token configured:', tokenConfig.supported);
    console.log('├─ Pool ID:', tokenConfig.poolId);
    console.log('└─ Is Native:', tokenConfig.isNative);
    
    // Try the quote with explicit parameters
    const amount = hre.ethers.parseEther('0.01');
    console.log('\nAttempting quote with amount:', hre.ethers.formatEther(amount));
    
    // Use the specific function signature
    const quote = await contract['getStargateQuote(uint256,address,uint256)'](
      targetChainId,
      hre.ethers.ZeroAddress,
      amount
    );
    
    console.log('✅ Contract quote successful!');
    console.log('├─ Fee:', hre.ethers.formatEther(quote.fee), 'ETH');
    console.log('└─ Min Amount Out:', hre.ethers.formatEther(quote.minAmountOut), 'ETH');
    
  } catch (error) {
    console.log(chalk.red('❌ Contract quote failed:'));
    console.log('├─ Error:', error.message);
    
    // Try to decode the error
    if (error.data) {
      try {
        const decodedError = contract.interface.parseError(error.data);
        console.log('├─ Decoded error:', decodedError);
      } catch (e) {
        // Try common error signatures
        const errorSigs = {
          '0x08c379a0': 'Error(string)',
          '0x4e487b71': 'Panic(uint256)',
          '0x': 'Empty error data'
        };
        
        const sig = error.data.slice(0, 10);
        console.log('├─ Error signature:', sig);
        console.log('└─ Type:', errorSigs[sig] || 'Unknown');
      }
    }
  }
  
  // Test 3: Check Stargate Router configuration
  console.log(chalk.blue('\n3️⃣ Stargate Router Check:'));
  try {
    const router = await contract.stargateRouters(targetChainId);
    const routerETH = await contract.stargateRouterETHs(targetChainId);
    const stargateId = await contract.chainIdToStargateId(targetChainId);
    
    console.log('├─ Router:', router);
    console.log('├─ RouterETH:', routerETH);
    console.log('└─ Stargate Chain ID:', stargateId);
    
    // Check if routers are zero addresses
    if (router === hre.ethers.ZeroAddress || routerETH === hre.ethers.ZeroAddress) {
      console.log(chalk.yellow('⚠️  Stargate routers not properly configured for target chain'));
    }
  } catch (error) {
    console.log(chalk.red('❌ Error checking routers:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
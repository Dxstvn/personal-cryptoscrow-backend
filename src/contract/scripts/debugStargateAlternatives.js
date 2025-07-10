#!/usr/bin/env node
/**
 * Debug Stargate alternatives and workarounds
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🔍 Stargate Alternatives & Workarounds'));
  console.log('======================================\n');
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  const contractAddress = chainId === 11155111 
    ? process.env.SEPOLIA_STARGATE_ENHANCED_CONTRACT
    : process.env.ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT;
    
  const contract = await hre.ethers.getContractAt('UniversalEscrowServiceV3StargateEnhanced', contractAddress);
  
  console.log('📍 Network:', chainId === 11155111 ? 'Sepolia' : 'Arbitrum Sepolia');
  console.log('📋 Contract:', contractAddress);
  
  // Get configuration
  const targetChainId = chainId === 11155111 ? 421614 : 11155111;
  const stargateChainId = await contract.chainIdToStargateId(targetChainId);
  const routerETH = await contract.stargateRouterETHs(chainId);
  
  console.log('\n📊 Configuration:');
  console.log('├─ Target Chain ID:', targetChainId);
  console.log('├─ Stargate Chain ID:', stargateChainId);
  console.log('└─ RouterETH:', routerETH);
  
  // Test 1: Check LayerZero OFT fallback
  console.log(chalk.blue('\n1️⃣ LayerZero OFT Fallback:'));
  try {
    const hasOFT = await contract.oftAdapters(hre.ethers.ZeroAddress);
    const layerZeroEndpoint = await contract.layerZeroEndpoint();
    
    console.log('├─ OFT Adapter:', hasOFT);
    console.log('└─ LayerZero Endpoint:', layerZeroEndpoint);
    
    if (hasOFT !== hre.ethers.ZeroAddress) {
      console.log(chalk.green('✅ OFT fallback available!'));
      
      // Try to get OFT quote
      try {
        const sendParam = {
          dstEid: await contract.chainIdToEndpointId(targetChainId),
          to: hre.ethers.zeroPadValue(contract.target, 32),
          amountLD: hre.ethers.parseEther('0.01'),
          minAmountLD: hre.ethers.parseEther('0.0098'),
          extraOptions: '0x',
          composeMsg: '0x',
          oftCmd: '0x'
        };
        
        const oftAdapter = await hre.ethers.getContractAt('IOFT', hasOFT);
        const [nativeFee, lzTokenFee] = await oftAdapter.quoteSend(sendParam, false);
        
        console.log('📈 OFT Quote:');
        console.log('├─ Native Fee:', hre.ethers.formatEther(nativeFee), 'ETH');
        console.log('└─ LZ Token Fee:', lzTokenFee.toString());
      } catch (error) {
        console.log(chalk.yellow('⚠️  OFT quote failed:'), error.message);
      }
    }
  } catch (error) {
    console.log(chalk.red('❌ Error checking OFT:'), error.message);
  }
  
  // Test 2: Try manual Stargate pool interaction
  console.log(chalk.blue('\n2️⃣ Direct Stargate Pool Interaction:'));
  try {
    // According to testnet docs, these are the pool addresses
    const stargatePoolAddresses = {
      11155111: { // Sepolia
        native: '0x9Cc7e185162Aa5D1425ee924D97a87A0a34A0706',
        usdc: '0x4985b8fcEA3659FD801a5b857dA1D00e985863F0'
      },
      421614: { // Arbitrum Sepolia
        native: '0x6fddB6270F6c71f31B62AE0260cfa8E2e2d186E0',
        usdc: '0x543BdA7c6cA4384FE90B1F5929bb851F52888983'
      }
    };
    
    const pools = stargatePoolAddresses[chainId];
    if (pools) {
      console.log('├─ Native Pool:', pools.native);
      console.log('└─ USDC Pool:', pools.usdc);
      
      // Try to interact with native pool
      const nativePool = await hre.ethers.getContractAt([
        'function poolId() external view returns (uint16)',
        'function sharedDecimals() external view returns (uint8)',
        'function token() external view returns (address)'
      ], pools.native);
      
      try {
        const poolId = await nativePool.poolId();
        console.log('\n✅ Native Pool Info:');
        console.log('└─ Pool ID:', poolId);
      } catch (error) {
        console.log(chalk.yellow('⚠️  Could not read pool info'));
      }
    }
  } catch (error) {
    console.log(chalk.red('❌ Error with pool interaction:'), error.message);
  }
  
  // Test 3: Check alternative quote methods
  console.log(chalk.blue('\n3️⃣ Alternative Quote Methods:'));
  
  // Try with hardcoded gas values
  console.log('Testing with hardcoded gas values...');
  try {
    const routerETHContract = await hre.ethers.getContractAt([
      'function swapETH(uint16 _dstChainId, address payable _refundAddress, bytes calldata _toAddress, uint256 _amountLD, uint256 _minAmountLD) external payable'
    ], routerETH);
    
    // Estimate gas for the actual swap to get an idea of the fee
    const toAddress = hre.ethers.AbiCoder.defaultAbiCoder().encode(['address'], [contract.target]);
    const amount = hre.ethers.parseEther('0.01');
    
    // Common hardcoded values for testnets
    const hardcodedFees = {
      'sepolia-arbitrum': hre.ethers.parseEther('0.002'),
      'arbitrum-sepolia': hre.ethers.parseEther('0.001')
    };
    
    const route = chainId === 11155111 ? 'sepolia-arbitrum' : 'arbitrum-sepolia';
    const estimatedFee = hardcodedFees[route];
    
    console.log('├─ Route:', route);
    console.log('├─ Hardcoded Fee:', hre.ethers.formatEther(estimatedFee), 'ETH');
    console.log('└─ Note: This is an estimate, actual fee may vary');
    
  } catch (error) {
    console.log(chalk.red('❌ Error with alternative quote:'), error.message);
  }
  
  // Test 4: Check if we can bypass quote and use fixed fee
  console.log(chalk.blue('\n4️⃣ Fixed Fee Workaround:'));
  console.log('For testing purposes, you could:');
  console.log('├─ Use a fixed fee (e.g., 0.002 ETH)');
  console.log('├─ Modify contract to accept manual fee override');
  console.log('└─ Use LayerZero OFT as fallback');
  
  // Summary
  console.log(chalk.yellow('\n📋 Summary:'));
  console.log('├─ Stargate testnet appears to have issues');
  console.log('├─ Quote function consistently fails');
  console.log('├─ Pool contracts exist but may not be fully functional');
  console.log('└─ Consider using mainnet fork for testing');
  
  console.log(chalk.cyan('\n💡 Recommendations:'));
  console.log('1. For immediate testing:');
  console.log('   ├─ Use hardcoded fee estimates');
  console.log('   └─ Focus on same-chain functionality');
  console.log('2. For cross-chain testing:');
  console.log('   ├─ Use LayerZero OFT if available');
  console.log('   ├─ Test on mainnet fork');
  console.log('   └─ Wait for Stargate testnet fix');
  console.log('3. For production:');
  console.log('   └─ Ensure mainnet Stargate is functional');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Script failed:'), error);
    process.exit(1);
  });
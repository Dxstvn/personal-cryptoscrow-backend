#!/usr/bin/env node
/**
 * Test Stargate Router functionality
 */
const hre = require('hardhat');
const chalk = require('chalk');

// From Stargate docs
const SEPOLIA_ROUTER_ETH = '0x676Fa8D37B948236aAcE03A0b34fc0Bc37FABA8D';

async function main() {
  console.log(chalk.blue('🌟 Testing Stargate Router'));
  console.log(chalk.blue('========================\n'));
  
  const provider = new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  // Check if the router exists
  const code = await provider.getCode(SEPOLIA_ROUTER_ETH);
  console.log(`RouterETH at ${SEPOLIA_ROUTER_ETH}:`);
  console.log(`Has code: ${code !== '0x' ? '✅ Yes' : '❌ No'}`);
  
  if (code === '0x') {
    console.log(chalk.red('\n❌ RouterETH contract not deployed at this address'));
    console.log('This might mean:');
    console.log('1. The testnet contracts have been redeployed');
    console.log('2. We need updated contract addresses');
    return;
  }
  
  // Try to interact with it
  const routerETHAbi = [
    'function poolId() view returns (uint256)',
    'function router() view returns (address)',
    'function stargateEthVault() view returns (address)'
  ];
  
  try {
    const routerETH = new hre.ethers.Contract(SEPOLIA_ROUTER_ETH, routerETHAbi, provider);
    
    const poolId = await routerETH.poolId();
    const router = await routerETH.router();
    const vault = await routerETH.stargateEthVault();
    
    console.log(`\n📊 RouterETH Details:`);
    console.log(`├─ Pool ID: ${poolId}`);
    console.log(`├─ Router: ${router}`);
    console.log(`└─ ETH Vault: ${vault}`);
    
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Could not read router details'));
    console.log('The contract exists but might have a different interface');
  }
  
  console.log(chalk.yellow('\n💡 Key Findings:'));
  console.log('1. Stargate is a more complex system than simple OFT adapters');
  console.log('2. It requires proper pool configuration and liquidity');
  console.log('3. For testnet, we might need to use test tokens');
  console.log('\n4. Given the complexity, fixing the OFT adapter configuration');
  console.log('   might be simpler for our testing purposes.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
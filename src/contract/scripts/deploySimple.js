require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const hre = require('hardhat');
const chalk = require('chalk');

async function main() {
  console.log(chalk.blue('🚀 Deploy Enhanced Contract'));
  
  const [signer] = await hre.ethers.getSigners();
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  
  const serviceWallet = process.env.SERVICE_WALLET_ADDRESS || signer.address;
  const config = {
    11155111: { weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', uniswapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E' },
    421614: { weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' }
  };
  
  const Enhanced = await hre.ethers.getContractFactory('UniversalEscrowServiceV3StargateEnhanced');
  const enhanced = await Enhanced.deploy(serviceWallet, config[chainId].weth, config[chainId].uniswapRouter);
  await enhanced.waitForDeployment();
  
  console.log('✅ Contract deployed to:', enhanced.target);
  console.log('\n📝 Features:');
  console.log('  ├─ Hardcoded testnet fees (0.002/0.001 ETH)');
  console.log('  ├─ Higher slippage tolerance for testnets (20%)');
  console.log('  └─ Stargate integration for cross-chain transfers');
  
  const envKey = chainId === 11155111 ? 'SEPOLIA_STARGATE_ENHANCED_CONTRACT' : 'ARBITRUM_SEPOLIA_STARGATE_ENHANCED_CONTRACT';
  console.log(chalk.yellow(`\n${envKey}=${enhanced.target}`));
}

main().catch(console.error);
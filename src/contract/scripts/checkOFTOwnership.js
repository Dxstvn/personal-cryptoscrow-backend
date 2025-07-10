#!/usr/bin/env node
/**
 * Check OFT adapter ownership and balance
 */
const hre = require('hardhat');
const chalk = require('chalk');

const OFT_SEPOLIA = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
const OFT_ARBITRUM = '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B';
const WETH_SEPOLIA = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const WETH_ARBITRUM = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';

async function checkOFT(network, oftAddress, wethAddress) {
  console.log(chalk.blue(`\n📍 Checking ${network} OFT...`));
  
  const provider = network === 'Sepolia' 
    ? new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)
    : new hre.ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
    
  const oftAbi = [
    'function owner() view returns (address)',
    'function token() view returns (address)',
    'function peers(uint32) view returns (bytes32)'
  ];
  
  const wethAbi = [
    'function balanceOf(address) view returns (uint256)'
  ];
  
  const oft = new hre.ethers.Contract(oftAddress, oftAbi, provider);
  const weth = new hre.ethers.Contract(wethAddress, wethAbi, provider);
  
  // Check ownership
  const owner = await oft.owner();
  console.log(`Owner: ${owner}`);
  
  // Check token
  const token = await oft.token();
  console.log(`Token: ${token}`);
  console.log(`Expected WETH: ${wethAddress}`);
  console.log(`Token matches: ${token.toLowerCase() === wethAddress.toLowerCase() ? '✅' : '❌'}`);
  
  // Check WETH balance
  const balance = await weth.balanceOf(oftAddress);
  console.log(`WETH Balance: ${hre.ethers.formatEther(balance)}`);
  
  // Check peers
  const sepoliaPeer = await oft.peers(40161);
  const arbitrumPeer = await oft.peers(40231);
  console.log(`\nPeers:`);
  console.log(`├─ Sepolia (40161): ${sepoliaPeer}`);
  console.log(`└─ Arbitrum (40231): ${arbitrumPeer}`);
}

async function main() {
  console.log(chalk.blue('🔍 OFT Adapter Analysis'));
  console.log(chalk.blue('====================='));
  
  await checkOFT('Sepolia', OFT_SEPOLIA, WETH_SEPOLIA);
  await checkOFT('Arbitrum', OFT_ARBITRUM, WETH_ARBITRUM);
  
  console.log(chalk.yellow('\n⚠️  Known wallets:'));
  console.log(`├─ DEPLOYER: 0x28f9F5e0Ec9C6B8cdF1F3ad73847A094570c927D`);
  console.log(`└─ BACKEND: 0x2223F51659fAcC662504dcEbD4735886285ABC96`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
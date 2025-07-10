#!/usr/bin/env node
/**
 * Fix OFT peer configuration using BACKEND wallet
 */
const hre = require('hardhat');
const chalk = require('chalk');

const CONFIG = {
  sepolia: {
    oft: '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE',
    endpointId: 40161
  },
  arbitrum: {
    oft: '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B',
    endpointId: 40231
  }
};

async function main() {
  console.log(chalk.blue('🔧 Fixing OFT Peer Configuration'));
  console.log(chalk.blue('==============================='));
  
  // Use BACKEND wallet since it owns the OFT adapters
  const backendPrivateKey = process.env.BACKEND_WALLET_PRIVATE_KEY;
  if (!backendPrivateKey) {
    console.log(chalk.red('❌ BACKEND_WALLET_PRIVATE_KEY not found in .env'));
    return;
  }
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  const provider = chainId === 11155111 
    ? new hre.ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)
    : new hre.ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
    
  const signer = new hre.ethers.Wallet(backendPrivateKey, provider);
  console.log(`\nUsing BACKEND wallet: ${signer.address}`);
  
  const oftAbi = [
    'function setPeer(uint32 _eid, bytes32 _peer)',
    'function peers(uint32 eid) view returns (bytes32)',
    'function owner() view returns (address)'
  ];
  
  if (chainId === 11155111) {
    // Fix Sepolia OFT
    console.log(chalk.cyan('\n📍 On Sepolia'));
    
    const oft = new hre.ethers.Contract(CONFIG.sepolia.oft, oftAbi, signer);
    
    // Check ownership
    const owner = await oft.owner();
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(chalk.red('❌ You are not the owner of this OFT'));
      console.log(`Owner: ${owner}`);
      console.log(`You: ${signer.address}`);
      return;
    }
    
    // Set Arbitrum peer
    const arbitrumPeer = hre.ethers.zeroPadValue(CONFIG.arbitrum.oft, 32);
    console.log(`\nSetting Arbitrum peer: ${CONFIG.arbitrum.oft}`);
    
    const tx = await oft.setPeer(CONFIG.arbitrum.endpointId, arbitrumPeer);
    console.log(`Transaction: ${tx.hash}`);
    await tx.wait();
    
    // Verify
    const peer = await oft.peers(CONFIG.arbitrum.endpointId);
    console.log(chalk.green(`✅ Arbitrum peer set: ${peer}`));
    
  } else if (chainId === 421614) {
    // Fix Arbitrum OFT
    console.log(chalk.cyan('\n📍 On Arbitrum'));
    
    const oft = new hre.ethers.Contract(CONFIG.arbitrum.oft, oftAbi, signer);
    
    // Check ownership
    const owner = await oft.owner();
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(chalk.red('❌ You are not the owner of this OFT'));
      console.log(`Owner: ${owner}`);
      console.log(`You: ${signer.address}`);
      return;
    }
    
    // Set Sepolia peer
    const sepoliaPeer = hre.ethers.zeroPadValue(CONFIG.sepolia.oft, 32);
    console.log(`\nSetting Sepolia peer: ${CONFIG.sepolia.oft}`);
    
    const tx = await oft.setPeer(CONFIG.sepolia.endpointId, sepoliaPeer);
    console.log(`Transaction: ${tx.hash}`);
    await tx.wait();
    
    // Verify
    const peer = await oft.peers(CONFIG.sepolia.endpointId);
    console.log(chalk.green(`✅ Sepolia peer set: ${peer}`));
  }
  
  console.log(chalk.yellow('\n⚠️  Next: Run this script on the other network'));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
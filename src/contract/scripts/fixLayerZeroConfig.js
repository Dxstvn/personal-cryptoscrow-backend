#!/usr/bin/env node
/**
 * Fix LayerZero configuration issues
 */
const hre = require('hardhat');
const chalk = require('chalk');

// Correct addresses
const CONFIG = {
  sepolia: {
    oft: '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE',
    composer: '0x56b2C2F53497B5b8E179521De50e29F78C943B57',
    endpointId: 40161
  },
  arbitrum: {
    oft: '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B',
    composer: '0x7ffd15F8C2696d76D19145AdB856B118e087D6DA',
    endpointId: 40231
  }
};

async function fixSepoliaConfig() {
  console.log(chalk.yellow('\n📝 Fixing Sepolia OFT Configuration...'));
  
  const [signer] = await hre.ethers.getSigners();
  
  const oftAbi = [
    'function setPeer(uint32 _eid, bytes32 _peer)',
    'function peers(uint32 eid) view returns (bytes32)',
    'function owner() view returns (address)'
  ];
  
  const oft = new hre.ethers.Contract(CONFIG.sepolia.oft, oftAbi, signer);
  
  try {
    // Check ownership
    const owner = await oft.owner();
    console.log(`OFT Owner: ${owner}`);
    console.log(`Signer: ${signer.address}`);
    
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(chalk.red('❌ Not the owner of Sepolia OFT'));
      return;
    }
    
    // Set Arbitrum peer
    const arbitrumPeer = hre.ethers.zeroPadValue(CONFIG.arbitrum.oft, 32);
    console.log(`Setting Arbitrum peer: ${CONFIG.arbitrum.oft}`);
    
    const tx = await oft.setPeer(CONFIG.arbitrum.endpointId, arbitrumPeer);
    console.log(`TX: ${tx.hash}`);
    await tx.wait();
    
    // Verify
    const peer = await oft.peers(CONFIG.arbitrum.endpointId);
    console.log(chalk.green(`✅ Arbitrum peer set: ${peer}`));
    
  } catch (error) {
    console.log(chalk.red('Error:'), error.message);
  }
}

async function fixArbitrumConfig() {
  console.log(chalk.yellow('\n📝 Fixing Arbitrum Configuration...'));
  
  const [signer] = await hre.ethers.getSigners();
  
  // Fix OFT peer
  const oftAbi = [
    'function setPeer(uint32 _eid, bytes32 _peer)',
    'function peers(uint32 eid) view returns (bytes32)',
    'function owner() view returns (address)'
  ];
  
  const oft = new hre.ethers.Contract(CONFIG.arbitrum.oft, oftAbi, signer);
  
  try {
    // Check ownership
    const oftOwner = await oft.owner();
    console.log(`OFT Owner: ${oftOwner}`);
    
    if (oftOwner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(chalk.red('❌ Not the owner of Arbitrum OFT'));
    } else {
      // Set Sepolia peer
      const sepoliaPeer = hre.ethers.zeroPadValue(CONFIG.sepolia.oft, 32);
      console.log(`Setting Sepolia peer: ${CONFIG.sepolia.oft}`);
      
      const tx1 = await oft.setPeer(CONFIG.sepolia.endpointId, sepoliaPeer);
      console.log(`TX: ${tx1.hash}`);
      await tx1.wait();
      
      console.log(chalk.green('✅ Sepolia peer set'));
    }
    
    // Fix Composer authorization
    console.log('\nFixing Composer authorization...');
    
    const composerAbi = [
      'function setOFTAdapterAuthorization(address oftAdapter, bool authorized)',
      'function authorizedOFTAdapters(address) view returns (bool)',
      'function owner() view returns (address)'
    ];
    
    const composer = new hre.ethers.Contract(CONFIG.arbitrum.composer, composerAbi, signer);
    
    const composerOwner = await composer.owner();
    console.log(`Composer Owner: ${composerOwner}`);
    
    if (composerOwner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(chalk.red('❌ Not the owner of Arbitrum Composer'));
    } else {
      // Authorize OFT adapter
      console.log('Authorizing OFT adapter in composer...');
      const tx2 = await composer.setOFTAdapterAuthorization(CONFIG.arbitrum.oft, true);
      console.log(`TX: ${tx2.hash}`);
      await tx2.wait();
      
      // Verify
      const isAuth = await composer.authorizedOFTAdapters(CONFIG.arbitrum.oft);
      console.log(chalk.green(`✅ OFT authorized: ${isAuth}`));
    }
    
  } catch (error) {
    console.log(chalk.red('Error:'), error.message);
  }
}

async function main() {
  console.log(chalk.blue('🔧 Fixing LayerZero Configuration'));
  console.log(chalk.blue('================================'));
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  if (chainId === 11155111) {
    await fixSepoliaConfig();
  } else if (chainId === 421614) {
    await fixArbitrumConfig();
  } else {
    console.log(chalk.red('Unsupported network'));
  }
  
  console.log(chalk.yellow('\n⚠️  Next Steps:'));
  console.log('1. Run this script on the other network');
  console.log('2. Create a new escrow and test the complete flow');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
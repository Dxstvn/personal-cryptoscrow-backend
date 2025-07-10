#!/usr/bin/env node
/**
 * Configure deployed composers with remote addresses
 */
const hre = require('hardhat');
const chalk = require('chalk');

// Deployed addresses from previous steps
const DEPLOYED = {
  sepolia: {
    composer: '0x56b2C2F53497B5b8E179521De50e29F78C943B57',
    escrow: '0x726ca2162A5B90718EF11Ab8f294c0f30E258208' // New escrow with composer support
  },
  arbitrum: {
    composer: '0x7ffd15F8C2696d76D19145AdB856B118e087D6DA',
    escrow: '0x9749E4049F2cD6Df742E177ba1DeeAbA758eC686'
  }
};

async function configureSepoliaEscrow() {
  console.log(chalk.yellow('\n📝 Configuring Sepolia Escrow with Arbitrum Composer...'));
  
  const [signer] = await hre.ethers.getSigners();
  
  // Connect to existing escrow
  const escrowAbi = [
    'function setSwapComposerWithValidation(uint32 endpointId, address composer, string memory chainName)',
    'function swapComposers(uint32) view returns (address)',
    'function owner() view returns (address)'
  ];
  
  const escrow = new hre.ethers.Contract(DEPLOYED.sepolia.escrow, escrowAbi, signer);
  
  try {
    // Check owner
    const owner = await escrow.owner();
    console.log(`Escrow owner: ${owner}`);
    console.log(`Current signer: ${signer.address}`);
    
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      console.log(chalk.red('⚠️  Warning: You are not the owner of this escrow'));
      console.log('Attempting to set composer anyway...');
    }
    
    // Set Arbitrum composer
    const tx = await escrow.setSwapComposerWithValidation(
      40231, // Arbitrum endpoint ID
      DEPLOYED.arbitrum.composer,
      'Arbitrum'
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    
    // Verify
    const composer = await escrow.swapComposers(40231);
    console.log(chalk.green(`✅ Arbitrum composer set: ${composer}`));
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

async function configureArbitrumEscrow() {
  console.log(chalk.yellow('\n📝 Configuring Arbitrum Escrow with Sepolia Composer...'));
  
  const [signer] = await hre.ethers.getSigners();
  
  const escrowAbi = [
    'function setSwapComposerWithValidation(uint32 endpointId, address composer, string memory chainName)',
    'function swapComposers(uint32) view returns (address)'
  ];
  
  const escrow = new hre.ethers.Contract(DEPLOYED.arbitrum.escrow, escrowAbi, signer);
  
  try {
    // Set Sepolia composer
    const tx = await escrow.setSwapComposerWithValidation(
      40161, // Sepolia endpoint ID
      DEPLOYED.sepolia.composer,
      'Sepolia'
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    
    // Verify
    const composer = await escrow.swapComposers(40161);
    console.log(chalk.green(`✅ Sepolia composer set: ${composer}`));
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

async function main() {
  console.log(chalk.blue('🔧 Configuring Cross-Chain Composers'));
  console.log(chalk.blue('=================================='));
  
  // Get current network
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  if (chainId === 11155111) {
    console.log(chalk.cyan('Current network: Sepolia'));
    await configureSepoliaEscrow();
  } else if (chainId === 421614) {
    console.log(chalk.cyan('Current network: Arbitrum Sepolia'));
    await configureArbitrumEscrow();
  } else {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  
  console.log(chalk.blue('\n📋 Configuration Summary'));
  console.log(chalk.blue('======================'));
  console.log(`Sepolia Escrow: ${DEPLOYED.sepolia.escrow}`);
  console.log(`├─ Arbitrum Composer: ${DEPLOYED.arbitrum.composer}`);
  console.log(`Arbitrum Escrow: ${DEPLOYED.arbitrum.escrow}`);
  console.log(`└─ Sepolia Composer: ${DEPLOYED.sepolia.composer}`);
  
  console.log(chalk.yellow('\n⚠️  Next Steps:'));
  console.log('1. Run this script on the other network to complete configuration');
  console.log('2. Run end-to-end test to verify composer functionality');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Error:'), error);
    process.exit(1);
  });
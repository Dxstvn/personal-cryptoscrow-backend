#!/usr/bin/env node
/**
 * Deploy a fresh UniversalEscrowServiceV3 contract
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STANDARD_OFT_ADAPTERS = {
  sepolia: {
    address: '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6',
    endpointId: 40161
  },
  arbitrum: {
    address: '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B',
    endpointId: 40231
  }
};

async function deployFreshEscrow() {
  console.log(chalk.blue('🚀 Deploying Fresh UniversalEscrowServiceV3'));
  console.log(chalk.blue('=========================================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log('Deployer:', wallet.address);
  
  try {
    // Load contract artifact
    const artifactPath = path.join(__dirname, '../../contract/artifacts/contracts/UniversalEscrowServiceV3.sol/UniversalEscrowServiceV3.json');
    const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
    
    console.log('\nDeploying contract...');
    
    // Constructor parameters
    const serviceWallet = wallet.address; // Use deployer as service wallet
    const weth = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // Sepolia WETH
    const uniswapRouter = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E'; // Sepolia V3 Router
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy(serviceWallet, weth, uniswapRouter);
    
    console.log('TX:', contract.deploymentTransaction().hash);
    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log(chalk.green('✅ Contract deployed at:'), address);
    
    // Configure OFT adapters
    console.log(chalk.cyan('\n📝 Configuring OFT Adapters...'));
    
    // Set Sepolia OFT adapter
    console.log('Setting Sepolia OFT adapter...');
    const tx1 = await contract.setOFTAdapter(
      STANDARD_OFT_ADAPTERS.sepolia.endpointId,
      STANDARD_OFT_ADAPTERS.sepolia.address,
      'Sepolia'
    );
    await tx1.wait();
    console.log('✅ Sepolia OFT configured');
    
    // Set Arbitrum OFT adapter
    console.log('Setting Arbitrum OFT adapter...');
    const tx2 = await contract.setOFTAdapter(
      STANDARD_OFT_ADAPTERS.arbitrum.endpointId,
      STANDARD_OFT_ADAPTERS.arbitrum.address,
      'Arbitrum Sepolia'
    );
    await tx2.wait();
    console.log('✅ Arbitrum OFT configured');
    
    // Add deployer as condition updater
    console.log('\nAdding deployer as condition updater...');
    const tx3 = await contract.addConditionUpdater(wallet.address);
    await tx3.wait();
    console.log('✅ Condition updater added');
    
    // Verify configuration
    console.log(chalk.cyan('\n✅ Verifying Configuration:'));
    
    const escrowAbi = [
      'function owner() view returns (address)',
      'function serviceWallet() view returns (address)',
      'function oftAdapters(uint32) view returns (address)',
      'function conditionUpdaters(address) view returns (bool)'
    ];
    
    const escrow = new ethers.Contract(address, escrowAbi, provider);
    
    console.log('Owner:', await escrow.owner());
    console.log('Service Wallet:', await escrow.serviceWallet());
    console.log('Sepolia OFT:', await escrow.oftAdapters(STANDARD_OFT_ADAPTERS.sepolia.endpointId));
    console.log('Arbitrum OFT:', await escrow.oftAdapters(STANDARD_OFT_ADAPTERS.arbitrum.endpointId));
    console.log('Is Condition Updater:', await escrow.conditionUpdaters(wallet.address));
    
    // Save deployment info
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      network: 'sepolia',
      escrowContract: address,
      deployer: wallet.address,
      oftAdapters: {
        sepolia: STANDARD_OFT_ADAPTERS.sepolia.address,
        arbitrum: STANDARD_OFT_ADAPTERS.arbitrum.address
      }
    };
    
    const deploymentsDir = path.join(__dirname, 'deployments');
    await fs.mkdir(deploymentsDir, { recursive: true });
    await fs.writeFile(
      path.join(deploymentsDir, `escrow-v3-${Date.now()}.json`),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log(chalk.green('\n✅ Fresh escrow contract deployed and configured!'));
    console.log(chalk.yellow('\n📋 Next Steps:'));
    console.log(`1. Update escrowServiceV3.js with new contract address: ${address}`);
    console.log('2. Run tests with: npm run test:standard-oft');
    
    return address;
    
  } catch (error) {
    console.log(chalk.red('❌ Deployment failed:'), error.message);
    throw error;
  }
}

// Run deployment
deployFreshEscrow().catch(console.error);
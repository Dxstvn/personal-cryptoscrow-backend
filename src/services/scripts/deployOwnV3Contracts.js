#!/usr/bin/env node
/**
 * Deploy your own V3 contracts for testing
 * This gives you full ownership and authorization control
 */

import { Contract, ContractFactory } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deployV3Contract(chainId) {
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const config = service.getChainConfig(chainId);
  if (!config) {
    throw new Error(`Chain ${chainId} not supported`);
  }
  
  console.log(chalk.cyan(`\n📦 Deploying on ${config.name}`));
  
  try {
    const wallet = await service.getWallet(chainId);
    const balance = await wallet.provider.getBalance(wallet.address);
    
    console.log(`Deployer: ${wallet.address}`);
    console.log(`Balance: ${(Number(balance) / 1e18).toFixed(6)} ETH`);
    
    const minBalance = BigInt('10000000000000000'); // 0.01 ETH in wei
    if (balance < minBalance) {
      throw new Error('Insufficient balance for deployment. Need at least 0.01 ETH');
    }
    
    // Load contract artifact
    const artifactPath = path.join(__dirname, '../../contract/artifacts/contracts/UniversalEscrowServiceV3.sol/UniversalEscrowServiceV3.json');
    
    // Check if artifact exists
    try {
      await fs.access(artifactPath);
    } catch {
      throw new Error(`Contract artifact not found. Please compile contracts first: cd src/contract && npx hardhat compile`);
    }
    
    const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
    
    if (!artifact.abi || !artifact.bytecode) {
      throw new Error('Invalid contract artifact. Missing ABI or bytecode.');
    }
    
    // Deploy contract
    console.log('Deploying UniversalEscrowServiceV3...');
    console.log(`Service Wallet: ${wallet.address}`);
    console.log(`WETH: ${config.weth}`);
    console.log(`Uniswap Router: ${config.uniswapRouter}`);
    
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    const contract = await factory.deploy(
      wallet.address, // Service wallet (you)
      config.weth,
      config.uniswapRouter
    );
    
    console.log(`TX: ${config.explorerUrl}/tx/${contract.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation...');
    
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    
    console.log(chalk.green(`✅ Deployed at: ${contractAddress}`));
    
    // Set up chain mappings
    console.log('Setting up chain mappings...');
    const tx1 = await contract.setChainMapping(11155111, 40161); // Sepolia
    await tx1.wait();
    const tx2 = await contract.setChainMapping(421614, 40231); // Arbitrum Sepolia
    await tx2.wait();
    const tx3 = await contract.setChainMapping(80002, 40267); // Polygon Amoy
    await tx3.wait();
    
    // Set OFT adapters
    console.log('Setting OFT adapters...');
    const tx4 = await contract.setOFTAdapter(40161, config.oftAdapter);
    await tx4.wait();
    const tx5 = await contract.setOFTAdapter(40231, config.oftAdapter);
    await tx5.wait();
    const tx6 = await contract.setOFTAdapter(40267, config.oftAdapter);
    await tx6.wait();
    
    // Add yourself as condition updater
    console.log('Adding you as condition updater...');
    const tx7 = await contract.setConditionUpdater(wallet.address, true);
    await tx7.wait();
    
    console.log(chalk.green('✅ Contract fully configured!'));
    
    return {
      chainId,
      chainName: config.name,
      contractAddress,
      owner: wallet.address,
      oftAdapter: config.oftAdapter,
      weth: config.weth,
      uniswapRouter: config.uniswapRouter
    };
    
  } catch (error) {
    console.log(chalk.red(`❌ Deployment failed: ${error.message}`));
    throw error;
  }
}

async function main() {
  console.log(chalk.blue('🚀 Deploy Your Own V3 Contracts'));
  console.log(chalk.blue('================================'));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('\n❌ No BACKEND_WALLET_PRIVATE_KEY in .env'));
    process.exit(1);
  }
  
  console.log(chalk.yellow('\n⚠️  This will deploy new contracts where YOU are the owner'));
  console.log('Benefits:');
  console.log('- Full authorization control');
  console.log('- Can update conditions');
  console.log('- Can test all features');
  console.log('\nCosts:');
  console.log('- Gas fees for deployment (~0.005-0.01 ETH per chain)');
  console.log('- Different addresses than existing contracts');
  
  const args = process.argv.slice(2);
  
  if (args[0] === '--help') {
    console.log('\nUsage: node deployOwnV3Contracts.js [options]');
    console.log('\nOptions:');
    console.log('  --chain <id>    Deploy to specific chain');
    console.log('  --all           Deploy to all supported chains');
    console.log('\nChain IDs:');
    console.log('  11155111 - Sepolia');
    console.log('  421614   - Arbitrum Sepolia');
    console.log('  80002    - Polygon Amoy');
    process.exit(0);
  }
  
  const deployments = [];
  
  try {
    if (args[0] === '--all') {
      console.log(chalk.cyan('\nDeploying to all chains...'));
      for (const chainId of [11155111, 421614, 80002]) {
        const deployment = await deployV3Contract(chainId);
        deployments.push(deployment);
      }
    } else if (args[0] === '--chain' && args[1]) {
      const chainId = parseInt(args[1]);
      const deployment = await deployV3Contract(chainId);
      deployments.push(deployment);
    } else {
      console.log('\nWhich chain to deploy to?');
      console.log('1. Sepolia (11155111)');
      console.log('2. Arbitrum Sepolia (421614)');
      console.log('3. Polygon Amoy (80002)');
      console.log('\nRun with --chain <id> or --all');
      process.exit(0);
    }
    
    // Save deployment info
    if (deployments.length > 0) {
      const deploymentFile = path.join(__dirname, '../../deployments/my-v3-deployment.json');
      await fs.writeFile(deploymentFile, JSON.stringify({
        deployedAt: new Date().toISOString(),
        deployedBy: deployments[0].owner,
        contracts: deployments
      }, null, 2));
      
      console.log(chalk.green('\n✅ Deployment Summary:'));
      deployments.forEach(d => {
        console.log(`\n${d.chainName}:`);
        console.log(`  Contract: ${d.contractAddress}`);
        console.log(`  Owner: ${d.owner} (YOU)`);
        console.log(`  You are authorized: ✅`);
      });
      
      console.log(chalk.cyan('\n📝 Next Steps:'));
      console.log('1. Update escrowServiceV3.js with your contract addresses');
      console.log('2. Run verification tests with full authorization');
      console.log('3. Your deployment info saved to:', chalk.gray('src/contract/deployments/my-v3-deployment.json'));
    }
    
  } catch (error) {
    console.log(chalk.red('\n❌ Deployment failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
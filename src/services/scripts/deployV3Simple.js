#!/usr/bin/env node
/**
 * Simplified V3 deployment script with better error handling
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

// Chain configurations
const CHAINS = {
  11155111: {
    name: 'Sepolia',
    rpc: process.env.SEPOLIA_RPC_URL,
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    explorer: 'https://sepolia.etherscan.io'
  },
  421614: {
    name: 'Arbitrum Sepolia',
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    explorer: 'https://sepolia.arbiscan.io'
  },
  80002: {
    name: 'Polygon Amoy',
    rpc: process.env.POLYGON_AMOY_RPC_URL,
    weth: '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9',
    router: '0x8954AfA98594b838bda56FE4C12a09D7739D179b',
    explorer: 'https://amoy.polygonscan.com'
  }
};

async function deployV3(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) {
    throw new Error(`Chain ${chainId} not supported`);
  }
  
  if (!chain.rpc) {
    throw new Error(`No RPC URL for ${chain.name}. Set ${chain.name.toUpperCase().replace(/\s+/g, '_')}_RPC_URL in .env`);
  }
  
  console.log(chalk.cyan(`\n📦 Deploying on ${chain.name}`));
  
  try {
    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(chain.rpc);
    const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
    
    // Check balance
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balance);
    
    console.log(`Deployer: ${wallet.address}`);
    console.log(`Balance: ${balanceEth} ETH`);
    
    if (parseFloat(balanceEth) < 0.01) {
      throw new Error('Insufficient balance. Need at least 0.01 ETH');
    }
    
    // Load artifact
    const artifactPath = path.join(__dirname, '../../contract/artifacts/contracts/UniversalEscrowServiceV3.sol/UniversalEscrowServiceV3.json');
    const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
    
    // Deploy
    console.log('\nDeploying contract...');
    console.log(`- Service wallet: ${wallet.address}`);
    console.log(`- WETH: ${chain.weth}`);
    console.log(`- Router: ${chain.router}`);
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy(
      wallet.address,
      chain.weth,
      chain.router
    );
    
    console.log(`\nTransaction: ${chain.explorer}/tx/${contract.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation...');
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log(chalk.green(`\n✅ Contract deployed at: ${address}`));
    
    // Configure the contract
    console.log('\nConfiguring contract...');
    
    // Set chain mappings
    const mappings = [
      { chainId: 11155111, endpointId: 40161 },
      { chainId: 421614, endpointId: 40231 },
      { chainId: 80002, endpointId: 40267 }
    ];
    
    for (const m of mappings) {
      console.log(`- Setting chain mapping: ${m.chainId} -> ${m.endpointId}`);
      const tx = await contract.setChainMapping(m.chainId, m.endpointId);
      await tx.wait();
    }
    
    // Set OFT adapters (using existing ones)
    const adapters = [
      { eid: 40161, adapter: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4', name: 'Sepolia' },
      { eid: 40231, adapter: '0xbaa46938E3110187ED6a55EE139312b28c943d00', name: 'Arbitrum Sepolia' },
      { eid: 40267, adapter: '0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725', name: 'Polygon Amoy' }
    ];
    
    for (const config of adapters) {
      console.log(`- Setting OFT adapter for ${config.name}`);
      const tx = await contract.setOFTAdapter(config.eid, config.adapter, config.name);
      await tx.wait();
    }
    
    // Add deployer as condition updater
    console.log(`- Adding you as condition updater`);
    const tx = await contract.setConditionUpdater(wallet.address, true);
    await tx.wait();
    
    console.log(chalk.green('\n✅ Contract fully configured!'));
    
    return {
      chainId,
      chainName: chain.name,
      address,
      owner: wallet.address,
      weth: chain.weth,
      router: chain.router,
      explorer: chain.explorer
    };
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('You need more ETH to deploy the contract');
    }
    throw error;
  }
}

async function main() {
  console.log(chalk.blue('🚀 Deploy Your Own V3 Contract'));
  console.log(chalk.blue('=============================='));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.error(chalk.red('\n❌ BACKEND_WALLET_PRIVATE_KEY not set in .env'));
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  const chainId = args[0] ? parseInt(args[0]) : 11155111;
  
  if (!CHAINS[chainId]) {
    console.error(chalk.red(`\n❌ Invalid chain ID: ${chainId}`));
    console.log('\nSupported chains:');
    Object.entries(CHAINS).forEach(([id, chain]) => {
      console.log(`  ${id} - ${chain.name}`);
    });
    process.exit(1);
  }
  
  try {
    const deployment = await deployV3(chainId);
    
    // Save deployment info
    const deploymentFile = path.join(__dirname, '../../../my-v3-deployment.json');
    const deployments = {};
    
    try {
      const existing = await fs.readFile(deploymentFile, 'utf8');
      Object.assign(deployments, JSON.parse(existing));
    } catch {}
    
    deployments[chainId] = deployment;
    deployments.timestamp = new Date().toISOString();
    
    await fs.writeFile(deploymentFile, JSON.stringify(deployments, null, 2));
    
    console.log(chalk.cyan('\n📝 Summary:'));
    console.log(`Chain: ${deployment.chainName}`);
    console.log(`Contract: ${deployment.address}`);
    console.log(`Owner: ${deployment.owner} (YOU)`);
    console.log(`Explorer: ${deployment.explorer}/address/${deployment.address}`);
    console.log(`\nDeployment saved to: my-v3-deployment.json`);
    
    console.log(chalk.cyan('\n✨ Next Steps:'));
    console.log('1. Update escrowServiceV3.js with your new contract address');
    console.log('2. Run cross-chain verification: npm run verify:crosschain');
    
  } catch (error) {
    console.error(chalk.red('\nDeployment failed'));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
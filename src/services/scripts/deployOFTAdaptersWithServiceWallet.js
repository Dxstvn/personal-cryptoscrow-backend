#!/usr/bin/env node
/**
 * Deploy OFT Adapters with Backend Service Wallet as Owner
 * This ensures the service wallet has full control over authorization
 */

import { ethers, parseEther, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Your escrow contract that needs authorization
const YOUR_ESCROW_CONTRACT = '0x6857A4be630282eE9B270CD99BD0DCDB59642e55';

const CHAINS = {
  sepolia: {
    name: 'Sepolia',
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    usdt: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    usdt: '0xf3b4B65C9c0EA8cD58F0E864C4Fe49A2a87E27E4'
  }
};

async function deployOFTAdapter(chain, wallet) {
  console.log(chalk.cyan(`\n📦 Deploying OFT Adapter on ${chain.name}...`));
  
  // Load the OFT adapter contract ABI and bytecode
  const contractPath = path.join(__dirname, '../../contract/artifacts/contracts/SimplePropertyOFTAdapter.sol/SimplePropertyOFTAdapter.json');
  const contractJson = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  
  // Deploy the contract
  const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, wallet);
  
  const oftAdapter = await factory.deploy(
    chain.weth,
    chain.usdc,
    chain.usdt,
    chain.layerZeroEndpoint,
    wallet.address, // delegate = deployer
    ethers.ZeroAddress // dex aggregator (can set later)
  );
  
  console.log(`⏳ Deploying to ${chain.name}...`);
  console.log(`   TX: https://${chain.name.toLowerCase().replace(' ', '-')}.etherscan.io/tx/${oftAdapter.deploymentTransaction().hash}`);
  
  await oftAdapter.waitForDeployment();
  const address = await oftAdapter.getAddress();
  
  console.log(chalk.green(`✅ OFT Adapter deployed at: ${address}`));
  console.log(`   Owner: ${wallet.address} (your service wallet)`);
  
  return { address, contract: oftAdapter };
}

async function configureOFTAdapter(oftAdapter, chain, escrowContract) {
  console.log(chalk.cyan(`\n⚙️  Configuring OFT Adapter...`));
  
  // Authorize the escrow contract
  console.log(`   Authorizing escrow contract: ${escrowContract}`);
  const authTx = await oftAdapter.setAuthorizedReleaseCaller(escrowContract, true);
  await authTx.wait();
  console.log(chalk.green(`   ✅ Escrow contract authorized`));
  
  // Set bridge token priorities (optional)
  console.log(`   Setting bridge token priorities...`);
  const priorityTx = await oftAdapter.setBridgeTokenPriority(chain.weth, 1000);
  await priorityTx.wait();
  console.log(chalk.green(`   ✅ WETH priority set to 1000`));
  
  return true;
}

async function updateEscrowContract(chain, wallet, escrowAddress, oftAdapterAddress) {
  console.log(chalk.cyan(`\n🔄 Updating Escrow Contract with new OFT Adapter...`));
  
  const escrowAbi = [
    'function setOFTAdapter(uint32 endpointId, address adapter, string chainName)',
    'function owner() view returns (address)',
    'function oftAdapters(uint32) view returns (address)'
  ];
  
  const escrow = new ethers.Contract(escrowAddress, escrowAbi, wallet);
  
  // Check if we're the owner
  const owner = await escrow.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log(chalk.yellow(`⚠️  You're not the escrow owner. Owner is: ${owner}`));
    return false;
  }
  
  // Set the OFT adapter
  const endpointId = chain.name === 'Sepolia' ? 40161 : 40231;
  const tx = await escrow.setOFTAdapter(endpointId, oftAdapterAddress, chain.name);
  await tx.wait();
  
  console.log(chalk.green(`✅ OFT Adapter set on escrow contract`));
  
  // Verify
  const setAdapter = await escrow.oftAdapters(endpointId);
  console.log(`   Verified: ${setAdapter === oftAdapterAddress ? '✅' : '❌'}`);
  
  return true;
}

async function main() {
  console.log(chalk.blue('🚀 OFT Adapter Deployment with Service Wallet as Owner'));
  console.log(chalk.blue('====================================================='));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('❌ BACKEND_WALLET_PRIVATE_KEY not set'));
    process.exit(1);
  }
  
  const deployments = {};
  
  try {
    // Step 1: Check current setup
    console.log(chalk.cyan('\n📊 Current Setup:'));
    const sepoliaProvider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
    const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, sepoliaProvider);
    
    console.log(`Service Wallet: ${wallet.address}`);
    console.log(`Escrow Contract: ${YOUR_ESCROW_CONTRACT}`);
    
    const balance = await sepoliaProvider.getBalance(wallet.address);
    console.log(`Wallet Balance: ${formatEther(balance)} ETH`);
    
    if (balance < parseEther('0.1')) {
      console.log(chalk.yellow('\n⚠️  Low balance! You need at least 0.1 ETH for deployment'));
    }
    
    // Step 2: Deploy OFT Adapters
    console.log(chalk.cyan('\n📦 Deploying OFT Adapters...'));
    console.log('This will deploy OFT adapters where YOUR service wallet is the owner');
    
    // Deploy on Sepolia
    const sepoliaOFT = await deployOFTAdapter(CHAINS.sepolia, wallet);
    deployments.sepolia = sepoliaOFT;
    
    // Configure Sepolia OFT
    await configureOFTAdapter(sepoliaOFT.contract, CHAINS.sepolia, YOUR_ESCROW_CONTRACT);
    
    // Deploy on Arbitrum Sepolia
    const arbProvider = new ethers.JsonRpcProvider(CHAINS.arbitrumSepolia.rpcUrl);
    const arbWallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, arbProvider);
    
    const arbOFT = await deployOFTAdapter(CHAINS.arbitrumSepolia, arbWallet);
    deployments.arbitrumSepolia = arbOFT;
    
    // Configure Arbitrum OFT
    await configureOFTAdapter(arbOFT.contract, CHAINS.arbitrumSepolia, YOUR_ESCROW_CONTRACT);
    
    // Step 3: Update escrow contract with new OFT adapters
    console.log(chalk.cyan('\n🔄 Updating Escrow Contract...'));
    
    await updateEscrowContract(CHAINS.sepolia, wallet, YOUR_ESCROW_CONTRACT, sepoliaOFT.address);
    await updateEscrowContract(CHAINS.arbitrumSepolia, arbWallet, YOUR_ESCROW_CONTRACT, arbOFT.address);
    
    // Step 4: Save deployment info
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      serviceWallet: wallet.address,
      escrowContract: YOUR_ESCROW_CONTRACT,
      oftAdapters: {
        sepolia: {
          address: deployments.sepolia.address,
          owner: wallet.address,
          chain: 'Sepolia',
          chainId: 11155111
        },
        arbitrumSepolia: {
          address: deployments.arbitrumSepolia.address,
          owner: wallet.address,
          chain: 'Arbitrum Sepolia',
          chainId: 421614
        }
      }
    };
    
    const deploymentPath = path.join(__dirname, 'deployments', 'oft-adapters-deployment.json');
    await fs.mkdir(path.dirname(deploymentPath), { recursive: true });
    await fs.writeFile(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    
    // Summary
    console.log(chalk.green('\n✅ OFT Adapters Successfully Deployed!'));
    console.log(chalk.green('====================================='));
    console.log('\n📋 Deployment Summary:');
    console.log(`Service Wallet (Owner): ${wallet.address}`);
    console.log(`\nSepolia OFT Adapter: ${deployments.sepolia.address}`);
    console.log(`Arbitrum OFT Adapter: ${deployments.arbitrumSepolia.address}`);
    console.log(`\nYour escrow contract is now authorized on both OFT adapters!`);
    
    console.log(chalk.cyan('\n🎯 Next Steps:'));
    console.log('1. Update your .env file with the new OFT adapter addresses');
    console.log('2. Run the cross-chain verification: npm run verify:crosschain:yours');
    console.log('3. Your service wallet now controls all authorizations!');
    
    console.log(chalk.yellow('\n⚠️  Important for Production:'));
    console.log('- Keep your service wallet private key secure');
    console.log('- Consider using a multisig for the OFT adapter owner');
    console.log('- Monitor the OFT adapters for unauthorized access');
    
  } catch (error) {
    console.log(chalk.red('\n❌ Deployment failed:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
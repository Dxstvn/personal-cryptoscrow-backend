#!/usr/bin/env node
/**
 * Deploy Production OFT Adapters with Complete Configuration
 * Includes trusted remotes, peer configuration, and full authorization
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

// Your escrow contracts
const ESCROW_CONTRACTS = {
  sepolia: '0x6857A4be630282eE9B270CD99BD0DCDB59642e55',
  arbitrumSepolia: '0x6857A4be630282eE9B270CD99BD0DCDB59642e55' // Same contract address on both chains
};

const CHAINS = {
  sepolia: {
    name: 'Sepolia',
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    layerZeroEndpointId: 40161,
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    usdt: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    explorer: 'https://sepolia.etherscan.io'
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    layerZeroEndpointId: 40231,
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    usdt: '0xf3b4b65c9c0ea8cd58f0e864c4fe49a2a87e27e4', // Fixed checksum
    explorer: 'https://sepolia.arbiscan.io'
  }
};

async function deployOFTAdapter(chain, wallet) {
  console.log(chalk.cyan(`\n📦 Deploying OFT Adapter on ${chain.name}...`));
  
  const contractPath = path.join(__dirname, '../../contract/artifacts/contracts/SimplePropertyOFTAdapter.sol/SimplePropertyOFTAdapter.json');
  const contractJson = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  
  const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, wallet);
  
  const oftAdapter = await factory.deploy(
    chain.weth,
    chain.usdc,
    chain.usdt,
    chain.layerZeroEndpoint,
    wallet.address,
    ethers.ZeroAddress
  );
  
  console.log(`⏳ Deploying to ${chain.name}...`);
  console.log(`   TX: ${chain.explorer}/tx/${oftAdapter.deploymentTransaction().hash}`);
  
  await oftAdapter.waitForDeployment();
  const address = await oftAdapter.getAddress();
  
  console.log(chalk.green(`✅ OFT Adapter deployed at: ${address}`));
  
  return { address, contract: oftAdapter };
}

async function configureTrustedRemotes(deployments, wallet) {
  console.log(chalk.cyan('\n🔗 Configuring Trusted Remotes (Cross-Chain Peers)...'));
  
  // Configure Sepolia OFT to trust Arbitrum OFT
  console.log('\n1. Configuring Sepolia → Arbitrum trust...');
  const sepoliaProvider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  
  const setPeerAbi = ['function setPeer(uint32 eid, bytes32 peer)'];
  const sepoliaOFT = new ethers.Contract(deployments.sepolia.address, setPeerAbi, sepoliaWallet);
  
  // Convert Arbitrum OFT address to bytes32
  const arbPeerBytes32 = ethers.zeroPadValue(deployments.arbitrumSepolia.address, 32);
  
  const tx1 = await sepoliaOFT.setPeer(
    CHAINS.arbitrumSepolia.layerZeroEndpointId,
    arbPeerBytes32
  );
  await tx1.wait();
  console.log(chalk.green('   ✅ Sepolia now trusts Arbitrum OFT'));
  
  // Configure Arbitrum OFT to trust Sepolia OFT
  console.log('\n2. Configuring Arbitrum → Sepolia trust...');
  const arbProvider = new ethers.JsonRpcProvider(CHAINS.arbitrumSepolia.rpcUrl);
  const arbWallet = wallet.connect(arbProvider);
  
  const arbOFT = new ethers.Contract(deployments.arbitrumSepolia.address, setPeerAbi, arbWallet);
  
  // Convert Sepolia OFT address to bytes32
  const sepoliaPeerBytes32 = ethers.zeroPadValue(deployments.sepolia.address, 32);
  
  const tx2 = await arbOFT.setPeer(
    CHAINS.sepolia.layerZeroEndpointId,
    sepoliaPeerBytes32
  );
  await tx2.wait();
  console.log(chalk.green('   ✅ Arbitrum now trusts Sepolia OFT'));
  
  return true;
}

async function authorizeEscrowContracts(deployments, wallet) {
  console.log(chalk.cyan('\n🔐 Authorizing Escrow Contracts...'));
  
  const authAbi = ['function setAuthorizedReleaseCaller(address caller, bool authorized)'];
  
  // Authorize on Sepolia
  console.log('\n1. Authorizing on Sepolia OFT...');
  const sepoliaProvider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const sepoliaOFT = new ethers.Contract(deployments.sepolia.address, authAbi, sepoliaWallet);
  
  const tx1 = await sepoliaOFT.setAuthorizedReleaseCaller(ESCROW_CONTRACTS.sepolia, true);
  await tx1.wait();
  console.log(chalk.green(`   ✅ Authorized: ${ESCROW_CONTRACTS.sepolia}`));
  
  // Authorize on Arbitrum
  console.log('\n2. Authorizing on Arbitrum OFT...');
  const arbProvider = new ethers.JsonRpcProvider(CHAINS.arbitrumSepolia.rpcUrl);
  const arbWallet = wallet.connect(arbProvider);
  const arbOFT = new ethers.Contract(deployments.arbitrumSepolia.address, authAbi, arbWallet);
  
  const tx2 = await arbOFT.setAuthorizedReleaseCaller(ESCROW_CONTRACTS.arbitrumSepolia, true);
  await tx2.wait();
  console.log(chalk.green(`   ✅ Authorized: ${ESCROW_CONTRACTS.arbitrumSepolia}`));
  
  return true;
}

async function updateEscrowContracts(deployments, wallet) {
  console.log(chalk.cyan('\n🔄 Updating Escrow Contracts with New OFT Adapters...'));
  
  const escrowAbi = [
    'function setOFTAdapter(uint32 endpointId, address adapter, string chainName)',
    'function owner() view returns (address)',
    'function oftAdapters(uint32) view returns (address)'
  ];
  
  // Update Sepolia escrow
  console.log('\n1. Updating Sepolia escrow contract...');
  const sepoliaProvider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const sepoliaEscrow = new ethers.Contract(ESCROW_CONTRACTS.sepolia, escrowAbi, sepoliaWallet);
  
  // Check ownership
  const sepoliaOwner = await sepoliaEscrow.owner();
  if (sepoliaOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log(chalk.yellow(`   ⚠️  You don't own the Sepolia escrow. Owner: ${sepoliaOwner}`));
    console.log('   Skipping escrow update on Sepolia');
  } else {
    // Set Arbitrum OFT adapter
    const tx1 = await sepoliaEscrow.setOFTAdapter(
      CHAINS.arbitrumSepolia.layerZeroEndpointId,
      deployments.arbitrumSepolia.address,
      CHAINS.arbitrumSepolia.name
    );
    await tx1.wait();
    console.log(chalk.green('   ✅ Arbitrum OFT adapter set'));
    
    // Set Sepolia OFT adapter (for same-chain operations)
    const tx2 = await sepoliaEscrow.setOFTAdapter(
      CHAINS.sepolia.layerZeroEndpointId,
      deployments.sepolia.address,
      CHAINS.sepolia.name
    );
    await tx2.wait();
    console.log(chalk.green('   ✅ Sepolia OFT adapter set'));
  }
  
  return true;
}

async function verifyDeployment(deployments) {
  console.log(chalk.cyan('\n✅ Verifying Deployment...'));
  
  const verifyAbi = [
    'function owner() view returns (address)',
    'function authorizedReleaseCallers(address) view returns (bool)',
    'function peers(uint32) view returns (bytes32)'
  ];
  
  // Verify Sepolia
  console.log('\n1. Sepolia OFT Adapter:');
  const sepoliaProvider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
  const sepoliaOFT = new ethers.Contract(deployments.sepolia.address, verifyAbi, sepoliaProvider);
  
  const sepoliaOwner = await sepoliaOFT.owner();
  const sepoliaAuth = await sepoliaOFT.authorizedReleaseCallers(ESCROW_CONTRACTS.sepolia);
  const sepoliaPeer = await sepoliaOFT.peers(CHAINS.arbitrumSepolia.layerZeroEndpointId);
  
  console.log(`   Owner: ${sepoliaOwner}`);
  console.log(`   Escrow Authorized: ${sepoliaAuth ? chalk.green('✅') : chalk.red('❌')}`);
  console.log(`   Arbitrum Peer Set: ${sepoliaPeer !== ethers.ZeroHash ? chalk.green('✅') : chalk.red('❌')}`);
  
  // Verify Arbitrum
  console.log('\n2. Arbitrum OFT Adapter:');
  const arbProvider = new ethers.JsonRpcProvider(CHAINS.arbitrumSepolia.rpcUrl);
  const arbOFT = new ethers.Contract(deployments.arbitrumSepolia.address, verifyAbi, arbProvider);
  
  const arbOwner = await arbOFT.owner();
  const arbAuth = await arbOFT.authorizedReleaseCallers(ESCROW_CONTRACTS.arbitrumSepolia);
  const arbPeer = await arbOFT.peers(CHAINS.sepolia.layerZeroEndpointId);
  
  console.log(`   Owner: ${arbOwner}`);
  console.log(`   Escrow Authorized: ${arbAuth ? chalk.green('✅') : chalk.red('❌')}`);
  console.log(`   Sepolia Peer Set: ${arbPeer !== ethers.ZeroHash ? chalk.green('✅') : chalk.red('❌')}`);
  
  return true;
}

async function main() {
  console.log(chalk.blue('🚀 Production OFT Adapter Deployment'));
  console.log(chalk.blue('==================================='));
  
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    console.log(chalk.red('❌ BACKEND_WALLET_PRIVATE_KEY not set'));
    process.exit(1);
  }
  
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  const deployments = {};
  
  try {
    // Check balances
    console.log(chalk.cyan('\n💰 Checking Balances...'));
    const sepoliaProvider = new ethers.JsonRpcProvider(CHAINS.sepolia.rpcUrl);
    const arbProvider = new ethers.JsonRpcProvider(CHAINS.arbitrumSepolia.rpcUrl);
    
    const sepoliaBalance = await sepoliaProvider.getBalance(wallet.address);
    const arbBalance = await arbProvider.getBalance(wallet.address);
    
    console.log(`Service Wallet: ${wallet.address}`);
    console.log(`Sepolia Balance: ${formatEther(sepoliaBalance)} ETH`);
    console.log(`Arbitrum Balance: ${formatEther(arbBalance)} ETH`);
    
    if (sepoliaBalance < parseEther('0.05') || arbBalance < parseEther('0.05')) {
      console.log(chalk.yellow('\n⚠️  Low balance! Ensure you have at least 0.05 ETH on each chain'));
    }
    
    // Deploy OFT Adapters
    console.log(chalk.cyan('\n🚀 Step 1: Deploying OFT Adapters...'));
    
    const sepoliaWallet = wallet.connect(sepoliaProvider);
    deployments.sepolia = await deployOFTAdapter(CHAINS.sepolia, sepoliaWallet);
    
    const arbWallet = wallet.connect(arbProvider);
    deployments.arbitrumSepolia = await deployOFTAdapter(CHAINS.arbitrumSepolia, arbWallet);
    
    // Configure trusted remotes
    console.log(chalk.cyan('\n🚀 Step 2: Configuring Cross-Chain Trust...'));
    await configureTrustedRemotes(deployments, wallet);
    
    // Authorize escrow contracts
    console.log(chalk.cyan('\n🚀 Step 3: Authorizing Escrow Contracts...'));
    await authorizeEscrowContracts(deployments, wallet);
    
    // Update escrow contracts
    console.log(chalk.cyan('\n🚀 Step 4: Updating Escrow Contracts...'));
    await updateEscrowContracts(deployments, wallet);
    
    // Verify deployment
    console.log(chalk.cyan('\n🚀 Step 5: Verification...'));
    await verifyDeployment(deployments);
    
    // Save deployment info
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      serviceWallet: wallet.address,
      escrowContracts: ESCROW_CONTRACTS,
      oftAdapters: {
        sepolia: {
          address: deployments.sepolia.address,
          chainId: CHAINS.sepolia.chainId,
          layerZeroEndpointId: CHAINS.sepolia.layerZeroEndpointId,
          explorer: `${CHAINS.sepolia.explorer}/address/${deployments.sepolia.address}`
        },
        arbitrumSepolia: {
          address: deployments.arbitrumSepolia.address,
          chainId: CHAINS.arbitrumSepolia.chainId,
          layerZeroEndpointId: CHAINS.arbitrumSepolia.layerZeroEndpointId,
          explorer: `${CHAINS.arbitrumSepolia.explorer}/address/${deployments.arbitrumSepolia.address}`
        }
      },
      trustedRemotes: {
        sepolia: `Trusts Arbitrum OFT at ${deployments.arbitrumSepolia.address}`,
        arbitrumSepolia: `Trusts Sepolia OFT at ${deployments.sepolia.address}`
      }
    };
    
    const deploymentPath = path.join(__dirname, 'deployments', 'production-oft-deployment.json');
    await fs.mkdir(path.dirname(deploymentPath), { recursive: true });
    await fs.writeFile(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    
    // Generate configuration updates
    console.log(chalk.green('\n✅ PRODUCTION OFT ADAPTERS DEPLOYED SUCCESSFULLY!'));
    console.log(chalk.green('=============================================='));
    
    console.log(chalk.cyan('\n📝 Update escrowServiceV3.js:'));
    console.log(chalk.gray('// Sepolia configuration'));
    console.log(`11155111: {`);
    console.log(`  ...existing config,`);
    console.log(chalk.yellow(`  oftAdapter: '${deployments.sepolia.address}',`));
    console.log(`}`);
    
    console.log(chalk.gray('\n// Arbitrum Sepolia configuration'));
    console.log(`421614: {`);
    console.log(`  ...existing config,`);
    console.log(chalk.yellow(`  oftAdapter: '${deployments.arbitrumSepolia.address}',`));
    console.log(`}`);
    
    console.log(chalk.cyan('\n📝 Update .env file:'));
    console.log(chalk.yellow(`SEPOLIA_OFT_ADAPTER=${deployments.sepolia.address}`));
    console.log(chalk.yellow(`ARBITRUM_SEPOLIA_OFT_ADAPTER=${deployments.arbitrumSepolia.address}`));
    
    console.log(chalk.cyan('\n🎯 Next Steps:'));
    console.log('1. Update escrowServiceV3.js with new OFT addresses');
    console.log('2. Update .env with new OFT addresses');
    console.log('3. Run: ' + chalk.green('npm run verify:crosschain:yours'));
    
    console.log(chalk.green('\n✅ Production Setup Complete:'));
    console.log('- OFT Adapters deployed and owned by your service wallet');
    console.log('- Cross-chain trust established (trusted remotes configured)');
    console.log('- Escrow contracts authorized');
    console.log('- Ready for cross-chain transfers!');
    
  } catch (error) {
    console.log(chalk.red('\n❌ Deployment failed:'), error.message);
    console.log(error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
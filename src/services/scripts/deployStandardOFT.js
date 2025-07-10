#!/usr/bin/env node
import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deploy() {
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const arbitrumProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY);
  
  // Load compiled contract
  const contractPath = path.join(__dirname, '../../contract/artifacts/contracts/StandardWETHOFTAdapter.sol/StandardWETHOFTAdapter.json');
  const contractJson = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  
  console.log(chalk.blue('Deploying Standard WETH OFT Adapters...'));
  
  // Deploy on Sepolia
  console.log(chalk.cyan('\nDeploying on Sepolia...'));
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const sepoliaFactory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, sepoliaWallet);
  
  const sepoliaOFT = await sepoliaFactory.deploy(
    '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH address
    '0x6EDCE65403992e310A62460808c4b910D972f10f', // LayerZero endpoint
    wallet.address // delegate
  );
  
  await sepoliaOFT.waitForDeployment();
  const sepoliaAddress = await sepoliaOFT.getAddress();
  console.log(chalk.green('✅ Sepolia OFT deployed at:', sepoliaAddress));
  
  // Deploy on Arbitrum
  console.log(chalk.cyan('\nDeploying on Arbitrum Sepolia...'));
  const arbitrumWallet = wallet.connect(arbitrumProvider);
  const arbitrumFactory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, arbitrumWallet);
  
  const arbitrumOFT = await arbitrumFactory.deploy(
    '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', // WETH address
    '0x6EDCE65403992e310A62460808c4b910D972f10f', // LayerZero endpoint
    wallet.address // delegate
  );
  
  await arbitrumOFT.waitForDeployment();
  const arbitrumAddress = await arbitrumOFT.getAddress();
  console.log(chalk.green('✅ Arbitrum OFT deployed at:', arbitrumAddress));
  
  // Configure peers
  console.log(chalk.cyan('\n🔗 Configuring Peers...'));
  
  const setPeerAbi = ['function setPeer(uint32 eid, bytes32 peer)'];
  
  // Sepolia -> Arbitrum
  const sepoliaContract = new ethers.Contract(sepoliaAddress, setPeerAbi, sepoliaWallet);
  await sepoliaContract.setPeer(
    40231,
    ethers.zeroPadValue(arbitrumAddress, 32)
  );
  console.log('✅ Sepolia -> Arbitrum peer set');
  
  // Arbitrum -> Sepolia
  const arbitrumContract = new ethers.Contract(arbitrumAddress, setPeerAbi, arbitrumWallet);
  await arbitrumContract.setPeer(
    40161,
    ethers.zeroPadValue(sepoliaAddress, 32)
  );
  console.log('✅ Arbitrum -> Sepolia peer set');
  
  console.log(chalk.green('\n✅ Deployment Complete!'));
  console.log('Sepolia OFT:', sepoliaAddress);
  console.log('Arbitrum OFT:', arbitrumAddress);
  
  // Save deployment info
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    standardOFTAdapters: {
      sepolia: sepoliaAddress,
      arbitrumSepolia: arbitrumAddress
    }
  };
  
  await fs.writeFile(
    path.join(__dirname, 'deployments/standard-oft-deployment.json'),
    JSON.stringify(deploymentInfo, null, 2)
  );
}

deploy().catch(console.error);
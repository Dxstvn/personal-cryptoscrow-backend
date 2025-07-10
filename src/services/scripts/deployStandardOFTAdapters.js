#!/usr/bin/env node
/**
 * Deploy Standard LayerZero OFT Adapters for WETH
 * These will work with the escrow contract's expectations
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

const CHAINS = {
  sepolia: {
    name: 'Sepolia',
    chainId: 11155111,
    endpointId: 40161,
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    explorer: 'https://sepolia.etherscan.io'
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    endpointId: 40231,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL,
    layerZeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    weth: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    explorer: 'https://sepolia.arbiscan.io'
  }
};

async function deployStandardOFTAdapter() {
  console.log(chalk.blue('🚀 Deploying Standard OFT Adapters'));
  console.log(chalk.blue('=================================='));
  
  const deployments = {};
  
  try {
    // Create the standard OFT adapter contract
    console.log(chalk.cyan('📝 Creating Standard OFT Adapter Contract...'));
    
    const contractSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StandardWETHOFTAdapter
 * @notice Standard OFT Adapter for WETH that works with escrow contracts
 */
contract StandardWETHOFTAdapter is OFTAdapter {
    constructor(
        address _token,
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) Ownable(_delegate) {}
}`;
    
    // Save the contract
    const contractPath = path.join(__dirname, '../../contract/contracts/StandardWETHOFTAdapter.sol');
    await fs.writeFile(contractPath, contractSource);
    console.log('✅ Contract source created');
    
    // Compile instructions
    console.log(chalk.cyan('\n📋 Compilation Instructions:'));
    console.log('1. Navigate to contract directory: cd src/contract');
    console.log('2. Install LayerZero dependencies:');
    console.log('   npm install @layerzerolabs/oft-evm@latest');
    console.log('3. Compile: npx hardhat compile');
    console.log('4. Then run the deployment script');
    
    // Create deployment script
    const deployScript = `#!/usr/bin/env node
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
  console.log(chalk.cyan('\\nDeploying on Sepolia...'));
  const sepoliaWallet = wallet.connect(sepoliaProvider);
  const sepoliaFactory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, sepoliaWallet);
  
  const sepoliaOFT = await sepoliaFactory.deploy(
    '${CHAINS.sepolia.weth}', // WETH address
    '${CHAINS.sepolia.layerZeroEndpoint}', // LayerZero endpoint
    wallet.address // delegate
  );
  
  await sepoliaOFT.waitForDeployment();
  const sepoliaAddress = await sepoliaOFT.getAddress();
  console.log(chalk.green('✅ Sepolia OFT deployed at:', sepoliaAddress));
  
  // Deploy on Arbitrum
  console.log(chalk.cyan('\\nDeploying on Arbitrum Sepolia...'));
  const arbitrumWallet = wallet.connect(arbitrumProvider);
  const arbitrumFactory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, arbitrumWallet);
  
  const arbitrumOFT = await arbitrumFactory.deploy(
    '${CHAINS.arbitrumSepolia.weth}', // WETH address
    '${CHAINS.arbitrumSepolia.layerZeroEndpoint}', // LayerZero endpoint
    wallet.address // delegate
  );
  
  await arbitrumOFT.waitForDeployment();
  const arbitrumAddress = await arbitrumOFT.getAddress();
  console.log(chalk.green('✅ Arbitrum OFT deployed at:', arbitrumAddress));
  
  // Configure peers
  console.log(chalk.cyan('\\n🔗 Configuring Peers...'));
  
  const setPeerAbi = ['function setPeer(uint32 eid, bytes32 peer)'];
  
  // Sepolia -> Arbitrum
  const sepoliaContract = new ethers.Contract(sepoliaAddress, setPeerAbi, sepoliaWallet);
  await sepoliaContract.setPeer(
    ${CHAINS.arbitrumSepolia.endpointId},
    ethers.zeroPadValue(arbitrumAddress, 32)
  );
  console.log('✅ Sepolia -> Arbitrum peer set');
  
  // Arbitrum -> Sepolia
  const arbitrumContract = new ethers.Contract(arbitrumAddress, setPeerAbi, arbitrumWallet);
  await arbitrumContract.setPeer(
    ${CHAINS.sepolia.endpointId},
    ethers.zeroPadValue(sepoliaAddress, 32)
  );
  console.log('✅ Arbitrum -> Sepolia peer set');
  
  console.log(chalk.green('\\n✅ Deployment Complete!'));
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

deploy().catch(console.error);`;
    
    const deployScriptPath = path.join(__dirname, 'deployStandardOFT.js');
    await fs.writeFile(deployScriptPath, deployScript);
    await fs.chmod(deployScriptPath, '755');
    console.log('✅ Deployment script created');
    
    console.log(chalk.green('\n✅ Setup Complete!'));
    console.log(chalk.yellow('\n📋 Next Steps:'));
    console.log('1. cd src/contract');
    console.log('2. npm install @layerzerolabs/oft-evm@latest');
    console.log('3. npx hardhat compile');
    console.log('4. cd ../.. && node src/services/scripts/deployStandardOFT.js');
    console.log('5. Update your escrow contract with the new OFT addresses');
    
  } catch (error) {
    console.log(chalk.red('Error:'), error.message);
  }
}

async function main() {
  console.log(chalk.blue('🔍 Standard OFT Adapter Solution'));
  console.log(chalk.blue('================================'));
  
  console.log(chalk.cyan('Why this solution:'));
  console.log('1. Your escrow contract expects standard LayerZero OFT interface');
  console.log('2. The SimplePropertyOFTAdapter has extra functionality that causes issues');
  console.log('3. A standard OFTAdapter will work seamlessly with your escrow');
  
  await deployStandardOFTAdapter();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
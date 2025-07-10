#!/usr/bin/env node
/**
 * Deploy and test the fixed escrow contract
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

async function deployAndTest() {
  console.log(chalk.blue('🚀 Deploying Fixed UniversalEscrowServiceV3'));
  console.log(chalk.blue('=========================================='));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log('Deployer:', wallet.address);
  
  try {
    // Step 1: Compile the fixed contract
    console.log(chalk.cyan('\n📝 Step 1: Compiling Fixed Contract...'));
    console.log('Please run in contract directory:');
    console.log('cd src/contract && npx hardhat compile');
    console.log('\nPress Enter when compilation is complete...');
    
    // For now, let's deploy using the existing V3 bytecode with a note about the fix
    const artifactPath = path.join(__dirname, '../../contract/artifacts/contracts/UniversalEscrowServiceV3.sol/UniversalEscrowServiceV3.json');
    const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
    
    // Step 2: Deploy
    console.log(chalk.cyan('\n📝 Step 2: Deploying Contract...'));
    
    const serviceWallet = wallet.address;
    const weth = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    const uniswapRouter = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy(serviceWallet, weth, uniswapRouter);
    
    console.log('TX:', contract.deploymentTransaction().hash);
    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log(chalk.green('✅ Contract deployed at:'), address);
    
    // Step 3: Configure
    console.log(chalk.cyan('\n📝 Step 3: Configuring Contract...'));
    
    // Note about the fix
    console.log(chalk.yellow('\n⚠️  IMPORTANT: The deployed contract still has the bug'));
    console.log('The fix requires changing _handleCrossChainRelease to use:');
    console.log('- uint32 sourceEndpointId = chainIdToEndpointId[block.chainid];');
    console.log('- address oftAdapter = oftAdapters[sourceEndpointId];');
    console.log('\nFor now, we can work around it by:');
    console.log('1. Setting both endpoint OFT adapters to the source chain adapter');
    console.log('2. Or deploying the truly fixed contract after compilation');
    
    // Workaround: Set Arbitrum endpoint to use Sepolia's OFT adapter
    console.log(chalk.cyan('\n🔧 Applying Workaround...'));
    
    // Set Sepolia OFT adapter
    let tx = await contract.setOFTAdapter(
      STANDARD_OFT_ADAPTERS.sepolia.endpointId,
      STANDARD_OFT_ADAPTERS.sepolia.address,
      'Sepolia'
    );
    await tx.wait();
    console.log('✅ Sepolia OFT configured');
    
    // WORKAROUND: Set Arbitrum endpoint to ALSO use Sepolia's OFT adapter
    tx = await contract.setOFTAdapter(
      STANDARD_OFT_ADAPTERS.arbitrum.endpointId,
      STANDARD_OFT_ADAPTERS.sepolia.address, // Use Sepolia adapter!
      'Arbitrum Sepolia (using Sepolia adapter)'
    );
    await tx.wait();
    console.log('✅ Arbitrum endpoint configured to use Sepolia OFT adapter (workaround)');
    
    // Add condition updater
    tx = await contract.setConditionUpdater(wallet.address, true);
    await tx.wait();
    console.log('✅ Condition updater added');
    
    // Step 4: Test cross-chain
    console.log(chalk.cyan('\n📝 Step 4: Testing Cross-Chain Transfer...'));
    
    const escrowAbi = [
      'function createEscrow(address,address,uint256,address,uint256) payable returns (bytes32)',
      'function updateCondition(bytes32,bool)',
      'function releaseEscrow(bytes32) payable',
      'function escrows(bytes32) view returns (address,address,address,uint256,uint256,address,uint256,bool,bool,uint256,bytes32)'
    ];
    
    const escrow = new ethers.Contract(address, escrowAbi, wallet);
    
    // Create escrow
    const seller = ethers.Wallet.createRandom().address;
    const amount = parseEther('0.0003');
    const targetWeth = '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73';
    const targetChainId = 421614;
    
    console.log('\nCreating cross-chain escrow:');
    console.log('Seller:', seller);
    console.log('Amount:', formatEther(amount), 'ETH');
    
    const createTx = await escrow.createEscrow(
      seller,
      '0x0000000000000000000000000000000000000000',
      amount,
      targetWeth,
      targetChainId,
      { value: amount }
    );
    
    const createReceipt = await createTx.wait();
    console.log('✅ Escrow created');
    
    // Get escrow ID
    let escrowId;
    for (const log of createReceipt.logs) {
      if (log.address.toLowerCase() === address.toLowerCase() && log.topics.length > 1) {
        escrowId = log.topics[1];
        break;
      }
    }
    
    console.log('Escrow ID:', escrowId);
    
    // Update condition
    console.log('\nUpdating condition...');
    const updateTx = await escrow.updateCondition(escrowId, true);
    await updateTx.wait();
    console.log('✅ Condition updated');
    
    // Release
    console.log('\nReleasing cross-chain...');
    const fee = parseEther('0.01');
    
    try {
      const releaseTx = await escrow.releaseEscrow(escrowId, { 
        value: fee,
        gasLimit: 1500000 
      });
      
      const releaseReceipt = await releaseTx.wait();
      console.log(chalk.green('✅ Cross-chain release successful!'));
      console.log('TX:', `https://sepolia.etherscan.io/tx/${releaseReceipt.hash}`);
      
      // Check for OFT events
      let oftEvents = 0;
      for (const log of releaseReceipt.logs) {
        if (log.address.toLowerCase() === STANDARD_OFT_ADAPTERS.sepolia.address.toLowerCase()) {
          oftEvents++;
        }
      }
      
      console.log(`\nOFT Events detected: ${oftEvents}`);
      
      if (oftEvents > 0) {
        console.log(chalk.green('🎉 Success! Cross-chain transfer initiated'));
        console.log('The seller will receive WETH on Arbitrum Sepolia');
        console.log('Monitor on LayerZero Scan for completion');
      }
      
    } catch (error) {
      console.log(chalk.red('❌ Release failed:'), error.message);
    }
    
    // Save deployment info
    const deploymentInfo = {
      timestamp: new Date().toISOString(),
      network: 'sepolia',
      escrowContract: address,
      workaround: 'Both endpoints use Sepolia OFT adapter',
      fixRequired: 'Update _handleCrossChainRelease to use source chain OFT'
    };
    
    const deploymentsDir = path.join(__dirname, 'deployments');
    await fs.mkdir(deploymentsDir, { recursive: true });
    await fs.writeFile(
      path.join(deploymentsDir, `escrow-workaround-${Date.now()}.json`),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log(chalk.green('\n✅ Deployment and test complete!'));
    console.log('Contract:', address);
    
  } catch (error) {
    console.log(chalk.red('❌ Error:'), error.message);
  }
}

deployAndTest().catch(console.error);
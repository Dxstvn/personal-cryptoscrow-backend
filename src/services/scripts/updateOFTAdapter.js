#!/usr/bin/env node
/**
 * Update OFT adapter in escrow contract
 */

import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const ESCROW_ADDRESS = '0x726ca2162A5B90718EF11Ab8f294c0f30E258208';

// Possible OFT adapter addresses
const OFT_CANDIDATES = [
  '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE', // Production deployment
  '0x5277270f4F4F7e03439F2eCdb6d6632ED921bfF6', // Standard deployment
];

async function main() {
  console.log(chalk.blue('🔧 Updating OFT Adapter Configuration'));
  console.log(chalk.blue('====================================\n'));
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  // First, check which OFT adapter is actually deployed
  console.log(chalk.cyan('Checking OFT adapter candidates...'));
  let validOFT = null;
  
  for (const addr of OFT_CANDIDATES) {
    const code = await provider.getCode(addr);
    console.log(`├─ ${addr}: ${code !== '0x' ? '✅ Deployed' : '❌ Not deployed'}`);
    if (code !== '0x' && !validOFT) {
      validOFT = addr;
    }
  }
  
  if (!validOFT) {
    console.log(chalk.red('\n❌ No valid OFT adapter found!'));
    return;
  }
  
  console.log(chalk.green(`\n✅ Using OFT adapter: ${validOFT}`));
  
  // Update escrow contract
  const escrowAbi = [
    'function setOFTAdapter(uint32 endpointId, address adapter, string memory chainName)',
    'function oftAdapters(uint32) view returns (address)',
    'function owner() view returns (address)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, wallet);
  
  try {
    // Check current configuration
    const currentOFT = await escrow.oftAdapters(40161); // Sepolia endpoint ID
    console.log(`\nCurrent OFT adapter: ${currentOFT}`);
    
    if (currentOFT.toLowerCase() === validOFT.toLowerCase()) {
      console.log(chalk.green('✅ OFT adapter already correctly configured'));
      return;
    }
    
    // Check ownership
    const owner = await escrow.owner();
    console.log(`Escrow owner: ${owner}`);
    console.log(`Current signer: ${wallet.address}`);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log(chalk.red('❌ You are not the owner of this escrow'));
      return;
    }
    
    // Update OFT adapter
    console.log(chalk.yellow('\nUpdating OFT adapter...'));
    const tx = await escrow.setOFTAdapter(40161, validOFT, 'Sepolia');
    console.log(`Transaction sent: ${tx.hash}`);
    
    await tx.wait();
    console.log(chalk.green('✅ OFT adapter updated successfully!'));
    
    // Verify update
    const newOFT = await escrow.oftAdapters(40161);
    console.log(`\nVerified OFT adapter: ${newOFT}`);
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
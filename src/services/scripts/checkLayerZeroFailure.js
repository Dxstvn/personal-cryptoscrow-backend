#!/usr/bin/env node
/**
 * Check why LayerZero message failed
 */

import { ethers, formatEther } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const TX_HASH = '0xb9ff5cca02f133c9eb21912335fe4876cef3a75ad5c0d5a95bc55e3a951b301e';
const GUID = '0x9731ef3c2b44a38ffd911338a093187447e02d169fb29439c4f28efc76d36c19';
const ARBITRUM_COMPOSER = '0x7ffd15F8C2696d76D19145AdB856B118e087D6DA';
const ARBITRUM_OFT = '0xb6072a8ddF1183cE210aeFa5fa98B3Ab664Cc37B';

async function main() {
  console.log(chalk.blue('🔍 Investigating LayerZero Message Failure'));
  console.log(chalk.blue('========================================\n'));
  
  console.log(chalk.cyan('Transaction Details:'));
  console.log(`├─ TX Hash: ${TX_HASH}`);
  console.log(`├─ LZ GUID: ${GUID}`);
  console.log(`└─ Status: Failed on LayerZero\n`);
  
  // Check Arbitrum side
  const arbProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  
  console.log(chalk.yellow('Checking Arbitrum Configuration...'));
  
  // Check if composer exists
  const composerCode = await arbProvider.getCode(ARBITRUM_COMPOSER);
  console.log(`├─ Composer deployed: ${composerCode !== '0x' ? 'Yes' : 'No'}`);
  
  // Check if OFT exists  
  const oftCode = await arbProvider.getCode(ARBITRUM_OFT);
  console.log(`├─ OFT adapter deployed: ${oftCode !== '0x' ? 'Yes' : 'No'}`);
  
  // Check composer configuration
  if (composerCode !== '0x') {
    const composerAbi = [
      'function authorizedOFTAdapters(address) view returns (bool)',
      'function owner() view returns (address)'
    ];
    
    const composer = new ethers.Contract(ARBITRUM_COMPOSER, composerAbi, arbProvider);
    
    try {
      const owner = await composer.owner();
      console.log(`├─ Composer owner: ${owner}`);
      
      // Check if OFT is authorized
      const isAuthorized = await composer.authorizedOFTAdapters(ARBITRUM_OFT);
      console.log(`└─ OFT authorized in composer: ${isAuthorized ? 'Yes' : 'No'}\n`);
      
      if (!isAuthorized) {
        console.log(chalk.red('❌ Issue found: OFT adapter not authorized in composer!'));
      }
    } catch (e) {
      console.log(`└─ Error reading composer: ${e.message}\n`);
    }
  }
  
  // Check OFT configuration on Arbitrum
  console.log(chalk.yellow('Checking Arbitrum OFT Configuration...'));
  const oftAbi = [
    'function peers(uint32 eid) view returns (bytes32 peer)',
    'function owner() view returns (address)',
    'function endpoint() view returns (address)'
  ];
  
  const oft = new ethers.Contract(ARBITRUM_OFT, oftAbi, arbProvider);
  
  try {
    // Check peer for Sepolia
    const sepoliaPeer = await oft.peers(40161); // Sepolia endpoint ID
    console.log(`├─ Sepolia peer: ${sepoliaPeer}`);
    
    // The peer should be the Sepolia OFT adapter
    const expectedPeer = ethers.zeroPadValue('0x51aF053a6BB282284E4407FaDfd13b09D93B82eE', 32);
    console.log(`├─ Expected peer: ${expectedPeer}`);
    console.log(`├─ Peer match: ${sepoliaPeer.toLowerCase() === expectedPeer.toLowerCase() ? 'Yes' : 'No'}`);
    
    const endpoint = await oft.endpoint();
    console.log(`└─ Endpoint: ${endpoint}\n`);
    
    if (sepoliaPeer === '0x' + '0'.repeat(64)) {
      console.log(chalk.red('❌ Issue found: Sepolia peer not set on Arbitrum OFT!'));
    }
  } catch (e) {
    console.log(`Error reading OFT: ${e.message}\n`);
  }
  
  // Check the message content that was sent
  console.log(chalk.yellow('Message Analysis:'));
  console.log('├─ Destination: Composer contract');
  console.log('├─ Contains: WETH + swap instructions');
  console.log('└─ Expected: Composer to swap WETH → USDC\n');
  
  console.log(chalk.cyan('Likely Failure Reasons:'));
  console.log('1. ❌ OFT peers not properly configured between chains');
  console.log('2. ❌ Composer not authorized to receive from OFT');
  console.log('3. ❌ Insufficient gas for compose execution on destination');
  console.log('4. ❌ Composer unable to receive WETH from OFT\n');
  
  // Check Sepolia OFT peer configuration
  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const sepoliaOFT = '0x51aF053a6BB282284E4407FaDfd13b09D93B82eE';
  const sepoliaOftContract = new ethers.Contract(sepoliaOFT, oftAbi, sepoliaProvider);
  
  console.log(chalk.yellow('Checking Sepolia OFT Configuration...'));
  try {
    const arbPeer = await sepoliaOftContract.peers(40231); // Arbitrum endpoint ID
    console.log(`├─ Arbitrum peer: ${arbPeer}`);
    
    const expectedArbPeer = ethers.zeroPadValue(ARBITRUM_OFT, 32);
    console.log(`├─ Expected: ${expectedArbPeer}`);
    console.log(`└─ Match: ${arbPeer.toLowerCase() === expectedArbPeer.toLowerCase() ? 'Yes' : 'No'}\n`);
    
    if (arbPeer === '0x' + '0'.repeat(64)) {
      console.log(chalk.red('❌ Issue found: Arbitrum peer not set on Sepolia OFT!'));
    }
  } catch (e) {
    console.log(`Error: ${e.message}\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
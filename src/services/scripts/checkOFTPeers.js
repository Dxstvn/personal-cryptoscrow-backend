#!/usr/bin/env node
// Script to check and display OFT adapter peer configurations

import { EscrowServiceV3 } from '../escrowServiceV3.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkOFTPeers() {
  console.log('🔍 Checking OFT Adapter Peer Configurations...\n');
  
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const chains = service.getSupportedChains();
  
  console.log('📋 Supported Chains:');
  chains.forEach(chain => {
    console.log(`  - ${chain.name} (${chain.chainId})`);
    console.log(`    OFT Adapter: ${chain.oftAdapter}`);
    console.log(`    Endpoint ID: ${chain.layerZeroEndpointId}`);
  });
  
  console.log('\n🔗 Checking Peer Configurations...\n');
  
  // Check each pair of chains
  for (const sourceChain of chains) {
    console.log(`\n${sourceChain.name.toUpperCase()}:`);
    
    for (const targetChain of chains) {
      if (sourceChain.chainId === targetChain.chainId) continue;
      
      const hasPeer = await service.checkOFTPeer(sourceChain.chainId, targetChain.chainId);
      const status = hasPeer ? '✅' : '❌';
      console.log(`  ${status} → ${targetChain.name}`);
    }
  }
  
  console.log('\n📝 Setup Instructions for Missing Peers:\n');
  
  const instructions = await service.getOFTPeerSetupInstructions();
  
  if (instructions.length === 0) {
    console.log('✅ All peers are properly configured!');
  } else {
    console.log('The following peer configurations are missing:\n');
    
    instructions.forEach((instruction, index) => {
      console.log(`${index + 1}. On ${instruction.chain}:`);
      console.log(`   Contract: ${instruction.oftAdapter}`);
      console.log(`   Target: ${instruction.targetChain} (endpoint ${instruction.targetEndpointId})`);
      console.log(`   Command: ${instruction.command}`);
      console.log();
    });
    
    console.log('⚠️  Note: These setPeer() calls must be made by the contract owner.');
    console.log('    The peers need to be set on both sides for bidirectional transfers.');
  }
}

// Run the check
checkOFTPeers()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
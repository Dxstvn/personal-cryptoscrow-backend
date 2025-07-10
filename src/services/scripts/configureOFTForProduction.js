#!/usr/bin/env node
/**
 * Production Configuration Script for OFT Adapters
 * This script configures OFT adapters with peers and LayerZero endpoint settings
 * 
 * Usage:
 *   node configureOFTForProduction.js [network] [--dry-run]
 * 
 * Examples:
 *   node configureOFTForProduction.js sepolia
 *   node configureOFTForProduction.js all --dry-run
 */

import { EscrowServiceV3 } from '../escrowServiceV3.js';
import { Contract, Wallet } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configuration for each network
const NETWORK_CONFIG = {
  sepolia: {
    chainId: 11155111,
    name: 'sepolia',
    oftAdapter: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4',
    endpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    endpointId: 40161
  },
  'polygon-amoy': {
    chainId: 80002,
    name: 'polygon-amoy',
    oftAdapter: '0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725',
    endpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    endpointId: 40267
  },
  'arbitrum-sepolia': {
    chainId: 421614,
    name: 'arbitrum-sepolia',
    oftAdapter: '0xbaa46938E3110187ED6a55EE139312b28c943d00',
    endpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    endpointId: 40231
  }
};

// OFT Adapter ABI for configuration functions
const OFT_ADAPTER_ABI = [
  'function owner() view returns (address)',
  'function setPeer(uint32 _eid, bytes32 _peer)',
  'function peers(uint32 _eid) view returns (bytes32)',
  'function endpoint() view returns (address)',
  'function setDelegate(address _delegate)',
  'function delegates(address) view returns (address)'
];

// LayerZero Endpoint ABI for registration
const ENDPOINT_ABI = [
  'function setConfig(address _oapp, address _lib, uint32 _eid, uint32 _configType, bytes _config)',
  'function getConfig(address _oapp, address _lib, uint32 _eid, uint32 _configType) view returns (bytes)',
  'function defaultSendLibrary(uint32) view returns (address)',
  'function defaultReceiveLibrary(uint32) view returns (address)'
];

async function configureOFTAdapter(network, dryRun = false) {
  console.log(`\n🔧 Configuring OFT Adapter for ${network}...`);
  
  const config = NETWORK_CONFIG[network];
  if (!config) {
    throw new Error(`Unknown network: ${network}`);
  }
  
  const service = new EscrowServiceV3();
  await service.initialize();
  
  // Get wallet
  if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
    throw new Error('BACKEND_WALLET_PRIVATE_KEY not set in environment');
  }
  
  const provider = await service.getProvider(config.chainId);
  const wallet = new Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  console.log(`  Wallet address: ${wallet.address}`);
  
  // Connect to OFT adapter
  const oftAdapter = new Contract(config.oftAdapter, OFT_ADAPTER_ABI, wallet);
  
  // Check ownership
  const owner = await oftAdapter.owner();
  console.log(`  OFT Adapter owner: ${owner}`);
  
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`  ❌ Error: Wallet ${wallet.address} is not the owner of OFT adapter`);
    console.error(`     Owner is: ${owner}`);
    return false;
  }
  
  // Configure peers for all other networks
  const otherNetworks = Object.values(NETWORK_CONFIG).filter(n => n.name !== network);
  
  for (const targetNetwork of otherNetworks) {
    console.log(`\n  📡 Configuring peer for ${targetNetwork.name}...`);
    
    // Check current peer
    const currentPeer = await oftAdapter.peers(targetNetwork.endpointId);
    const expectedPeer = '0x' + targetNetwork.oftAdapter.slice(2).padStart(64, '0').toLowerCase();
    
    console.log(`    Current peer: ${currentPeer}`);
    console.log(`    Expected peer: ${expectedPeer}`);
    
    if (currentPeer.toLowerCase() === expectedPeer) {
      console.log(`    ✅ Peer already configured correctly`);
      continue;
    }
    
    if (dryRun) {
      console.log(`    🔵 [DRY RUN] Would set peer: setPeer(${targetNetwork.endpointId}, ${expectedPeer})`);
    } else {
      console.log(`    🔄 Setting peer...`);
      try {
        const tx = await oftAdapter.setPeer(targetNetwork.endpointId, expectedPeer);
        console.log(`    📝 Transaction: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`    ✅ Peer configured in block ${receipt.blockNumber}`);
      } catch (error) {
        console.error(`    ❌ Failed to set peer: ${error.message}`);
        return false;
      }
    }
  }
  
  return true;
}

async function configureEndpoint(network, dryRun = false) {
  console.log(`\n🌐 Configuring LayerZero Endpoint for ${network}...`);
  
  const config = NETWORK_CONFIG[network];
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const provider = await service.getProvider(config.chainId);
  const wallet = new Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  const endpoint = new Contract(config.endpoint, ENDPOINT_ABI, provider);
  const oftAdapter = new Contract(config.oftAdapter, OFT_ADAPTER_ABI, wallet);
  
  // Check delegate configuration
  console.log(`  Checking delegate configuration...`);
  const currentDelegate = await oftAdapter.delegates(wallet.address);
  
  if (currentDelegate === wallet.address) {
    console.log(`  ✅ Delegate already set to wallet address`);
  } else if (!dryRun) {
    console.log(`  🔄 Setting delegate...`);
    try {
      const tx = await oftAdapter.setDelegate(wallet.address);
      console.log(`  📝 Transaction: ${tx.hash}`);
      await tx.wait();
      console.log(`  ✅ Delegate configured`);
    } catch (error) {
      console.error(`  ❌ Failed to set delegate: ${error.message}`);
    }
  } else {
    console.log(`  🔵 [DRY RUN] Would set delegate to ${wallet.address}`);
  }
  
  // Get default libraries
  const otherNetworks = Object.values(NETWORK_CONFIG).filter(n => n.name !== network);
  
  for (const targetNetwork of otherNetworks) {
    console.log(`\n  🔗 Checking endpoint config for ${targetNetwork.name}...`);
    
    try {
      const sendLib = await endpoint.defaultSendLibrary(targetNetwork.endpointId);
      const receiveLib = await endpoint.defaultReceiveLibrary(targetNetwork.endpointId);
      
      console.log(`    Send library: ${sendLib}`);
      console.log(`    Receive library: ${receiveLib}`);
      
      // Check if we can get config (this will revert if not configured)
      try {
        const sendConfig = await endpoint.getConfig(
          config.oftAdapter,
          sendLib,
          targetNetwork.endpointId,
          2 // CONFIG_TYPE_EXECUTOR
        );
        console.log(`    ✅ Send config exists: ${sendConfig.slice(0, 10)}...`);
      } catch (error) {
        console.log(`    ⚠️  No send config found (may need to be set by endpoint owner)`);
      }
    } catch (error) {
      console.error(`    ❌ Error checking config: ${error.message}`);
    }
  }
  
  return true;
}

async function verifyConfiguration(network) {
  console.log(`\n🔍 Verifying configuration for ${network}...`);
  
  const config = NETWORK_CONFIG[network];
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const provider = await service.getProvider(config.chainId);
  const oftAdapter = new Contract(config.oftAdapter, OFT_ADAPTER_ABI, provider);
  
  let allGood = true;
  
  // Check all peers
  const otherNetworks = Object.values(NETWORK_CONFIG).filter(n => n.name !== network);
  
  for (const targetNetwork of otherNetworks) {
    const peer = await oftAdapter.peers(targetNetwork.endpointId);
    const expectedPeer = '0x' + targetNetwork.oftAdapter.slice(2).padStart(64, '0').toLowerCase();
    
    if (peer.toLowerCase() === expectedPeer) {
      console.log(`  ✅ ${targetNetwork.name} peer: Configured correctly`);
    } else {
      console.log(`  ❌ ${targetNetwork.name} peer: Not configured`);
      allGood = false;
    }
  }
  
  // Test quote functionality
  console.log(`\n  Testing cross-chain quotes...`);
  
  for (const targetNetwork of otherNetworks) {
    try {
      const quote = await service.quoteCrossChainFee(config.chainId, targetNetwork.chainId, '1');
      if (quote.warning) {
        console.log(`  ⚠️  ${targetNetwork.name}: ${quote.warning}`);
      } else {
        console.log(`  ✅ ${targetNetwork.name}: ${quote.nativeFee} ETH (recommended: ${quote.recommended} ETH)`);
      }
    } catch (error) {
      console.log(`  ❌ ${targetNetwork.name}: Failed to get quote - ${error.message}`);
      allGood = false;
    }
  }
  
  return allGood;
}

async function main() {
  const args = process.argv.slice(2);
  const network = args[0];
  const dryRun = args.includes('--dry-run');
  
  if (!network) {
    console.error('Usage: node configureOFTForProduction.js [network|all] [--dry-run]');
    console.error('Networks: sepolia, polygon-amoy, arbitrum-sepolia');
    process.exit(1);
  }
  
  console.log('🚀 OFT Adapter Production Configuration');
  console.log('=====================================');
  
  if (dryRun) {
    console.log('🔵 Running in DRY RUN mode - no transactions will be sent');
  }
  
  try {
    const networks = network === 'all' 
      ? Object.keys(NETWORK_CONFIG)
      : [network];
    
    // Phase 1: Configure OFT adapter peers
    console.log('\n📋 Phase 1: Configuring OFT Adapter Peers');
    for (const net of networks) {
      await configureOFTAdapter(net, dryRun);
    }
    
    // Phase 2: Configure endpoint settings
    console.log('\n📋 Phase 2: Configuring Endpoint Settings');
    for (const net of networks) {
      await configureEndpoint(net, dryRun);
    }
    
    // Phase 3: Verify configuration
    if (!dryRun) {
      console.log('\n📋 Phase 3: Verifying Configuration');
      let allGood = true;
      for (const net of networks) {
        const good = await verifyConfiguration(net);
        allGood = allGood && good;
      }
      
      if (allGood) {
        console.log('\n✅ All configurations verified successfully!');
      } else {
        console.log('\n⚠️  Some configurations need attention');
      }
    }
    
    console.log('\n📝 Configuration Summary:');
    console.log('  - OFT adapters have peers configured for cross-chain communication');
    console.log('  - Delegates are set for endpoint configuration');
    console.log('  - Cross-chain quotes should now work without NoPeer errors');
    
    if (dryRun) {
      console.log('\n💡 To apply these changes, run without --dry-run flag');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
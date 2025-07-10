#!/usr/bin/env node
/**
 * LayerZero Endpoint Configuration Script
 * This script configures OFT adapters to work with LayerZero endpoints
 * and resolves the 0x41705130 error
 */

import { Contract, Wallet } from 'ethers';
import { EscrowServiceV3 } from '../escrowServiceV3.js';
import dotenv from 'dotenv';

dotenv.config();

// Extended OFT Adapter ABI with endpoint configuration functions
const OFT_ADAPTER_ABI = [
  // Ownership
  'function owner() view returns (address)',
  
  // Delegate management
  'function setDelegate(address _delegate)',
  'function delegates(address) view returns (address)',
  
  // Peer management
  'function setPeer(uint32 _eid, bytes32 _peer)',
  'function peers(uint32 _eid) view returns (bytes32)',
  
  // Endpoint interaction
  'function endpoint() view returns (address)',
  'function oAppVersion() view returns (uint64 senderVersion, uint64 receiverVersion)',
  
  // Configuration
  'function setConfig(address _oapp, address _lib, uint32[] _eids, uint32 _configType, bytes[] _config)',
  'function snapshotConfig(uint32[] _eids) external',
  
  // Events
  'event DelegateSet(address indexed delegate)',
  'event PeerSet(uint32 eid, bytes32 peer)'
];

// LayerZero Endpoint V2 ABI
const ENDPOINT_V2_ABI = [
  // Library management
  'function defaultSendLibrary(uint32 _eid) view returns (address)',
  'function defaultReceiveLibrary(uint32 _eid) view returns (address)',
  'function setSendLibrary(address _oapp, uint32 _eid, address _lib)',
  'function setReceiveLibrary(address _oapp, uint32 _eid, address _lib)',
  
  // Configuration
  'function setConfig(address _oapp, address _lib, uint32[] _eids, uint32 _configType, bytes[] _config)',
  'function getConfig(address _oapp, address _lib, uint32 _eid, uint32 _configType) view returns (bytes)',
  
  // Registration
  'function isValidReceiveLibrary(address _receiver, uint32 _eid, address _lib) view returns (bool)',
  
  // Get app config
  'function getAppConfig(uint32 _remoteEid, address _oapp) view returns (address sendLib, address receiveLib)',
  
  // Events
  'event SendLibrarySet(address indexed oapp, uint32 indexed eid, address indexed lib)',
  'event ReceiveLibrarySet(address indexed oapp, uint32 indexed eid, address indexed lib)'
];

// Configuration types for LayerZero
const CONFIG_TYPE = {
  EXECUTOR: 1,
  ULN: 2,
  DVN: 3
};

// Network configurations
const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    endpointId: 40161,
    endpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    oftAdapter: '0xb3dd252bfc2c3d822f7F0f550Df576a9CC928Bf4'
  },
  'arbitrum-sepolia': {
    chainId: 421614,
    endpointId: 40231,
    endpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    oftAdapter: '0xbaa46938E3110187ED6a55EE139312b28c943d00'
  },
  'polygon-amoy': {
    chainId: 80002,
    endpointId: 40267,
    endpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
    oftAdapter: '0x746EF3c4C9c3f779Bc3558A5FF55C3f34ae20725'
  }
};

// Known DVN addresses for testnets (these may need to be updated)
const TESTNET_DVNS = {
  layerzero: '0x8eebf8b423B73bFCa51a1Db4B7354AA0bFCA9193', // LayerZero Labs DVN
  google: '0x7e19067C5EeB46D88Fc6E10e710E2C93bDAe4e28' // Google Cloud DVN (if available)
};

async function checkCurrentConfiguration(network) {
  console.log(`\n🔍 Checking current configuration for ${network}...`);
  
  const config = NETWORKS[network];
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const provider = await service.getProvider(config.chainId);
  const wallet = new Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  const oftAdapter = new Contract(config.oftAdapter, OFT_ADAPTER_ABI, wallet);
  const endpoint = new Contract(config.endpoint, ENDPOINT_V2_ABI, provider);
  
  // Check ownership
  const owner = await oftAdapter.owner();
  console.log(`  OFT Owner: ${owner}`);
  console.log(`  Your address: ${wallet.address}`);
  console.log(`  Is owner: ${owner.toLowerCase() === wallet.address.toLowerCase() ? '✅' : '❌'}`);
  
  // Check delegate
  const delegate = await oftAdapter.delegates(wallet.address);
  console.log(`  Delegate set: ${delegate === wallet.address ? '✅' : '❌'} (${delegate})`);
  
  // Check endpoint connection
  try {
    const endpointAddr = await oftAdapter.endpoint();
    console.log(`  Endpoint: ${endpointAddr}`);
    console.log(`  Endpoint matches: ${endpointAddr.toLowerCase() === config.endpoint.toLowerCase() ? '✅' : '❌'}`);
  } catch (error) {
    console.log(`  ❌ Failed to get endpoint: ${error.message}`);
  }
  
  // Check version
  try {
    const version = await oftAdapter.oAppVersion();
    console.log(`  OApp Version - Sender: ${version.senderVersion}, Receiver: ${version.receiverVersion}`);
  } catch (error) {
    console.log(`  Version check failed (may not be implemented)`);
  }
  
  // Check libraries for each remote endpoint
  console.log(`\n  Library Configuration:`);
  for (const [remoteName, remoteConfig] of Object.entries(NETWORKS)) {
    if (remoteName === network) continue;
    
    try {
      const sendLib = await endpoint.defaultSendLibrary(remoteConfig.endpointId);
      const receiveLib = await endpoint.defaultReceiveLibrary(remoteConfig.endpointId);
      console.log(`    ${remoteName}:`);
      console.log(`      Send Library: ${sendLib}`);
      console.log(`      Receive Library: ${receiveLib}`);
      
      // Check if our OApp can use these libraries
      const appConfig = await endpoint.getAppConfig(remoteConfig.endpointId, config.oftAdapter);
      console.log(`      App Send Lib: ${appConfig.sendLib || 'default'}`);
      console.log(`      App Receive Lib: ${appConfig.receiveLib || 'default'}`);
    } catch (error) {
      console.log(`    ${remoteName}: ❌ Error - ${error.message}`);
    }
  }
}

async function setDelegate(network, dryRun = false) {
  console.log(`\n🔑 Setting delegate for ${network}...`);
  
  const config = NETWORKS[network];
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const provider = await service.getProvider(config.chainId);
  const wallet = new Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  const oftAdapter = new Contract(config.oftAdapter, OFT_ADAPTER_ABI, wallet);
  
  const currentDelegate = await oftAdapter.delegates(wallet.address);
  
  if (currentDelegate === wallet.address) {
    console.log(`  ✅ Delegate already set correctly`);
    return true;
  }
  
  if (dryRun) {
    console.log(`  🔵 [DRY RUN] Would set delegate to ${wallet.address}`);
    return true;
  }
  
  try {
    console.log(`  Setting delegate to ${wallet.address}...`);
    const tx = await oftAdapter.setDelegate(wallet.address);
    console.log(`  📝 Transaction: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  ✅ Delegate set in block ${receipt.blockNumber}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to set delegate: ${error.message}`);
    return false;
  }
}

async function configureDVN(network, dryRun = false) {
  console.log(`\n🛡️ Configuring DVN for ${network}...`);
  
  const config = NETWORKS[network];
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const provider = await service.getProvider(config.chainId);
  const wallet = new Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
  
  const oftAdapter = new Contract(config.oftAdapter, OFT_ADAPTER_ABI, wallet);
  const endpoint = new Contract(config.endpoint, ENDPOINT_V2_ABI, provider);
  
  // For each remote network, configure DVN
  for (const [remoteName, remoteConfig] of Object.entries(NETWORKS)) {
    if (remoteName === network) continue;
    
    console.log(`\n  Configuring DVN for ${network} -> ${remoteName}...`);
    
    try {
      // Get default send library
      const sendLib = await endpoint.defaultSendLibrary(remoteConfig.endpointId);
      console.log(`    Send Library: ${sendLib}`);
      
      // Try to get current DVN config
      try {
        const currentConfig = await endpoint.getConfig(
          config.oftAdapter,
          sendLib,
          remoteConfig.endpointId,
          CONFIG_TYPE.DVN
        );
        console.log(`    Current DVN config: ${currentConfig}`);
        
        if (currentConfig && currentConfig !== '0x') {
          console.log(`    ✅ DVN already configured`);
          continue;
        }
      } catch (error) {
        console.log(`    No existing DVN config (this is expected)`);
      }
      
      // Prepare DVN configuration
      // Format: [required_dvns_count][required_dvns][optional_dvns_count][optional_dvns][optional_threshold]
      const requiredDVNs = [TESTNET_DVNS.layerzero]; // At least LayerZero DVN is required
      const optionalDVNs = []; // No optional DVNs for testnet
      const optionalThreshold = 0;
      
      // Encode DVN config
      const configData = encodeDVNConfig(requiredDVNs, optionalDVNs, optionalThreshold);
      
      if (dryRun) {
        console.log(`    🔵 [DRY RUN] Would set DVN config:`);
        console.log(`       Required DVNs: ${requiredDVNs.join(', ')}`);
        console.log(`       Optional DVNs: ${optionalDVNs.length > 0 ? optionalDVNs.join(', ') : 'none'}`);
        console.log(`       Config data: ${configData}`);
        continue;
      }
      
      // Note: Setting config usually requires special permissions
      // On testnet, this might need to be done through LayerZero's interface
      console.log(`    ⚠️  DVN configuration typically requires endpoint admin access`);
      console.log(`    📋 Configuration to request from LayerZero:`);
      console.log(`       OApp: ${config.oftAdapter}`);
      console.log(`       Remote EID: ${remoteConfig.endpointId}`);
      console.log(`       Required DVNs: ${requiredDVNs.join(', ')}`);
      
    } catch (error) {
      console.error(`    ❌ Error: ${error.message}`);
    }
  }
}

function encodeDVNConfig(requiredDVNs, optionalDVNs, optionalThreshold) {
  // DVN config encoding format:
  // [1 byte: required count][20 bytes each: required DVN addresses]
  // [1 byte: optional count][20 bytes each: optional DVN addresses]
  // [1 byte: optional threshold]
  
  let config = '0x';
  
  // Required DVNs
  config += requiredDVNs.length.toString(16).padStart(2, '0');
  for (const dvn of requiredDVNs) {
    config += dvn.slice(2).toLowerCase();
  }
  
  // Optional DVNs
  config += optionalDVNs.length.toString(16).padStart(2, '0');
  for (const dvn of optionalDVNs) {
    config += dvn.slice(2).toLowerCase();
  }
  
  // Optional threshold
  if (optionalDVNs.length > 0) {
    config += optionalThreshold.toString(16).padStart(2, '0');
  }
  
  return config;
}

async function testQuote(network) {
  console.log(`\n🧪 Testing cross-chain quotes from ${network}...`);
  
  const service = new EscrowServiceV3();
  await service.initialize();
  
  const config = NETWORKS[network];
  
  for (const [remoteName, remoteConfig] of Object.entries(NETWORKS)) {
    if (remoteName === network) continue;
    
    try {
      console.log(`  Testing ${network} -> ${remoteName}...`);
      const quote = await service.quoteCrossChainFee(
        config.chainId,
        remoteConfig.chainId,
        '1',
        { verbose: true }
      );
      
      if (quote.error || quote.warning) {
        console.log(`    ⚠️  ${quote.error || quote.warning}`);
        console.log(`    Fee: ${quote.recommended} ETH (${quote.method})`);
      } else {
        console.log(`    ✅ Success! Fee: ${quote.recommended} ETH`);
        console.log(`    Method: ${quote.method}`);
      }
    } catch (error) {
      console.log(`    ❌ Failed: ${error.message}`);
    }
  }
}

async function generateReport(network) {
  console.log(`\n📊 Configuration Report for ${network}`);
  console.log('=' .repeat(60));
  
  const config = NETWORKS[network];
  
  console.log(`\n🔧 Required Actions to Fix 0x41705130 Error:\n`);
  
  console.log(`1. Set Delegate (can be done by OFT owner):`);
  console.log(`   Contract: ${config.oftAdapter}`);
  console.log(`   Function: setDelegate(${process.env.BACKEND_WALLET_PRIVATE_KEY ? 'your-address' : '<your-address>'})`);
  console.log(`   Status: Run 'node configureLZEndpoint.js ${network} --set-delegate'\n`);
  
  console.log(`2. Configure DVN (requires LayerZero support):`);
  console.log(`   - Contact LayerZero support team`);
  console.log(`   - Request DVN configuration for your OFT adapters`);
  console.log(`   - Provide OApp addresses and endpoint IDs\n`);
  
  console.log(`3. Alternative: Use LayerZero Scan UI:`);
  console.log(`   - Visit https://testnet.layerzeroscan.com/`);
  console.log(`   - Search for your OFT adapter address`);
  console.log(`   - Use the configuration interface\n`);
  
  console.log(`4. Verify Configuration:`);
  console.log(`   - Run 'node configureLZEndpoint.js ${network} --check'`);
  console.log(`   - Test quotes with 'node configureLZEndpoint.js ${network} --test'`);
  
  console.log('\n' + '=' .repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const network = args[0];
  const action = args[1];
  
  if (!network || !NETWORKS[network]) {
    console.error('Usage: node configureLZEndpoint.js [network] [action]');
    console.error('Networks: sepolia, arbitrum-sepolia, polygon-amoy');
    console.error('Actions:');
    console.error('  --check          Check current configuration');
    console.error('  --set-delegate   Set delegate for configuration');
    console.error('  --configure-dvn  Configure DVN settings');
    console.error('  --test           Test cross-chain quotes');
    console.error('  --report         Generate configuration report');
    console.error('  --all            Run all configuration steps');
    process.exit(1);
  }
  
  console.log(`🚀 LayerZero Endpoint Configuration Tool`);
  console.log(`Network: ${network}`);
  console.log('=' .repeat(60));
  
  try {
    switch (action) {
      case '--check':
        await checkCurrentConfiguration(network);
        break;
        
      case '--set-delegate':
        await checkCurrentConfiguration(network);
        await setDelegate(network, args.includes('--dry-run'));
        break;
        
      case '--configure-dvn':
        await checkCurrentConfiguration(network);
        await configureDVN(network, args.includes('--dry-run'));
        break;
        
      case '--test':
        await testQuote(network);
        break;
        
      case '--report':
        await generateReport(network);
        break;
        
      case '--all':
        await checkCurrentConfiguration(network);
        await setDelegate(network, args.includes('--dry-run'));
        await configureDVN(network, args.includes('--dry-run'));
        await testQuote(network);
        await generateReport(network);
        break;
        
      default:
        await checkCurrentConfiguration(network);
        await generateReport(network);
    }
    
    console.log('\n✅ Done!');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
#!/usr/bin/env node

/**
 * Test script to verify connection to existing Tenderly Virtual TestNet
 * Run with: node scripts/test-existing-tenderly-testnet.js
 */

// Load environment variables from .env.test
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple dotenv implementation
function loadEnvFile(filePath) {
  try {
    const envContent = readFileSync(filePath, 'utf8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
    return true;
  } catch (error) {
    console.warn(`⚠️ Could not load ${filePath}:`, error.message);
    return false;
  }
}

// Load environment variables
const envTestPath = join(__dirname, '..', '.env.test');
console.log('🔧 Loading environment variables...');
const envTestLoaded = loadEnvFile(envTestPath);
if (envTestLoaded) {
  console.log('✅ Loaded .env.test');
}

// Test existing Virtual TestNet
async function testExistingTenderlyTestNet() {
  console.log('🧪 Testing Existing Tenderly Virtual TestNet Connection\n');

  // Get RPC URL from environment or use the one from .env.test
  const rpcUrl = process.env.RPC_URL || 'YOUR_VIRTUAL_TESTNET_RPC_URL_HERE';
  
  if (rpcUrl === 'YOUR_VIRTUAL_TESTNET_RPC_URL_HERE') {
    console.log('❌ Please set RPC_URL in your .env.test file');
    console.log('   Get your Virtual TestNet RPC URL from:');
    console.log('   https://dashboard.tenderly.co/Dusss/project/testnet/92043a57-0a61-4b25-a28a-adeb8caaa270/integrate');
    console.log('   Look for "Admin RPC" or "Public RPC" URL\n');
    process.exit(1);
  }

  console.log('🔍 Configuration:');
  console.log(`   RPC URL: ${rpcUrl.substring(0, 50)}...`);
  console.log(`   TestNet ID: 92043a57-0a61-4b25-a28a-adeb8caaa270`);
  console.log('');

  try {
    // Test 1: Check if the RPC is responding
    console.log('📋 Test 1: Testing RPC connectivity...');
    const connectivityTest = await testRPCConnectivity(rpcUrl);
    
    if (!connectivityTest.success) {
      console.error('❌ RPC connectivity failed:', connectivityTest.error);
      return;
    }
    
    console.log('✅ RPC is responding');
    console.log(`   Chain ID: ${connectivityTest.chainId}`);
    console.log(`   Latest Block: ${connectivityTest.blockNumber}`);

    // Test 2: Fund a test account
    console.log('\n📋 Test 2: Testing account funding...');
    const testAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    
    const fundingResult = await fundAccount(rpcUrl, testAddress, '0xDE0B6B3A7640000'); // 1 ETH
    if (fundingResult.success) {
      console.log('✅ Account funded successfully');
      console.log(`   Transaction Hash: ${fundingResult.txHash}`);
    } else {
      console.log('⚠️ Account funding failed (might not have admin permissions)');
    }

    // Test 3: Send a test transaction
    console.log('\n📋 Test 3: Testing transaction sending...');
    const txResult = await sendTestTransaction(rpcUrl, {
      from: testAddress,
      to: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2',
      value: '0x16345785D8A0000', // 0.1 ETH
      gas: '0x5208',
      gasPrice: '0x0'
    });

    if (txResult.success) {
      console.log('✅ Test transaction sent successfully');
      console.log(`   Transaction Hash: ${txResult.txHash}`);
      
      // Extract testnet ID from RPC URL for explorer link
      const testnetMatch = rpcUrl.match(/([a-f0-9-]{36})/);
      if (testnetMatch) {
        const testnetId = testnetMatch[1];
        console.log(`   View in explorer: https://dashboard.tenderly.co/explorer/vnet/${testnetId}/tx/${txResult.txHash}`);
      }
    } else {
      console.log('⚠️ Transaction sending failed:', txResult.error);
    }

    console.log('\n🎉 Tenderly Virtual TestNet connection test completed!');
    console.log('\n💡 Your Virtual TestNet is working and accessible!');
    console.log('   You can now use this RPC URL in your cross-chain integration tests.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Verify the RPC_URL in .env.test is correct');
    console.log('   2. Check that your Virtual TestNet is still active');
    console.log('   3. Ensure the RPC URL has the right permissions');
  }
}

async function testRPCConnectivity(rpcUrl) {
  try {
    // Test basic connectivity
    const chainIdResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1
      })
    });

    if (!chainIdResponse.ok) {
      return { success: false, error: `HTTP ${chainIdResponse.status}` };
    }

    const chainIdResult = await chainIdResponse.json();
    if (chainIdResult.error) {
      return { success: false, error: chainIdResult.error.message };
    }

    // Get latest block number
    const blockResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 2
      })
    });

    const blockResult = await blockResponse.json();

    return {
      success: true,
      chainId: parseInt(chainIdResult.result, 16),
      blockNumber: parseInt(blockResult.result || '0x0', 16)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function fundAccount(rpcUrl, address, amount) {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tenderly_setBalance',
        params: [[address], amount],
        id: 3
      })
    });

    const result = await response.json();
    
    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, txHash: result.result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function sendTestTransaction(rpcUrl, txParams) {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        params: [txParams],
        id: 4
      })
    });

    const result = await response.json();
    
    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, txHash: result.result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Handle uncaught errors
process.on('unhandledRejection', async (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run the test
testExistingTenderlyTestNet(); 
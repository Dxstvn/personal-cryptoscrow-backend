#!/usr/bin/env node

/**
 * Test script to verify Tenderly Virtual TestNet integration
 * Run with: node scripts/test-tenderly-integration.js
 */

// Load environment variables from .env.test
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple dotenv implementation since we want to avoid dependencies
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
          if (!process.env[key]) { // Don't override existing env vars
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

// Try to load .env.test first, then .env as fallback
const envTestPath = join(__dirname, '..', '.env.test');
const envPath = join(__dirname, '..', '.env');

console.log('🔧 Loading environment variables...');
const envTestLoaded = loadEnvFile(envTestPath);
if (envTestLoaded) {
  console.log('✅ Loaded .env.test');
} else {
  const envLoaded = loadEnvFile(envPath);
  if (envLoaded) {
    console.log('✅ Loaded .env');
  } else {
    console.log('⚠️ No .env file found, using system environment variables');
  }
}

// Simple TenderlyClient for testing (without Jest dependencies)
class TenderlyTestClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = `${config.apiUrl}/account/${config.accountSlug}/project/${config.projectSlug}`;
    this.createdTestNets = new Map();
    
    // Determine if we should use mock mode
    this.mockMode = !config.accessKey || config.accessKey === 'test-key' || !config.accountSlug || config.accountSlug === 'dussjs';
    
    if (this.mockMode) {
      console.log(`🔧 Tenderly client initialized in MOCK MODE (no real API calls)`);
      console.log(`⚠️  Set TENDERLY_ACCESS_KEY environment variable for real testing`);
    } else {
      console.log(`🔧 Tenderly client initialized for ${config.accountSlug}/${config.projectSlug}`);
    }
  }

  async createVirtualTestNet(params = {}) {
    if (this.mockMode) {
      return this.createMockTestNet(params);
    }

    const testNetConfig = {
      slug: `integration-test-${Date.now()}`,
      display_name: params.name || 'Integration Test Virtual TestNet',
      fork_config: {
        network_id: params.networkId || 1,
        block_number: 'latest'
      },
      virtual_network_config: {
        chain_config: {
          chain_id: params.chainId || 73571
        }
      },
      sync_state_config: {
        enabled: false, // Disable to avoid charges
        commitment_level: 'latest'
      },
      explorer_page_config: {
        enabled: true,
        verification_visibility: 'bytecode'
      }
    };

    console.log(`🚀 Creating Virtual TestNet: ${testNetConfig.display_name}`);

    try {
      const response = await fetch(`${this.baseUrl}/vnets`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Access-Key': this.config.accessKey
        },
        body: JSON.stringify(testNetConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create Virtual TestNet: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      
      const adminRPC = result.rpcs?.find(rpc => rpc.name === 'Admin RPC')?.url;
      const publicRPC = result.rpcs?.find(rpc => rpc.name === 'Public RPC')?.url;

      if (!adminRPC) {
        throw new Error('Admin RPC URL not found in response');
      }

      const testNetInfo = {
        id: result.id,
        slug: result.slug,
        chainId: result.virtual_network_config?.chain_config?.chain_id,
        adminRPC,
        publicRPC,
        explorerUrl: `https://dashboard.tenderly.co/explorer/vnet/${result.id}`
      };

      this.createdTestNets.set(result.id, testNetInfo);
      
      console.log(`✅ Virtual TestNet created successfully:`);
      console.log(`   ID: ${testNetInfo.id}`);
      console.log(`   Chain ID: ${testNetInfo.chainId}`);
      console.log(`   Admin RPC: ${adminRPC}`);
      console.log(`   Explorer: ${testNetInfo.explorerUrl}`);

      return testNetInfo;
    } catch (error) {
      console.error(`❌ Failed to create Virtual TestNet:`, error.message);
      throw error;
    }
  }

  createMockTestNet(params = {}) {
    const mockId = `mock-${Date.now()}`;
    const testNetInfo = {
      id: mockId,
      slug: `test-${mockId}`,
      chainId: params.chainId || 73571,
      adminRPC: 'https://mock-rpc.tenderly.co/' + mockId,
      publicRPC: 'https://mock-public-rpc.tenderly.co/' + mockId,
      explorerUrl: 'https://mock-explorer.tenderly.co/vnet/' + mockId,
      isMock: true
    };

    this.createdTestNets.set(mockId, testNetInfo);
    
    console.log(`🎭 Mock Virtual TestNet created:`);
    console.log(`   ID: ${testNetInfo.id} (MOCK)`);
    console.log(`   Chain ID: ${testNetInfo.chainId}`);

    return testNetInfo;
  }

  async sendTestTransaction(testNet, from, to, value) {
    if (this.mockMode) {
      const mockHash = '0x' + Math.random().toString(16).substring(2, 66).padStart(64, '0');
      console.log(`🎭 Mock transaction created: ${mockHash}`);
      return mockHash;
    }

    console.log(`💰 Funding account ${from} with ${value} wei`);
    
    // Fund the sender account first
    const fundingData = {
      jsonrpc: '2.0',
      method: 'tenderly_setBalance',
      params: [[from], value],
      id: Date.now()
    };

    const fundResponse = await fetch(testNet.adminRPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fundingData)
    });

    if (!fundResponse.ok) {
      throw new Error(`Failed to fund account: ${fundResponse.status}`);
    }

    console.log(`✅ Account funded successfully`);

    // Send a test transaction
    console.log(`🔄 Sending test transaction: ${from} -> ${to}`);
    
    const transactionData = {
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      params: [{
        from,
        to,
        value: '0x16345785D8A0000', // 0.1 ETH
        gas: '0x5208',
        gasPrice: '0x0'
      }],
      id: Date.now()
    };

    const txResponse = await fetch(testNet.adminRPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionData)
    });

    if (!txResponse.ok) {
      throw new Error(`Transaction failed: ${txResponse.status}`);
    }

    const result = await txResponse.json();
    if (result.error) {
      throw new Error(`Transaction error: ${result.error.message}`);
    }

    const txHash = result.result;
    console.log(`✅ Transaction sent successfully: ${txHash}`);
    console.log(`   View in explorer: ${testNet.explorerUrl}/tx/${txHash}`);

    return txHash;
  }

  async cleanup() {
    if (this.mockMode) {
      console.log(`🧹 Cleaning up ${this.createdTestNets.size} mock testnets...`);
      this.createdTestNets.clear();
      return;
    }

    console.log(`🧹 Cleaning up ${this.createdTestNets.size} created testnets...`);
    
    for (const [testNetId, testNet] of this.createdTestNets) {
      try {
        const response = await fetch(`${this.baseUrl}/vnets/${testNetId}`, {
          method: 'DELETE',
          headers: {
            'X-Access-Key': this.config.accessKey
          }
        });
        
        if (response.ok) {
          console.log(`✅ Deleted testnet: ${testNet.slug}`);
        } else {
          console.warn(`⚠️ Failed to delete testnet ${testNet.slug}: ${response.status}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error deleting testnet ${testNet.slug}:`, error.message);
      }
    }
    
    this.createdTestNets.clear();
  }
}

// Main test function
async function testTenderlyIntegration() {
  console.log('🧪 Testing Tenderly Virtual TestNet Integration\n');

  const config = {
    accountSlug: process.env.TENDERLY_ACCOUNT_SLUG || 'dussjs',
    projectSlug: process.env.TENDERLY_PROJECT_SLUG || 'project',
    accessKey: process.env.TENDERLY_ACCESS_KEY || 'test-key',
    apiUrl: 'https://api.tenderly.co/api/v1'
  };

  // Debug output to show what credentials were loaded
  console.log('🔍 Tenderly Configuration:');
  console.log(`   Account Slug: ${config.accountSlug}`);
  console.log(`   Project Slug: ${config.projectSlug}`);
  console.log(`   Access Key: ${config.accessKey ? config.accessKey.slice(0, 8) + '...' + config.accessKey.slice(-4) : 'NOT SET'}`);
  console.log(`   API URL: ${config.apiUrl}\n`);

  const client = new TenderlyTestClient(config);
  
  try {
    // Test 1: Create Virtual TestNet
    console.log('\n📋 Test 1: Creating Virtual TestNet...');
    const testNet = await client.createVirtualTestNet({
      name: 'Integration Test',
      chainId: 73571,
      networkId: 1
    });

    // Test 2: Send a test transaction
    console.log('\n📋 Test 2: Sending test transaction...');
    const testAddresses = {
      from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      to: '0x742d35Cc6634C0532925a3b8D51d9bB98A42b4B2'
    };

    const txHash = await client.sendTestTransaction(
      testNet,
      testAddresses.from,
      testAddresses.to,
      '0xDE0B6B3A7640000' // 1 ETH
    );

    console.log('\n🎉 All tests passed successfully!');
    
    if (!client.mockMode) {
      console.log('\n📊 Results:');
      console.log(`   ✅ Virtual TestNet created: ${testNet.id}`);
      console.log(`   ✅ Transaction sent: ${txHash}`);
      console.log(`   🔗 View in dashboard: ${testNet.explorerUrl}`);
      console.log('\n💡 You should now see this transaction in your Tenderly dashboard!');
    } else {
      console.log('\n💡 This was a mock test. Set TENDERLY_ACCESS_KEY for real testing.');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check that TENDERLY_ACCESS_KEY is set correctly in .env.test');
    console.log('   2. Verify TENDERLY_ACCOUNT_SLUG and TENDERLY_PROJECT_SLUG match your Tenderly project');
    console.log('   3. Ensure your access key has the right permissions');
    console.log('   4. Check that .env.test file exists and is readable');
    
    process.exit(1);
  } finally {
    // Cleanup
    await client.cleanup();
  }
}

// Handle uncaught errors
process.on('unhandledRejection', async (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run the test
testTenderlyIntegration(); 
#!/usr/bin/env node

/**
 * Setup Cross-Chain Virtual TestNets for Tenderly Dashboard
 * 
 * This script creates multiple Virtual TestNets across different networks
 * to enable comprehensive cross-chain testing and show various wallets
 * from different networks in the Tenderly dashboard.
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.test' });

const TENDERLY_API_BASE = 'https://api.tenderly.co/api/v1';
const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY || 'gAMGpVldgYDEApaRb0PzF63OnwKRvhn';
const TENDERLY_ACCOUNT = process.env.TENDERLY_ACCOUNT_SLUG || 'Dusss';
const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT_SLUG || 'project';

// Cross-chain test wallets for different scenarios
const CROSS_CHAIN_WALLETS = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    role: 'buyer-ethereum',
    description: 'Ethereum Buyer Account'
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    role: 'seller-ethereum', 
    description: 'Ethereum Seller Account'
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    role: 'buyer-polygon',
    description: 'Polygon Buyer Account'
  },
  {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    role: 'seller-polygon',
    description: 'Polygon Seller Account'
  },
  {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    role: 'buyer-arbitrum',
    description: 'Arbitrum Buyer Account'
  },
  {
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    role: 'seller-arbitrum',
    description: 'Arbitrum Seller Account'
  },
  {
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    role: 'buyer-base',
    description: 'Base Buyer Account'
  },
  {
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    role: 'seller-base',
    description: 'Base Seller Account'
  },
  {
    address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
    role: 'service-wallet',
    description: 'Cross-Chain Service Wallet'
  }
];

// Network configurations for cross-chain testing
const NETWORK_CONFIGS = [
  {
    name: 'Ethereum Mainnet CrossChain',
    slug: 'ethereum-crosschain',
    network_id: '1',
    chain_id: 73571, // Custom chain ID
    description: 'Ethereum Virtual TestNet for cross-chain source transactions',
    public_explorer: true
  },
  {
    name: 'Polygon CrossChain', 
    slug: 'polygon-crosschain',
    network_id: '137',
    chain_id: 73572, // Custom chain ID
    description: 'Polygon Virtual TestNet for cross-chain destination transactions',
    public_explorer: true
  },
  {
    name: 'Arbitrum CrossChain',
    slug: 'arbitrum-crosschain', 
    network_id: '42161',
    chain_id: 73573, // Custom chain ID
    description: 'Arbitrum Virtual TestNet for cross-chain testing',
    public_explorer: true
  },
  {
    name: 'Base CrossChain',
    slug: 'base-crosschain',
    network_id: '8453', 
    chain_id: 73574, // Custom chain ID
    description: 'Base Virtual TestNet for cross-chain testing',
    public_explorer: true
  },
  {
    name: 'Optimism CrossChain',
    slug: 'optimism-crosschain',
    network_id: '10',
    chain_id: 73575, // Custom chain ID  
    description: 'Optimism Virtual TestNet for cross-chain testing',
    public_explorer: true
  }
];

class TenderlyVirtualTestNetManager {
  constructor() {
    this.headers = {
      'Authorization': `Bearer ${TENDERLY_ACCESS_KEY}`,
      'Content-Type': 'application/json',
      'X-Access-Key': TENDERLY_ACCESS_KEY
    };
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    const url = `${TENDERLY_API_BASE}${endpoint}`;
    
    const options = {
      method,
      headers: this.headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    console.log(`🌐 ${method} ${url}`);
    
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Request failed: ${response.status} ${response.statusText}`);
        console.error(`Error details: ${errorText}`);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`❌ Network error:`, error.message);
      return null;
    }
  }

  async createVirtualTestNet(config) {
    console.log(`\n🚀 Creating Virtual TestNet: ${config.name}`);
    
    const payload = {
      display_name: config.name,
      slug: config.slug,
      description: config.description,
      network_id: config.network_id,
      chain_config: {
        chain_id: config.chain_id
      },
      public_explorer: config.public_explorer,
      explorer_page: {
        enabled: true,
        verification_visibility: "src"
      }
    };

    const result = await this.makeRequest(
      `/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/testnet`,
      'POST',
      payload
    );

    if (result) {
      console.log(`✅ Virtual TestNet created: ${config.name}`);
      console.log(`   📍 TestNet ID: ${result.id}`);
      console.log(`   🔗 RPC URL: ${result.rpc_url}`);
      console.log(`   🌐 Explorer: ${result.explorer_url || 'N/A'}`);
      return result;
    } else {
      console.log(`❌ Failed to create Virtual TestNet: ${config.name}`);
      return null;
    }
  }

  async fundAccountOnTestNet(testNetId, wallet, amount = '10') {
    console.log(`💰 Funding ${wallet.description} (${wallet.address}) with ${amount} ETH on TestNet ${testNetId}`);
    
    const payload = {
      accounts: [
        {
          address: wallet.address,
          amount: amount
        }
      ]
    };

    const result = await this.makeRequest(
      `/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/testnet/${testNetId}/fund`,
      'POST', 
      payload
    );

    if (result) {
      console.log(`✅ Successfully funded ${wallet.description}`);
      return true;
    } else {
      console.log(`❌ Failed to fund ${wallet.description}`);
      return false;
    }
  }

  async fundTokensOnTestNet(testNetId, wallet, tokenAddress, amount = '10000') {
    console.log(`🪙 Funding ${wallet.description} with ${amount} tokens (${tokenAddress})`);
    
    const payload = {
      accounts: [
        {
          address: wallet.address,
          amount: amount,
          token_address: tokenAddress
        }
      ]
    };

    const result = await this.makeRequest(
      `/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/testnet/${testNetId}/fund-erc20`,
      'POST',
      payload
    );

    if (result) {
      console.log(`✅ Successfully funded ${wallet.description} with tokens`);
      return true;
    } else {
      console.log(`❌ Failed to fund ${wallet.description} with tokens`);
      return false;
    }
  }

  async setupCrossChainWallets(testNet, networkConfig) {
    console.log(`\n💳 Setting up cross-chain wallets for ${networkConfig.name}...`);
    
    // Fund all wallets with native token (ETH/MATIC/etc)
    for (const wallet of CROSS_CHAIN_WALLETS) {
      await this.fundAccountOnTestNet(testNet.id, wallet, '10');
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Fund specific token balances based on network
    const tokenAddresses = this.getTokenAddresses(networkConfig.network_id);
    
    for (const tokenAddress of tokenAddresses) {
      for (const wallet of CROSS_CHAIN_WALLETS.slice(0, 4)) { // Fund first 4 wallets with tokens
        await this.fundTokensOnTestNet(testNet.id, wallet, tokenAddress, '10000');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  getTokenAddresses(networkId) {
    const tokens = {
      '1': [ // Ethereum
        '0xA0b86a33E6417c38c53A81C1b9FB17c3cd6b0f94', // USDC
        '0x6B175474E89094C44Da98b954EedeAC495271d0F'  // DAI
      ],
      '137': [ // Polygon
        '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
        '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'  // DAI
      ],
      '42161': [ // Arbitrum
        '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // USDC
        '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'  // DAI
      ],
      '8453': [ // Base
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'  // DAI
      ],
      '10': [ // Optimism
        '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // USDC
        '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'  // DAI
      ]
    };
    
    return tokens[networkId] || [];
  }

  async setupAllNetworks() {
    console.log('🌍 Setting up Cross-Chain Virtual TestNets...');
    console.log(`📊 Account: ${TENDERLY_ACCOUNT}`);
    console.log(`📁 Project: ${TENDERLY_PROJECT}`);
    console.log(`🔑 Using Access Key: ${TENDERLY_ACCESS_KEY.substring(0, 8)}...`);
    
    const createdTestNets = [];

    for (const config of NETWORK_CONFIGS) {
      console.log(`\n${'='.repeat(50)}`);
      
      const testNet = await this.createVirtualTestNet(config);
      
      if (testNet) {
        createdTestNets.push({ testNet, config });
        
        // Wait a bit for the testnet to be ready
        console.log('⏳ Waiting for TestNet to initialize...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Setup wallets and funding
        await this.setupCrossChainWallets(testNet, config);
      }
      
      // Delay between network creation to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return createdTestNets;
  }

  async listExistingTestNets() {
    console.log('\n📋 Checking existing Virtual TestNets...');
    
    const result = await this.makeRequest(
      `/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/testnets`
    );

    if (result && result.testnets) {
      console.log(`\n📊 Found ${result.testnets.length} existing Virtual TestNets:`);
      result.testnets.forEach((testnet, index) => {
        console.log(`${index + 1}. ${testnet.display_name || testnet.slug}`);
        console.log(`   🆔 ID: ${testnet.id}`);
        console.log(`   🌐 Network: ${testnet.network_id}`);
        console.log(`   🔗 RPC: ${testnet.rpc_url || 'N/A'}`);
        console.log('');
      });
      return result.testnets;
    } else {
      console.log('❌ Failed to retrieve existing TestNets');
      return [];
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Tenderly Cross-Chain Virtual TestNet Setup');
  console.log('='.repeat(50));
  
  const manager = new TenderlyVirtualTestNetManager();
  
  // First, list existing testnets
  await manager.listExistingTestNets();
  
  // Create new cross-chain testnets
  const createdTestNets = await manager.setupAllNetworks();
  
  console.log('\n🎉 Cross-Chain Virtual TestNet Setup Complete!');
  console.log('='.repeat(50));
  
  if (createdTestNets.length > 0) {
    console.log(`✅ Successfully created ${createdTestNets.length} Virtual TestNets`);
    console.log('\n📋 Summary:');
    
    createdTestNets.forEach(({ testNet, config }) => {
      console.log(`\n🌐 ${config.name}:`);
      console.log(`   📍 TestNet ID: ${testNet.id}`);
      console.log(`   🔗 RPC URL: ${testNet.rpc_url}`);
      console.log(`   ⛓️  Chain ID: ${config.chain_id}`);
      console.log(`   🌍 Network ID: ${config.network_id}`);
    });
    
    console.log('\n💡 Tips:');
    console.log('• Check your Tenderly Dashboard to see all networks');
    console.log('• Each network has funded wallets ready for cross-chain testing');
    console.log('• Use these RPC URLs in your development environment');
    console.log('• TestNets have public explorers enabled for transaction visibility');
    
  } else {
    console.log('❌ No Virtual TestNets were created');
  }
}

// Handle errors gracefully
main().catch(error => {
  console.error('\n💥 Setup failed with error:', error.message);
  console.error('\nPossible issues:');
  console.error('• Invalid Tenderly access key');
  console.error('• Network connectivity issues');
  console.error('• Rate limiting from Tenderly API');
  console.error('• Insufficient permissions');
  process.exit(1);
}); 
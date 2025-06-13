import dotenv from 'dotenv';

// Load environment variables from .env.testnets (where Tenderly config is located)
dotenv.config({ path: '.env.testnets' });

// Map Tenderly variables to expected names
if (process.env.TENDERLY_ETHEREUM_MAINNET && !process.env.RPC_URL) {
  process.env.RPC_URL = process.env.TENDERLY_ETHEREUM_MAINNET;
}

// Extract virtual testnet ID from dashboard URL if available
if (process.env.ETHEREUM_TESTNET_ID && !process.env.TENDERLY_VIRTUAL_TESTNET_ID) {
  const testnetIdMatch = process.env.ETHEREUM_TESTNET_ID.match(/testnet\/([a-f0-9-]+)/);
  if (testnetIdMatch) {
    process.env.TENDERLY_VIRTUAL_TESTNET_ID = testnetIdMatch[1];
  }
}

export const tenderlyConfig = {
  accessKey: process.env.TENDERLY_ACCESS_KEY,
  accountSlug: process.env.TENDERLY_ACCOUNT_SLUG,
  projectSlug: process.env.TENDERLY_PROJECT_SLUG,
  virtualTestnetId: process.env.TENDERLY_VIRTUAL_TESTNET_ID,
  rpcUrl: process.env.RPC_URL,
  
  // Additional network-specific RPC URLs available
  networks: {
    ethereum: process.env.TENDERLY_ETHEREUM_MAINNET,
    polygon: process.env.TENDERLY_POLYGON,
    arbitrum: process.env.TENDERLY_ARBITRUM_ONE,
    base: process.env.TENDERLY_BASE,
    optimism: process.env.TENDERLY_OPTIMISM
  },
  
  // Testnet dashboard URLs
  testnetUrls: {
    ethereum: process.env.ETHEREUM_TESTNET_ID,
    polygon: process.env.POLYGON_TESTNET_ID,
    arbitrum: process.env.ARBITRUM_ONE_TESTNET_ID,
    base: process.env.BASE_TESTNET_ID,
    optimism: process.env.OPTIMISM_TESTNET_ID
  }
};

// Validate all required credentials are present
export function validateTenderlyConfig() {
  const required = ['accessKey', 'accountSlug', 'projectSlug', 'rpcUrl'];
  const missing = required.filter(key => !tenderlyConfig[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing Tenderly config: ${missing.join(', ')}`);
  }
  
  console.log('✅ Tenderly configuration validated');
  return true;
}

// Log configuration status (with masked keys for security)
export function logConfigStatus() {
  console.log('🔧 Tenderly Configuration Status:');
  console.log(`   Access Key: ${tenderlyConfig.accessKey ? 'SET' : 'NOT SET'}`);
  console.log(`   Account Slug: ${tenderlyConfig.accountSlug || 'NOT SET'}`);
  console.log(`   Project Slug: ${tenderlyConfig.projectSlug || 'NOT SET'}`);
  console.log(`   RPC URL: ${tenderlyConfig.rpcUrl ? 'SET' : 'NOT SET'}`);
  console.log(`   Virtual TestNet ID: ${tenderlyConfig.virtualTestnetId || 'NOT SET'}`);
  
  if (tenderlyConfig.rpcUrl) {
    console.log(`   Full RPC URL: ${tenderlyConfig.rpcUrl.substring(0, 50)}...`);
  }
} 
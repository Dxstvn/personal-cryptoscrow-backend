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

// Tenderly configuration for E2E testing
export const tenderlyConfig = {
  accessKey: process.env.TENDERLY_ACCESS_KEY,
  accountSlug: process.env.TENDERLY_ACCOUNT_SLUG,
  projectSlug: process.env.TENDERLY_PROJECT_SLUG,
  rpcUrl: process.env.TENDERLY_ETHEREUM_MAINNET || process.env.RPC_URL || 'https://virtual.mainnet.rpc.tenderly.co/51eccaa8-2319-4c5d-8c94-10fff0684681',
  virtualTestNetId: process.env.TENDERLY_VIRTUAL_TESTNET_ID || 'df424811-49e2-43ab-a750-67055d314d37',
  forkId: process.env.TENDERLY_FORK_ID
};

export function validateTenderlyConfig() {
  const required = ['accessKey', 'accountSlug', 'projectSlug'];
  const missing = required.filter(key => !tenderlyConfig[key]);
  
  if (missing.length > 0) {
    const errorMsg = `Missing required Tenderly configuration: ${missing.join(', ')}`;
    console.error('❌', errorMsg);
    throw new Error(errorMsg);
  }
  
  // Validate RPC URL format
  if (!tenderlyConfig.rpcUrl || !tenderlyConfig.rpcUrl.startsWith('http')) {
    console.warn('⚠️ Invalid or missing RPC URL, using default Tenderly URL');
    tenderlyConfig.rpcUrl = 'https://virtual.mainnet.rpc.tenderly.co/51eccaa8-2319-4c5d-8c94-10fff0684681';
  }
  
  console.log('✅ Tenderly configuration validated');
  return true;
}

export function logConfigStatus() {
  console.log('🔧 Tenderly Configuration Status:');
  console.log('   Access Key:', tenderlyConfig.accessKey ? 'SET' : 'MISSING');
  console.log('   Account Slug:', tenderlyConfig.accountSlug || 'MISSING');
  console.log('   Project Slug:', tenderlyConfig.projectSlug || 'MISSING');
  console.log('   RPC URL:', tenderlyConfig.rpcUrl ? 'SET' : 'MISSING');
  console.log('   Virtual TestNet ID:', tenderlyConfig.virtualTestNetId || 'MISSING');
  
  if (tenderlyConfig.rpcUrl) {
    // Only show first part for security, but confirm it's using HTTPS
    const isHttps = tenderlyConfig.rpcUrl.startsWith('https://');
    const urlPreview = tenderlyConfig.rpcUrl.substring(0, 25) + '...';
    console.log(`   Full RPC URL: ${urlPreview} (${isHttps ? 'HTTPS ✅' : 'HTTP ⚠️'})`);
  }
}

export function getTenderlyRpcUrl() {
  validateTenderlyConfig();
  return tenderlyConfig.rpcUrl;
} 
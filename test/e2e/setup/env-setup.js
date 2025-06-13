// Environment setup for E2E tests
import dotenv from 'dotenv';

// Load test environment variables from .env.testnets (where Tenderly config is located)
dotenv.config({ path: '.env.testnets' });

// Override NODE_ENV for E2E tests
process.env.NODE_ENV = 'e2e_test';

// Map Tenderly variables to expected names for E2E tests
if (process.env.TENDERLY_ETHEREUM_MAINNET && !process.env.RPC_URL) {
  process.env.RPC_URL = process.env.TENDERLY_ETHEREUM_MAINNET;
  console.log('🔗 Mapped TENDERLY_ETHEREUM_MAINNET to RPC_URL for E2E tests');
}

// Set a virtual testnet ID from the Ethereum testnet ID if available
if (process.env.ETHEREUM_TESTNET_ID && !process.env.TENDERLY_VIRTUAL_TESTNET_ID) {
  // Extract the testnet ID from the dashboard URL
  const testnetIdMatch = process.env.ETHEREUM_TESTNET_ID.match(/testnet\/([a-f0-9-]+)/);
  if (testnetIdMatch) {
    process.env.TENDERLY_VIRTUAL_TESTNET_ID = testnetIdMatch[1];
    console.log('🎯 Extracted Virtual TestNet ID from Ethereum testnet URL');
  }
}

// Set a default TEST_DEPLOYER_PRIVATE_KEY if not set
if (!process.env.TEST_DEPLOYER_PRIVATE_KEY) {
  // Use standard Hardhat test account private key for E2E testing
  process.env.TEST_DEPLOYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  console.log('🔑 Set default TEST_DEPLOYER_PRIVATE_KEY for E2E testing');
}

// Ensure required environment variables are set
const requiredEnvVars = [
  'RPC_URL',
  'TENDERLY_ACCESS_KEY',
  'TENDERLY_ACCOUNT_SLUG',
  'TENDERLY_PROJECT_SLUG'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`⚠️ Missing environment variables for E2E tests: ${missingVars.join(', ')}`);
  console.log('📝 Some E2E tests may be skipped or fail');
} else {
  console.log('✅ All required environment variables are set');
}

// Set test-specific configurations
process.env.LOG_LEVEL = 'debug';
process.env.ENABLE_CORS = 'true';
process.env.ENABLE_TENDERLY_LOGS = 'true';

console.log('🌍 E2E Environment setup completed');
console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   RPC URL: ${process.env.RPC_URL ? process.env.RPC_URL.substring(0, 50) + '...' : 'NOT SET'}`);
console.log(`   Tenderly Account: ${process.env.TENDERLY_ACCOUNT_SLUG || 'NOT SET'}`);
console.log(`   Tenderly Project: ${process.env.TENDERLY_PROJECT_SLUG || 'NOT SET'}`);
console.log(`   Virtual TestNet ID: ${process.env.TENDERLY_VIRTUAL_TESTNET_ID || 'NOT SET'}`);
console.log(`   Test Deployer Key: ${process.env.TEST_DEPLOYER_PRIVATE_KEY ? 'SET' : 'NOT SET'}`); 
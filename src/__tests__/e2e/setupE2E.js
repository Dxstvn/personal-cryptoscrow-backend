// setupE2E.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load e2e specific environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test.e2e') });

// Increase timeout for e2e tests
jest.setTimeout(30000);

// Global setup before all tests
beforeAll(async () => {
  console.log('🚀 Starting E2E test setup...');
  
  // Ensure we're in e2e_test environment
  expect(process.env.NODE_ENV).toBe('e2e_test');
  
  // Verify critical environment variables
  const requiredEnvVars = [
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'RPC_URL',
    'TEST_USER_A_EMAIL',
    'TEST_USER_A_PK',
    'TEST_USER_A_PASSWORD',
    'TEST_USER_B_EMAIL',
    'TEST_USER_B_PK',
    'TEST_USER_B_PASSWORD',
    'BACKEND_WALLET_PRIVATE_KEY'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
    // Log only non-sensitive environment variables for debugging
    if (envVar.endsWith('_EMAIL') || envVar === 'RPC_URL') {
      console.log(`Loaded ${envVar}: ${process.env[envVar]}`);
    } else if (envVar.includes('EMULATOR_HOST')) {
      console.log(`Loaded ${envVar}: ${process.env[envVar]}`);
    } else {
      // For sensitive variables, just confirm they're loaded
      console.log(`Loaded ${envVar}: [CONFIGURED]`);
    }
  }
  
  console.log('✅ E2E test environment verified');
});

// Global teardown after all tests
afterAll(async () => {
  console.log('🧹 Cleaning up E2E tests...');
  
  // Allow some time for any pending operations to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ E2E test cleanup complete');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
}); 
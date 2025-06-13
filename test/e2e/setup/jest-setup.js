// Jest setup for E2E tests
import './env-setup.js'; // Load environment setup first
import { validateTenderlyConfig, logConfigStatus } from './tenderly-config.js';

// Global test configuration
global.testStartTime = Date.now();

// Setup custom matchers and assertions
expect.extend({
  toBeEthereumAddress(received) {
    const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid Ethereum address`,
      pass: isValidAddress
    };
  },
  
  toBeTransactionHash(received) {
    const isValidTxHash = /^0x[a-fA-F0-9]{64}$/.test(received);
    return {
      message: () => `expected ${received} to be a valid transaction hash`,
      pass: isValidTxHash
    };
  }
});

// Global setup for all E2E tests
beforeAll(async () => {
  console.log('🧪 Jest E2E Setup - Initializing test environment...');
  
  // Log environment configuration
  logConfigStatus();
  
  // Validate Tenderly configuration
  try {
    validateTenderlyConfig();
    console.log('✅ Tenderly configuration validated successfully');
  } catch (error) {
    console.warn('⚠️ Tenderly configuration validation failed:', error.message);
    console.log('   Some E2E tests may be skipped or fail');
  }
  
  // Setup global test configuration (timeout configured in jest.e2e.config.js)
  console.log(`   Test timeout: 120 seconds`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   Start time: ${new Date(global.testStartTime).toISOString()}`);
  
  console.log('🚀 E2E test environment ready');
});

// Global cleanup
afterAll(async () => {
  const testDuration = Date.now() - global.testStartTime;
  console.log(`\n🏁 E2E Test Suite Completed`);
  console.log(`   Duration: ${Math.round(testDuration / 1000)}s`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

console.log('🔧 Jest E2E setup file loaded'); 
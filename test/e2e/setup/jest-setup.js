// Jest setup for E2E tests
import './env-setup.js'; // Load environment setup first
import { validateTenderlyConfig, logConfigStatus } from './tenderly-config.js';
import { initializeFirestoreForE2E } from './firestore-config.js';
import http from 'http';
import https from 'https';

// Global test configuration
global.testStartTime = Date.now();

// Initialize resource tracking
if (!global.axiosInstances) {
  global.axiosInstances = [];
}
if (!global.testProviders) {
  global.testProviders = [];
}
if (!global.testTimeouts) {
  global.testTimeouts = [];
}
if (!global.testIntervals) {
  global.testIntervals = [];
}

// Configure HTTP agents for better connection management
const httpAgent = new http.Agent({
  keepAlive: false,
  timeout: 30000,
  keepAliveMsecs: 0,
  maxSockets: 10,
  maxFreeSockets: 0
});

const httpsAgent = new https.Agent({
  keepAlive: false,
  timeout: 30000,
  keepAliveMsecs: 0,
  maxSockets: 10,
  maxFreeSockets: 0
});

// Override default agents to prevent connection pooling issues
http.globalAgent = httpAgent;
https.globalAgent = httpsAgent;

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
  
  // Initialize Firestore first to prevent RetryOptions errors
  try {
    await initializeFirestoreForE2E();
    console.log('✅ Firestore initialized for E2E tests');
  } catch (error) {
    console.warn('⚠️ Firestore initialization failed:', error.message);
  }
  
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
  console.log('   HTTP Agent Configuration: Keep-alive disabled for clean shutdown');
  
  console.log('🚀 E2E test environment ready');
}, 30000);

// Global cleanup after each test file
afterAll(async () => {
  console.log('\n🧹 Performing Jest setup cleanup...');
  
  try {
    // Clean up Firestore for E2E tests
    const { cleanupFirestoreForE2E } = await import('./firestore-config.js');
    await cleanupFirestoreForE2E();
    
    // Clean up HTTP agents
    if (httpAgent) {
      httpAgent.destroy();
    }
    if (httpsAgent) {
      httpsAgent.destroy();
    }
    
    // Clean up any tracked Axios instances
    if (global.axiosInstances && global.axiosInstances.length > 0) {
      for (const instance of global.axiosInstances) {
        try {
          if (instance.defaults.httpAgent) {
            instance.defaults.httpAgent.destroy();
          }
          if (instance.defaults.httpsAgent) {
            instance.defaults.httpsAgent.destroy();
          }
        } catch (error) {
          console.warn('Warning during Axios cleanup:', error.message);
        }
      }
      global.axiosInstances = [];
    }
    
    // Clean up any remaining timeouts/intervals
    if (global.testTimeouts && global.testTimeouts.length > 0) {
      global.testTimeouts.forEach(clearTimeout);
      global.testTimeouts = [];
    }
    
    if (global.testIntervals && global.testIntervals.length > 0) {
      global.testIntervals.forEach(clearInterval);
      global.testIntervals = [];
    }
    
    console.log('✅ Jest setup cleanup completed');
  } catch (error) {
    console.warn('⚠️ Warning during Jest setup cleanup:', error.message);
  }
  
  const testDuration = Date.now() - global.testStartTime;
  console.log(`\n🏁 E2E Test Suite Completed`);
  console.log(`   Duration: ${Math.round(testDuration / 1000)}s`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
});

// Enhanced error handling for better debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process in tests, just log
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit process in tests, just log
});

// Handle SIGTERM gracefully
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, cleaning up...');
  
  // Clean up HTTP agents
  try {
    if (httpAgent) httpAgent.destroy();
    if (httpsAgent) httpsAgent.destroy();
    http.globalAgent.destroy();
    https.globalAgent.destroy();
  } catch (error) {
    console.warn('Warning during SIGTERM cleanup:', error.message);
  }
  
  process.exit(0);
});

console.log('🔧 Jest E2E setup file loaded with enhanced HTTP connection management'); 
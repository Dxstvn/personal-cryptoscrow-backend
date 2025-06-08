// jest.production.setup.js - Lightweight setup for production readiness tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-test';
process.env.FIREBASE_STORAGE_BUCKET = 'demo-test.appspot.com';

// Set emulator hosts for integration tests (only if needed)
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5004';
}
if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
}

// Set test credentials (safe values for testing)
process.env.JWT_SECRET = 'test-jwt-secret-for-production-validation';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';
process.env.DATABASE_ENCRYPTION_KEY = 'test-db-encryption-key-32-chars';

// Blockchain test configuration (no actual blockchain needed for most tests)
process.env.RPC_URL = 'http://localhost:8545';
process.env.CHAIN_ID = '31337';
process.env.DEPLOYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
process.env.BACKEND_WALLET_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

// Email test configuration
process.env.SMTP_HOST = 'test.smtp.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'testpassword';

// API test configuration
process.env.ALLOWED_EMAILS = 'test@example.com,admin@example.com';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Increase timeout for async operations
// Note: jest.setTimeout() may not be available in all Jest setups
if (typeof jest !== 'undefined' && jest.setTimeout) {
  jest.setTimeout(30000);
}

// Global test utilities
global.testTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Suppress console warnings in tests for cleaner output
const originalWarn = console.warn;
console.warn = (...args) => {
  const message = args[0];
  // Suppress known warnings that don't affect functionality
  if (typeof message === 'string' && (
    message.includes('ExperimentalWarning') ||
    message.includes('experimental') ||
    message.includes('deprecated')
  )) {
    return;
  }
  originalWarn.apply(console, args);
};

console.log('🧪 Production test environment configured');
console.log(`📋 Running in: ${process.env.NODE_ENV} mode`);
console.log(`🔧 Firebase Project: ${process.env.FIREBASE_PROJECT_ID}`); 
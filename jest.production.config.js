// jest.production.config.js - Fast, reliable tests for production readiness
/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  testEnvironment: 'node',
  
  // NO global setup/teardown - avoid heavy blockchain/emulator startup
  // globalSetup: undefined,
  // globalTeardown: undefined,
  
  clearMocks: true,
  collectCoverage: false, // Disable coverage for speed in production checks
  
  // Fast timeout for production readiness
  testTimeout: 15000, // 15 seconds max per test
  
  // Optimized test patterns - focus on critical path validation
  testMatch: [
    // Include unit tests (fast, no external dependencies)
    '**/unit/**/*.test.js',
    '**/*.unit.test.js',
    
    // Include integration tests that don't require blockchain
    '**/integration/**/loginSignUp.integration.test.js',
    '**/integration/**/contactRoutes.integration.test.js', 
    '**/integration/**/databaseService.integration.test.js',
    
    // Exclude heavy E2E and blockchain tests
    '!**/e2e/**/*.test.js',
    '!**/blockchain/**/*.test.js',
    '!**/*blockchainService*.test.js',
    '!**/*contractDeployer*.test.js'
  ],
  
  // Test environment setup for emulator-based tests
  setupFilesAfterEnv: ['<rootDir>/jest.production.setup.js'],
  
  // Performance optimizations
  maxWorkers: '50%', // Use half of available CPU cores
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Only test critical paths for production readiness
  collectCoverageFrom: [
    'src/api/routes/auth/**/*.js',
    'src/api/routes/database/**/*.js', 
    'src/api/routes/contact/**/*.js',
    'src/services/databaseService.js',
    'src/api/middleware/**/*.js',
    '!src/**/__tests__/**',
    '!src/**/*.test.js',
    '!src/**/*.config.js',
  ],
  
  // Faster reporter for CI/production checks
  reporters: ['default'],
  
  // Module resolution optimizations
  moduleFileExtensions: ['js', 'json'],
  
  // Fail fast on first test failure in production checks
  bail: 1,
  
  // Verbose output for debugging production issues
  verbose: true
};

export default config; 
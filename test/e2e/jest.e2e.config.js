export default {
  displayName: 'E2E Tests - Real Tenderly Integration',
  rootDir: '../../', // Set root to project root
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/e2e/**/*.test.js'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/test/e2e/setup/jest-setup.js'
  ],
  globalSetup: '<rootDir>/test/e2e/setup/global-setup.js',
  globalTeardown: '<rootDir>/test/e2e/setup/global-teardown.js',
  // Environment variables for E2E tests
  setupFiles: [
    '<rootDir>/test/e2e/setup/env-setup.js'
  ],
  testTimeout: 120000, // 2 minutes for real network operations
  maxWorkers: 1, // Run tests sequentially to avoid conflicts
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  openHandlesTimeout: 10000, // Wait 10 seconds for handles to close (increased)
  workerIdleMemoryLimit: '512MB',
  // Additional cleanup options
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  resetModules: true, // Reset modules between tests
  // Aggressive cleanup
  testEnvironmentOptions: {
    // Node.js specific options for better cleanup
    NODE_ENV: 'test'
  },
  // Coverage settings
  coverageDirectory: '<rootDir>/coverage/e2e',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/test/**'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'json'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/'
  ],
  reporters: [
    'default'
  ],
  // Error handling
  errorOnDeprecated: false, // Don't fail on deprecation warnings during cleanup
  silent: false,
  // Custom test sequencer for better resource management - temporarily disabled
  // testSequencer: '<rootDir>/test/e2e/setup/test-sequencer.js'
}; 
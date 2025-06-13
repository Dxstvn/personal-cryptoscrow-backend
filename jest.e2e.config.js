// jest.e2e.config.js
export default {
  displayName: 'E2E Tests with Tenderly',
  testMatch: ['<rootDir>/test/e2e/**/*.test.js'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/e2e/setup/jest-setup.js'],
  testTimeout: 120000, // 2 minutes for e2e tests
  verbose: true,
  collectCoverage: false, // Usually disabled for e2e tests
  
  // Module resolution
  preset: null,
  
  // Transform configuration for ES modules
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      plugins: ['babel-plugin-transform-import-meta']
    }]
  },
  
  // Test sequencing - run tests serially for e2e
  maxWorkers: 1,
  
  // Environment variables for e2e tests
  testEnvironmentOptions: {},
  
  // Global variables
  globals: {
    'process.env.NODE_ENV': 'e2e_test'
  },
  
  // Test patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/tests/',  // Ignore the old tests directory
    '<rootDir>/src/__tests__/'
  ],
  
  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  
  // Setup and teardown
  globalSetup: '<rootDir>/test/e2e/setup/global-setup.js',
  globalTeardown: '<rootDir>/test/e2e/setup/global-teardown.js',
}; 
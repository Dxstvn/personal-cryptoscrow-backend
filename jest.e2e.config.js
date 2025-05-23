// jest.e2e.config.js
export default {
  // Inherit from base config if you have one and it's appropriate
  // preset: './jest.config.js', 
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/e2e/**/*.e2e.test.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/e2e/setupE2E.js'],
  // globalSetup and globalTeardown are likely already handled by your existing Hardhat setup
  // if you need them for E2E specifically and they differ, you can define them here.
  // globalSetup: '<rootDir>/test-setup/globalE2ESetup.js',
  // globalTeardown: '<rootDir>/test-setup/globalE2ETeardown.js',
  
  // Recommended to run E2E tests sequentially to avoid interference,
  // especially if they modify shared state (database, external services).
  // This can also be set via CLI flag (--runInBand).
  maxWorkers: 1,
  
  // Longer timeout for E2E tests as they involve more complex operations.
  testTimeout: 30000, // 30 seconds
}; 
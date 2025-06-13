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
  testTimeout: 120000, // 2 minutes for real network operations
  maxWorkers: 1, // Run tests sequentially to avoid conflicts
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
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
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  reporters: [
    'default'
  ]
}; 
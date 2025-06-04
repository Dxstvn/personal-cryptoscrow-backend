// jest.unit.config.js - Configuration for unit tests only (no blockchain/emulators)

/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  testEnvironment: 'node',
  // NO globalSetup/globalTeardown - unit tests don't need blockchain
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!src/**/*.test.js',
    '!src/**/*.config.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'text', 'lcov', 'clover'],

  // Standard timeout for unit tests
  testTimeout: 10000, // 10 seconds
  setupFilesAfterEnv: [],

  // Only run unit tests
  testMatch: [
    '**/unit/**/*.test.js',
    '**/*.unit.test.js'
  ]
};

export default config; 
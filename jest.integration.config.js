/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  testEnvironment: 'node',
  
  // Global setup/teardown files - disabled temporarily
  // globalSetup: './test-setup/globalSetup.cjs', 
  // globalTeardown: './test-setup/globalTeardown.cjs',
  
  // File extensions to consider
  moduleFileExtensions: ['js', 'json'],
  
  // Transform files with babel for ES modules - updated for ES module compatibility
  transform: {
    '^.+\\.js$': ['babel-jest'],
  },
  
  // Module name mapping for imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Test file patterns - only integration tests
  testMatch: [
    '<rootDir>/tests/integration/**/*.test.js',
    '<rootDir>/tests/integration/**/*.spec.js'
  ],
  
  // Files to ignore
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/'
  ],
  
  // Setup files - disabled temporarily
  // setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/**/*.config.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['json', 'text', 'lcov', 'clover'],
  
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Longer timeout for integration tests
  testTimeout: 90000,
  
  // ESM is enabled by package.json "type": "module"
  // No need for explicit extensionsToTreatAsEsm configuration
  
  // Mock handling
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Watch options
  watchPathIgnorePatterns: ['<rootDir>/node_modules/'],
  
  // Reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results/integration',
      outputName: 'junit-integration.xml'
    }]
  ]
};

export default config; 
// jest.config.js

/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  testEnvironment: 'node',
  
  // Global setup/teardown files
  globalSetup: './test-setup/globalSetup.cjs', 
  globalTeardown: './test-setup/globalTeardown.cjs',
  
  // File extensions to consider
  moduleFileExtensions: ['js', 'json'],
  
  // Module name mapping for imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js',
    '<rootDir>/src/**/__tests__/**/*.test.js'
  ],
  
  // Files to ignore
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
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
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Timeout for tests
  testTimeout: 90000,
  
  // Projects for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testEnvironment: 'node',
      testTimeout: 30000,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      testTimeout: 90000,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'service-unit',
      testMatch: ['<rootDir>/src/**/__tests__/unit/**/*.test.js'],
      testEnvironment: 'node',
      testTimeout: 30000,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'service-integration',
      testMatch: ['<rootDir>/src/**/__tests__/integration/**/*.test.js'],
      testEnvironment: 'node',
      testTimeout: 90000,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'service-tests',
      testMatch: ['<rootDir>/src/**/__tests__/*.test.js'],
      testEnvironment: 'node',
      testTimeout: 60000,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    }
  ],
  
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
      outputDirectory: 'test-results',
      outputName: 'junit.xml'
    }]
  ]
};

export default config;

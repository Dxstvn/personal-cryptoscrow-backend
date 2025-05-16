// jest.config.js

/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  testEnvironment: 'node',
  globalSetup: './test-setup/globalSetup.cjs',
  globalTeardown: './test-setup/globalTeardown.cjs',
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
  
  // Transform all .js, .jsx, .mjs files using babel-jest.
  // This now includes files in test-setup/ because we removed it from transformIgnorePatterns.
  transform: {
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
  },

  // Files in node_modules are typically not transformed.
  // We are no longer ignoring test-setup here.
  transformIgnorePatterns: [
    '/node_modules/',
    '\\.pnp\\.[^\\/]+$',
  ],

  // 'extensionsToTreatAsEsm' is not needed as Jest infers .js from package.json ("type": "module")
  // and .mjs is always ESM. Babel will handle the transformation to CommonJS for the test environment.

  moduleFileExtensions: ['js', 'json', 'jsx', 'node', 'mjs'], // Removed 'ts', 'tsx' unless you use TypeScript
};

export default config;

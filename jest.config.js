// jest.config.js

/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  testEnvironment: 'node',
  // If you have global setup/teardown files and they are in CommonJS (.cjs), ensure they are compatible
  // or convert them to ESM if possible, though Jest should handle .cjs fine.
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

  // No 'extensionsToTreatAsEsm' needed when type: "module" is in package.json for .js files.
  // No 'transform' needed if Babel is removed and we rely on native Node ESM support via --experimental-vm-modules.
  // Jest will use its default mechanisms.
};

export default config;

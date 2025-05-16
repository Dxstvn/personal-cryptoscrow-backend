// jest.config.js

/** @type {import('jest').Config} */
const config = {
  // Indicates that the root of your project is the current directory
  rootDir: '.',

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // A list of paths to modules that run some code to configure or set up the testing framework before each test file in the suite is executed
  // setupFilesAfterEnv: ['./jest.setup.js'], // If you have per-test-file setup

  // A path to a module which exports an async function that is triggered once before all test suites
  globalSetup: './test-setup/globalSetup.js',

  // A path to a module which exports an async function that is triggered once after all test suites
  globalTeardown: './test-setup/globalTeardown.js',

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!src/**/*.test.js',
    '!src/**/*.config.js',
  ],

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'lcov',
    'clover'
  ],
  
  // Make sure Jest can handle ES modules
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  // If your project uses ES modules extensively, you might need to tell Jest about it.
  // For Node.js environments, Jest's default support for ESM via Node.js's own ESM resolver should work,
  // especially with `NODE_OPTIONS=--experimental-vm-modules` which you use in your scripts.
  // If you encounter issues, you might need to configure `extensionsToTreatAsEsm` or use a transformer like `babel-jest`.
  // extensionsToTreatAsEsm: ['.js', '.mjs'], // Uncomment if needed

  // Module file extensions for Jest to look for
  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node', 'mjs'],
  
  // By default, jest runs .js files as commonJS. Since your package.json has "type": "module", ensure jest respects this.
  // This might also be implicitly handled by `NODE_OPTIONS=--experimental-vm-modules` in your test scripts.
  // Explicitly setting this can sometimes help.
  // preset: 'ts-jest/presets/default-esm', // If using TypeScript with ESM
  // testMatch: [
  //   '**/__tests__/**/*.js?(x)',
  //   '**/?(*.)+(spec|test).js?(x)'
  // ],

  // Add `detectOpenHandles` globally if you want it for all tests, or keep it per script in package.json
  // detectOpenHandles: true,
};

export default config;

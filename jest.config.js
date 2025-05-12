// jest.config.js

/** @type {import('jest').Config} */
export default {
  // Indicates the test environment, 'node' is suitable for backend Node.js projects.
  testEnvironment: 'node',

  // A map from regular expressions to paths to transformers.
  // Jest runs .js files through node by default. If you were using Babel or TypeScript,
  // you'd configure transformers here (e.g., {'^.+\\.ts?$': 'ts-jest'}).
  // For ESM with Node.js, an empty transform is often fine if no transpilation is needed.
  transform: {},

  // A list of paths to modules that run some code to configure or set up the
  // testing framework before each test file in the suite is executed.
  // This is the correct place for your emulator setup.
  setupFilesAfterEnv: ["<rootDir>/jest.emulator.setup.js"],

  // Automatically reset mock state before every test.
  // Equivalent to calling jest.resetAllMocks() before each test.
  // Your original config had this as false.
  resetMocks: false,

  // Automatically clear mock calls, instances, contexts and results before every test.
  // Equivalent to calling jest.clearAllMocks() before each test.
  // Your original config had this as true.
  clearMocks: true,

  // Add other Jest options here as needed at the root level.
  // For example, if you want to collect coverage:
  // collectCoverage: true,
  // coverageDirectory: "coverage",

  // If you need to support ES Modules fully and are not using experimental VM modules via NODE_OPTIONS,
  // you might need specific transform configurations or Jest presets.
  // However, your package.json scripts correctly use NODE_OPTIONS=--experimental-vm-modules
};

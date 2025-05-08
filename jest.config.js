export default {
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['<rootDir>/jest.emulator.setup.js'],
  jest: {
      "testEnvironment": "node",
      "setupFilesAfterEnv": ["./jest.emulator.setup.js"],
      "resetMocks": false,
      "clearMocks": true
    }
}; 
import { defineConfig } from 'vitest/config';
import { join } from 'path';

export default defineConfig({
  test: {
    name: 'hardhat',
    root: './',
    globals: true,
    environment: 'node',
    setupFiles: ['../../test/hardhat/setup.js'],
    testTimeout: 120000, // 2 minutes for blockchain operations
    hookTimeout: 120000,
    // Only run integration tests that need Hardhat
    include: [
      '../../src/services/__tests__/integration/realtime-sync.production.test.js',
      'test/**/*.test.js',
      '../../test/hardhat/**/*.test.js'
    ],
    // Fork from local Hardhat node
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    server: {
      deps: {
        external: ['hardhat']
      }
    }
  },
  resolve: {
    alias: {
      '@': join(process.cwd(), './src'),
      'hardhat': join(process.cwd(), './src/contract/node_modules/hardhat')
    }
  }
});
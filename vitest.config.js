import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'src/contract/node_modules/**',
        '**/*.test.js',
        '**/*.spec.js',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        'scripts/**',
        'coverage/**',
        'dist/**',
        'build/**',
        '.git/**',
        'docs/**',
        '*.config.js',
        '*.config.mjs',
        '*.config.ts'
      ]
    },
    setupFiles: [
      './vitest.setup.js'
      // './vitest.emulator.setup.js' // Temporarily disabled - emulators already running
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    testMatch: [
      '**/__tests__/**/*.test.js',
      '**/__tests__/**/*.spec.js',
      '**/test/**/*.test.js',
      '**/test/**/*.spec.js'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**'
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
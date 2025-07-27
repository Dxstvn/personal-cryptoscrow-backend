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
    // Removed testMatch to allow vitest default behavior
    // This allows running specific files with: vitest path/to/specific.test.js
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/src/contract/node_modules/**'
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
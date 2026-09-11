import { defineConfig } from 'vitest/config';
import path from 'path';
import { workbenchVitestNode } from '../../vitest.node';

export default defineConfig({
  ...workbenchVitestNode,
  test: {
    ...workbenchVitestNode.test,
    globals: true,
    testTimeout: 10000,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/fixtures/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/server.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
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
      '@opencode-workbench/preview-contract/runtime': path.resolve(
        __dirname,
        '../preview-contract/src/runtime.ts',
      ),
      '@opencode-workbench/preview-contract/compiler': path.resolve(
        __dirname,
        '../preview-contract/src/compiler.ts',
      ),
    },
  },
});

import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@opencode-workbench/project-core$': '<rootDir>/../project-core/src/index.ts',
    '^@opencode-workbench/preview-contract/rules$': '<rootDir>/../preview-contract/src/rules.ts',
    '^@opencode-workbench/preview-contract/runtime$': '<rootDir>/../preview-contract/src/runtime.ts',
    '^@opencode-workbench/preview-contract/compiler$': '<rootDir>/../preview-contract/src/compiler.ts',
    '^@opencode-workbench/shared$': '<rootDir>/../shared/src/index.ts',
    '^@opencode-workbench/demo-ui$': '<rootDir>/../demo-ui/src/index.ts',
    '^@opencode-workbench/demo-ui/(.*)$': '<rootDir>/../demo-ui/src/$1',
    '^\\./config\\.js$': '<rootDir>/../project-core/src/config.ts',
    '^\\./rules\\.js$': '<rootDir>/../preview-contract/src/rules.ts',
    '^\\./runtime\\.js$': '<rootDir>/../preview-contract/src/runtime.ts',
  },
  transform: {
    '^.+\\.md$': '<rootDir>/jest-md-transform.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!( @rjsf|@react-hook|@x0k)/)',
  ],
};

export default createJestConfig(config);

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
    '^@workbench/project-core$': '<rootDir>/../project-core/src/index.ts',
    '^@workbench/project-scaffold$': '<rootDir>/../project-scaffold/src/index.ts',
    '^@workbench/preview-contract/rules$': '<rootDir>/../preview-contract/src/rules.ts',
    '^@workbench/preview-contract/runtime$': '<rootDir>/../preview-contract/src/runtime.ts',
    '^@workbench/preview-contract/compiler$': '<rootDir>/../preview-contract/src/compiler.ts',
    '^@workbench/shared$': '<rootDir>/../shared/src/index.ts',
    '^@workbench/demo-ui$': '<rootDir>/../demo-ui/src/index.ts',
    '^@workbench/demo-ui/(.*)$': '<rootDir>/../demo-ui/src/$1',
    '^\\./config\\.js$': '<rootDir>/../project-core/src/config.ts',
    '^\\./local-preview-dev-server\\.js$': '<rootDir>/../project-scaffold/src/local-preview-dev-server.ts',
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

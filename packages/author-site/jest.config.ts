import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@opencode-workbench/shared$': '<rootDir>/../shared/src/index.ts',
    '^@opencode-workbench/shared/agent-prompts$':
      '<rootDir>/../shared/src/agent-prompts/index.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!( @rjsf|@react-hook|@x0k)/)',
  ],
};

export default createJestConfig(config);

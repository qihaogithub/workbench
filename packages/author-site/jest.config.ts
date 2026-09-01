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
    '^@milkdown(/.*)?$': '<rootDir>/jest-milkdown-mock.js',
    '^@prosemirror-adapter/(react|core)$': '<rootDir>/jest-milkdown-mock.js',
    '^streamdown$': '<rootDir>/jest-streamdown-mock.js',
    '^@streamdown/(.*)$': '<rootDir>/jest-streamdown-mock.js',
    '^@workbench/project-core$': '<rootDir>/../project-core/src/index.ts',
    '^@workbench/project-core/documents$': '<rootDir>/../project-core/src/documents/index.ts',
    '^@workbench/project-core/html-import$': '<rootDir>/../project-core/src/html-import.ts',
    '^@workbench/project-scaffold$': '<rootDir>/../project-scaffold/src/index.ts',
    '^@workbench/prototype-core$': '<rootDir>/../prototype-core/src/index.ts',
    '^@workbench/preview-contract/rules$': '<rootDir>/../preview-contract/src/rules.ts',
    '^@workbench/preview-contract/runtime$': '<rootDir>/../preview-contract/src/runtime.ts',
    '^@workbench/preview-contract/compiler$': '<rootDir>/../preview-contract/src/compiler.ts',
    '^@workbench/shared$': '<rootDir>/../shared/src/index.ts',
    '^@workbench/shared/(.*)$': '<rootDir>/../shared/src/$1.ts',
    '^@workbench/agent-client$': '<rootDir>/../agent-client/src/index.ts',
    '^@workbench/ai-chat-shared$': '<rootDir>/../ai-chat-shared/src/index.ts',
    '^@workbench/ai-chat-shared/(.*)$': '<rootDir>/../ai-chat-shared/src/$1',
    '^@workbench/demo-ui$': '<rootDir>/../demo-ui/src/index.ts',
    '^@workbench/demo-ui/(.*)$': '<rootDir>/../demo-ui/src/$1',
    '^@workbench/whiteboard-core$': '<rootDir>/../whiteboard-core/src/index.ts',
    '^\\./config\\.js$': '<rootDir>/../project-core/src/config.ts',
    '^\\./constants\\.js$': '<rootDir>/../project-core/src/constants.ts',
    '^\\./internal-types\\.js$': '<rootDir>/../project-core/src/internal-types.ts',
    '^\\./utils\\.js$': '<rootDir>/../project-core/src/utils.ts',
    '^\\./types\\.js$': '<rootDir>/../project-core/src/types.ts',
    '^\\./workspace-admin\\.js$': '<rootDir>/../project-core/src/workspace-admin.ts',
    '^\\./content-graph-admin\\.js$': '<rootDir>/../project-core/src/content-graph-admin.ts',
    '^\\./html-import-contract\\.js$': '<rootDir>/../project-core/src/html-import-contract.ts',
    '^\\./html-import\\.js$': '<rootDir>/../project-core/src/html-import.ts',
    '^\\./local-preview-dev-server\\.js$': '<rootDir>/../project-scaffold/src/local-preview-dev-server.ts',
    '^\\./rules\\.js$': '<rootDir>/../preview-contract/src/rules.ts',
    '^\\./runtime\\.js$': '<rootDir>/../preview-contract/src/runtime.ts',
  },
  transform: {
    '^.+\\.md$': '<rootDir>/jest-md-transform.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:@rjsf|@react-hook|@x0k|parse5|entities)/)',
  ],
};

export default createJestConfig(config);

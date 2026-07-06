import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const outputRoot = path.join(__dirname, 'test-outputs');
const artifactDir = path.join(outputRoot, 'artifacts-openpencil-author');
const reportDir = path.join(outputRoot, 'test-reports-openpencil-author');
if (!fs.existsSync(outputRoot)) {
  fs.mkdirSync(outputRoot, { recursive: true });
}

const baseURL = process.env.E2E_OPENPENCIL_AUTHOR_BASE_URL ?? 'http://127.0.0.1:3212';
const openPencilURL = process.env.E2E_OPENPENCIL_SPIKE_URL ?? 'http://127.0.0.1:3410';
const agentServiceURL = process.env.E2E_OPENPENCIL_AGENT_SERVICE_URL ?? 'http://127.0.0.1:3211';
const authorPort = new URL(baseURL).port || '3212';
const authorServerMode = process.env.E2E_OPENPENCIL_AUTHOR_SERVER_MODE ?? 'production';
const workspaceRoot = path.resolve(__dirname, '../..');
const authorSiteDir = path.join(workspaceRoot, 'packages/author-site');
const dataDir = path.join(workspaceRoot, 'data');
const authorNextDir = path.join(authorSiteDir, '.next');
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
function readDotEnvValue(key: string): string | null {
  const envPath = path.join(workspaceRoot, '.env');
  if (!fs.existsSync(envPath)) return null;
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));
  if (!line) return null;
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}
const jwtSecret =
  process.env.JWT_SECRET ?? readDotEnvValue('JWT_SECRET') ?? 'change-me-in-production';
const authorEnv = [
  'NEXT_TELEMETRY_DISABLED=1',
  `DATA_DIR=${shellQuote(dataDir)}`,
  `JWT_SECRET=${shellQuote(jwtSecret)}`,
  'NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED=true',
  'NEXT_PUBLIC_OPENPENCIL_SKETCH_SPIKE_ENABLED=true',
  `NEXT_PUBLIC_OPENPENCIL_SPIKE_EDITOR_URL=${openPencilURL}`,
  `NEXT_PUBLIC_AGENT_SERVICE_URL=${agentServiceURL}`,
  `AGENT_SERVICE_URL=${agentServiceURL}`,
].join(' ');
const authorCommand =
  authorServerMode === 'dev'
    ? `rm -rf ${shellQuote(authorNextDir)} && ${authorEnv} corepack pnpm --filter @workbench/author-site exec next dev -H 127.0.0.1 -p ${authorPort}`
    : [
        `rm -rf ${shellQuote(authorNextDir)}`,
        `${authorEnv} corepack pnpm --filter @workbench/author-site exec next build`,
        `${authorEnv} corepack pnpm --filter @workbench/author-site exec next start -H 127.0.0.1 -p ${authorPort}`,
      ].join(' && ');

export default defineConfig({
  testDir: './',
  testMatch: 'openpencil-author-regression.spec.ts',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: reportDir, open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: artifactDir,
  webServer: [
    {
      command: 'corepack pnpm --filter @workbench/sketch-openpencil-editor dev -- --host 127.0.0.1 --port 3410',
      url: openPencilURL,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: `PORT=3211 HOST=127.0.0.1 CORS_ORIGINS=${baseURL} corepack pnpm --filter @workbench/agent-service dev`,
      url: `${agentServiceURL}/health`,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: authorCommand,
      url: `${baseURL}/login`,
      reuseExistingServer: false,
      timeout: authorServerMode === 'dev' ? 120000 : 420000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
});

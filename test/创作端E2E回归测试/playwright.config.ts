import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const outputRoot = path.join(__dirname, 'test-outputs');
const artifactDir = path.join(outputRoot, 'artifacts');
const reportDir = path.join(outputRoot, 'test-reports');
if (!fs.existsSync(outputRoot)) {
  fs.mkdirSync(outputRoot, { recursive: true });
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';

export default defineConfig({
  testDir: './',
  testMatch: '**/*.spec.ts',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: reportDir, open: 'never' }],
    ['list']
  ],
  use: {
    baseURL,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.PLAYWRIGHT_DISABLE_VIDEO ? 'off' : 'retain-on-failure',
  },
  outputDir: artifactDir,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  timeout: 60000,
  expect: {
    timeout: 10000
  }
});

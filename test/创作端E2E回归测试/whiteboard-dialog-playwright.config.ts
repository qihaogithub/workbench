import { defineConfig, devices } from "@playwright/test";
import * as path from "node:path";

import { E2E_BASE_URL } from "./support/e2e-config";

export default defineConfig({
  testDir: path.dirname(__filename),
  testMatch: "whiteboard-dialog-flow.spec.ts",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "NEXT_PUBLIC_WHITEBOARD_AUTHORING_ENABLED=true corepack pnpm --filter @workbench/author-site dev",
    url: E2E_BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices.chromium } }],
  timeout: 120_000,
  expect: { timeout: 15_000 },
});

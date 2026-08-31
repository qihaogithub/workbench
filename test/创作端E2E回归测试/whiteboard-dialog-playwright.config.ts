import { defineConfig, devices } from "@playwright/test";
import * as path from "node:path";

export default defineConfig({
  testDir: path.dirname(__filename),
  testMatch: "whiteboard-dialog-flow.spec.ts",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "NEXT_PUBLIC_WHITEBOARD_AUTHORING_ENABLED=true corepack pnpm --filter @workbench/author-site dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:4200",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices.chromium } }],
  timeout: 120_000,
  expect: { timeout: 15_000 },
});

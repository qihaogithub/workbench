import { parseBoolean, parseInteger } from "@workbench/runtime-config/env";
import { resolveDataDir } from "@workbench/runtime-config/paths";
import {
  DEFAULT_CDN_BASE_URL,
  getLocalhostUrl,
} from "@workbench/runtime-config/topology";

export const config = {
  port: parseInteger(process.env.PORT, { defaultValue: 4202, min: 1, max: 65535 })!,
  host: process.env.HOST || "0.0.0.0",
  logLevel: process.env.LOG_LEVEL || "info",

  authorSiteUrl:
    process.env.AUTHOR_SITE_URL || getLocalhostUrl("local", "author"),
  screenshotDiagnosticsToken: process.env.SCREENSHOT_DIAGNOSTICS_TOKEN || "",
  cdnBaseUrl: process.env.CDN_BASE_URL || DEFAULT_CDN_BASE_URL,
  previewRuntimeSource: process.env.PREVIEW_RUNTIME_SOURCE || "local",

  dataDir: resolveDataDir(),

  // Puppeteer
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "",
  puppeteerDisableSandbox: parseBoolean(process.env.PUPPETEER_DISABLE_SANDBOX, { defaultValue: false })!,
  viewport: {
    width: 375,
    height: 812,
  },
  maxConcurrentPages: parseInt(
    process.env.SCREENSHOT_MAX_CONCURRENT_PAGES || "4",
    10,
  ),
  screenshotTimeout: 15000,
  screenshotQueueTimeout: parseInt(
    process.env.SCREENSHOT_QUEUE_TIMEOUT_MS || "30000",
    10,
  ),
  screenshotTaskTimeout: parseInt(
    process.env.SCREENSHOT_TASK_TIMEOUT_MS || "20000",
    10,
  ),
  screenshotBatchTtlMs: parseInt(
    process.env.SCREENSHOT_BATCH_TTL_MS || "300000",
    10,
  ),
  screenshotDeepHealth: process.env.SCREENSHOT_DEEP_HEALTH === "true",
  screenshotWarmup: process.env.SCREENSHOT_WARMUP === "true",
  waitForSelector: "#root",
  waitForNetworkIdleTimeout: 10000,

  // Cache
  compileCacheMaxEntries: 200,
  compileCacheMaxAgeMs: parseInt(
    process.env.COMPILE_CACHE_MAX_AGE_MS || "1500000",
    10,
  ), // 25 minutes — must be shorter than preview-module TTL (30 min)

  // Screenshot version (bump to force cache invalidation)
  snapshotVersion: 1,

  // History
  maxHistoryFiles: 5,
} as const;

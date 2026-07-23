import path from "path";

export const config = {
  port: parseInt(process.env.PORT || "3202", 10),
  host: process.env.HOST || "0.0.0.0",
  logLevel: process.env.LOG_LEVEL || "info",

  authorSiteUrl:
    process.env.AUTHOR_SITE_URL || "http://localhost:3200",
  cdnBaseUrl: process.env.CDN_BASE_URL || "https://esm.sh",
  previewRuntimeSource: process.env.PREVIEW_RUNTIME_SOURCE || "local",

  dataDir:
    process.env.DATA_DIR ||
    path.resolve(__dirname, "../../../data"),

  // Puppeteer
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "",
  puppeteerDisableSandbox: process.env.PUPPETEER_DISABLE_SANDBOX === "true",
  viewport: {
    width: 375,
    height: 812,
  },
  maxConcurrentPages: 3,
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

  // Screenshot version (bump to force cache invalidation)
  snapshotVersion: 1,

  // History
  maxHistoryFiles: 5,
} as const;

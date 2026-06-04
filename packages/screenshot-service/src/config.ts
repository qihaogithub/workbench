import path from "path";

export const config = {
  port: parseInt(process.env.PORT || "3202", 10),
  host: process.env.HOST || "0.0.0.0",
  logLevel: process.env.LOG_LEVEL || "info",

  authorSiteUrl:
    process.env.AUTHOR_SITE_URL || "http://localhost:3200",

  dataDir:
    process.env.DATA_DIR ||
    path.resolve(__dirname, "../../../data/screenshots"),

  // Puppeteer
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "",
  viewport: {
    width: 375,
    height: 812,
  },
  maxConcurrentPages: 3,
  screenshotTimeout: 15000,
  waitForSelector: "#root",
  waitForNetworkIdleTimeout: 10000,

  // Cache
  compileCacheMaxEntries: 200,

  // Screenshot version (bump to force cache invalidation)
  snapshotVersion: 1,

  // History
  maxHistoryFiles: 5,
} as const;

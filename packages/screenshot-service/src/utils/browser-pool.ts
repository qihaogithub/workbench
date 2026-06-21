import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { config } from "../config";

type BrowserStatus = "ready" | "launching" | "error" | "closed";

class BrowserPool {
  private browser: Browser | null = null;
  private status: BrowserStatus = "closed";
  private activePages = 0;
  private launchPromise: Promise<Browser> | null = null;

  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.launchPromise) {
      return this.launchPromise;
    }

    this.launchPromise = this.launch();
    try {
      this.browser = await this.launchPromise;
      return this.browser;
    } finally {
      this.launchPromise = null;
    }
  }

  private async launch(): Promise<Browser> {
    this.status = "launching";

    const executablePath = this.findExecutablePath();

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    browser.on("disconnected", () => {
      if (this.browser === browser) {
        this.browser = null;
        this.status = "closed";
      }
    });

    this.status = "ready";
    return browser;
  }

  private findExecutablePath(): string {
    if (config.puppeteerExecutablePath) {
      return config.puppeteerExecutablePath;
    }

    // macOS
    const macPath =
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    // Linux
    const linuxPaths = ["/usr/bin/chromium", "/usr/bin/google-chrome"];
    // Windows
    const windowsPaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];

    const { existsSync } = require("fs") as typeof import("fs");
    if (existsSync(macPath)) return macPath;
    for (const p of linuxPaths) {
      if (existsSync(p)) return p;
    }
    for (const p of windowsPaths) {
      if (existsSync(p)) return p;
    }

    return "";
  }

  async renderPage(
    html: string,
    width: number,
    height: number,
    fullPage = false,
  ): Promise<Buffer> {
    const browser = await this.getBrowser();

    if (this.activePages >= config.maxConcurrentPages) {
      throw new Error("Too many concurrent screenshot tasks");
    }

    this.activePages++;
    let page: Page | null = null;

    try {
      page = await browser.newPage();
      await page.setViewport({ width, height });

      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: config.screenshotTimeout,
      });

      await page.waitForSelector(config.waitForSelector, {
        timeout: config.screenshotTimeout,
      });

      try {
        await page.waitForNetworkIdle({
          timeout: config.waitForNetworkIdleTimeout,
        });
      } catch {
        // Network idle timeout is acceptable — page may have ongoing requests
      }

      const buffer = await page.screenshot({
        fullPage,
        type: "png",
      });

      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    } finally {
      this.activePages--;
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  getStatus(): BrowserStatus {
    return this.status;
  }

  async close(): Promise<void> {
    if (this.browser) {
      this.status = "closed";
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

let poolInstance: BrowserPool | null = null;

export function getBrowserPool(): BrowserPool {
  if (!poolInstance) {
    poolInstance = new BrowserPool();
  }
  return poolInstance;
}

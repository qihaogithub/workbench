import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { config } from "../config";
import { ScreenshotError, getErrorMessage } from "./errors";

type BrowserStatus = "ready" | "launching" | "error" | "closed";

export interface BrowserPoolStatus {
  status: BrowserStatus;
  activePages: number;
  queuedTasks: number;
  runningTasks: number;
  lastError: string | null;
}

export interface RenderPageResult {
  buffer: Buffer;
  queueWaitMs: number;
  renderMs: number;
}

interface RenderTask {
  html: string;
  width: number;
  height: number;
  fullPage: boolean;
  enqueuedAt: number;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (result: RenderPageResult) => void;
  reject: (error: unknown) => void;
}

class BrowserPool {
  private browser: Browser | null = null;
  private status: BrowserStatus = "closed";
  private activePages = 0;
  private launchPromise: Promise<Browser> | null = null;
  private queue: RenderTask[] = [];
  private lastError: string | null = null;

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

    let browser: Browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    } catch (error) {
      this.status = "error";
      this.lastError = getErrorMessage(error);
      throw new ScreenshotError(
        "BROWSER_LAUNCH_ERROR",
        `Chromium 启动失败: ${this.lastError}`,
        error,
      );
    }

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

  renderPage(
    html: string,
    width: number,
    height: number,
    fullPage = false,
  ): Promise<RenderPageResult> {
    return new Promise((resolve, reject) => {
      const task: RenderTask = {
        html,
        width,
        height,
        fullPage,
        enqueuedAt: Date.now(),
        resolve,
        reject,
        timeout: setTimeout(() => {
          const index = this.queue.indexOf(task);
          if (index !== -1) {
            this.queue.splice(index, 1);
            const error = new ScreenshotError(
              "QUEUE_TIMEOUT",
              "截图任务排队超时",
            );
            this.lastError = error.message;
            reject(error);
          }
        }, config.screenshotQueueTimeout),
      };

      this.queue.push(task);
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    while (
      this.activePages < config.maxConcurrentPages &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift();
      if (!task) return;

      clearTimeout(task.timeout);
      this.activePages++;

      this.runTask(task)
        .then(task.resolve)
        .catch((error) => {
          this.lastError = getErrorMessage(error);
          task.reject(error);
        })
        .finally(() => {
          this.activePages--;
          this.drainQueue();
        });
    }
  }

  private async runTask(task: RenderTask): Promise<RenderPageResult> {
    const queueWaitMs = Date.now() - task.enqueuedAt;
    const renderStart = Date.now();
    const buffer = await this.renderPageNow(
      task.html,
      task.width,
      task.height,
      task.fullPage,
    );
    return {
      buffer,
      queueWaitMs,
      renderMs: Date.now() - renderStart,
    };
  }

  private async renderPageNow(
    html: string,
    width: number,
    height: number,
    fullPage: boolean,
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    let page: Page | null = null;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      page = await browser.newPage();
      await page.setViewport({ width, height });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          void page?.close().catch(() => {});
          reject(new ScreenshotError("RENDER_TIMEOUT", "截图渲染超时"));
        }, config.screenshotTaskTimeout);
      });

      const renderPromise = this.capturePage(page, html, fullPage);
      return await Promise.race([renderPromise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (page && !timedOut) {
        await page.close().catch(() => {});
      }
    }
  }

  private async capturePage(
    page: Page,
    html: string,
    fullPage: boolean,
  ): Promise<Buffer> {
    try {
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: config.screenshotTimeout,
      });

      try {
        await page.waitForSelector(config.waitForSelector, {
          timeout: config.screenshotTimeout,
        });
      } catch (error) {
        throw new ScreenshotError(
          "SELECTOR_TIMEOUT",
          `等待选择器 ${config.waitForSelector} 超时`,
          error,
        );
      }

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
    } catch (error) {
      if (error instanceof ScreenshotError) {
        throw error;
      }
      throw new ScreenshotError("SCREENSHOT_ERROR", getErrorMessage(error), error);
    }
  }

  getStatus(): BrowserPoolStatus {
    return {
      status: this.status,
      activePages: this.activePages,
      queuedTasks: this.queue.length,
      runningTasks: this.activePages,
      lastError: this.lastError,
    };
  }

  async runDeepHealthCheck(): Promise<{
    ok: boolean;
    elapsed: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const html = "<!doctype html><html><body><div id=\"root\">ok</div></body></html>";
      await this.renderPage(html, 120, 80, false);
      return { ok: true, elapsed: Date.now() - start };
    } catch (error) {
      return {
        ok: false,
        elapsed: Date.now() - start,
        error: getErrorMessage(error),
      };
    }
  }

  async close(): Promise<void> {
    for (const task of this.queue.splice(0)) {
      clearTimeout(task.timeout);
      task.reject(new ScreenshotError("QUEUE_TIMEOUT", "截图服务正在关闭"));
    }
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

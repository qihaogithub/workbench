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
  renderBox: ScreenshotRenderBox;
  queueWaitMs: number;
  renderMs: number;
}

export interface ScreenshotRenderBox {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  bodyWidth: number;
  bodyHeight: number;
  documentWidth: number;
  documentHeight: number;
  fullPage: boolean;
}

interface PageMeasurement {
  bodyWidth: number;
  bodyHeight: number;
  documentWidth: number;
  documentHeight: number;
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
    const result = await this.renderPageNow(
      task.html,
      task.width,
      task.height,
      task.fullPage,
    );
    return {
      ...result,
      queueWaitMs,
      renderMs: Date.now() - renderStart,
    };
  }

  private async renderPageNow(
    html: string,
    width: number,
    height: number,
    fullPage: boolean,
  ): Promise<Omit<RenderPageResult, "queueWaitMs" | "renderMs">> {
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

      const renderPromise = this.capturePage(page, html, width, height, fullPage);
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
    viewportWidth: number,
    viewportHeight: number,
    fullPage: boolean,
  ): Promise<Omit<RenderPageResult, "queueWaitMs" | "renderMs">> {
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

      const measurement = await this.waitForStableMeasurement(page);
      const captureWidth = viewportWidth;
      const captureHeight = fullPage
        ? Math.max(viewportHeight, measurement.bodyHeight, measurement.documentHeight)
        : viewportHeight;
      const renderBox: ScreenshotRenderBox = {
        width: captureWidth,
        height: captureHeight,
        viewportWidth,
        viewportHeight,
        bodyWidth: measurement.bodyWidth,
        bodyHeight: measurement.bodyHeight,
        documentWidth: measurement.documentWidth,
        documentHeight: measurement.documentHeight,
        fullPage,
      };

      if (fullPage && captureHeight !== viewportHeight) {
        await page.setViewport({ width: viewportWidth, height: captureHeight });
      }

      const buffer = fullPage
        ? await page.screenshot({
            type: "png",
            clip: {
              x: 0,
              y: 0,
              width: captureWidth,
              height: captureHeight,
            },
          })
        : await page.screenshot({
            fullPage: false,
            type: "png",
          });

      return {
        buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
        renderBox,
      };
    } catch (error) {
      if (error instanceof ScreenshotError) {
        throw error;
      }
      throw new ScreenshotError("SCREENSHOT_ERROR", getErrorMessage(error), error);
    }
  }

  private async waitForStableMeasurement(page: Page): Promise<PageMeasurement> {
    await page.evaluate(async () => {
      const browserGlobal = globalThis as unknown as {
        document: {
          fonts?: { ready?: Promise<unknown> };
          images: ArrayLike<{
            complete: boolean;
            addEventListener: (
              type: "load" | "error",
              listener: () => void,
              options?: { once?: boolean },
            ) => void;
          }>;
        };
        requestAnimationFrame: (callback: () => void) => void;
      };
      const { document, requestAnimationFrame } = browserGlobal;
      const fonts = document.fonts;
      if (fonts?.ready) {
        await fonts.ready.catch(() => undefined);
      }

      const images = Array.from(document.images);
      await Promise.all(
        images.map(async (image) => {
          if (image.complete) return;
          await new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          });
        }),
      );

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });

    let previous: PageMeasurement | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.measurePage(page);
      if (
        previous &&
        previous.bodyWidth === current.bodyWidth &&
        previous.bodyHeight === current.bodyHeight &&
        previous.documentWidth === current.documentWidth &&
        previous.documentHeight === current.documentHeight
      ) {
        return current;
      }
      previous = current;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return previous ?? this.measurePage(page);
  }

  private async measurePage(page: Page): Promise<PageMeasurement> {
    return page.evaluate(() => {
      const browserGlobal = globalThis as unknown as {
        document: {
          body?: {
            scrollWidth: number;
            offsetWidth: number;
            scrollHeight: number;
            offsetHeight: number;
            getBoundingClientRect: () => { width: number; height: number };
          };
          documentElement: {
            scrollWidth: number;
            offsetWidth: number;
            clientWidth: number;
            scrollHeight: number;
            offsetHeight: number;
            clientHeight: number;
            getBoundingClientRect: () => { width: number; height: number };
          };
        };
      };
      const { document } = browserGlobal;
      const body = document.body;
      const documentElement = document.documentElement;
      const bodyRect = body?.getBoundingClientRect();
      const documentRect = documentElement.getBoundingClientRect();

      const bodyWidth = Math.ceil(
        Math.max(
          body?.scrollWidth ?? 0,
          body?.offsetWidth ?? 0,
          bodyRect?.width ?? 0,
        ),
      );
      const bodyHeight = Math.ceil(
        Math.max(
          body?.scrollHeight ?? 0,
          body?.offsetHeight ?? 0,
          bodyRect?.height ?? 0,
        ),
      );
      const documentWidth = Math.ceil(
        Math.max(
          documentElement.scrollWidth,
          documentElement.offsetWidth,
          documentElement.clientWidth,
          documentRect.width,
        ),
      );
      const documentHeight = Math.ceil(
        Math.max(
          documentElement.scrollHeight,
          documentElement.offsetHeight,
          documentElement.clientHeight,
          documentRect.height,
        ),
      );

      return {
        bodyWidth,
        bodyHeight,
        documentWidth,
        documentHeight,
      };
    });
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

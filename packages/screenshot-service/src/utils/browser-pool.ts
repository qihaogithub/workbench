import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { existsSync } from "fs";
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
  renderTimings: RenderStageTimings;
}

export type ScreenshotPriority =
  | "active"
  | "visible"
  | "nearby"
  | "thumbnail"
  | "background";

export type ScreenshotRenderMode = "strict" | "fast";

export interface RenderStageTimings {
  browserMs: number;
  pageCreateMs: number;
  setViewportMs: number;
  setContentMs: number;
  waitForSelectorMs: number;
  waitForNetworkIdleMs: number;
  animationFrameMs: number;
  runtimeErrorCheckMs: number;
  measurementMs: number;
  viewportResizeMs: number;
  screenshotMs: number;
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

interface PreviewRuntimeErrorPayload {
  stage?: string;
  error?: string;
  stack?: string;
  source?: string;
  line?: number;
}

interface RenderTask {
  html: string;
  width: number;
  height: number;
  fullPage: boolean;
  priority: ScreenshotPriority;
  renderMode: ScreenshotRenderMode;
  measuredHeight?: number;
  sequence: number;
  enqueuedAt: number;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (result: RenderPageResult) => void;
  reject: (error: unknown) => void;
}

const PRIORITY_WEIGHT: Record<ScreenshotPriority, number> = {
  active: 0,
  visible: 1,
  nearby: 2,
  thumbnail: 3,
  background: 4,
};

const MIN_MEANINGFUL_SCREENSHOT_BYTES = 8 * 1024;
const LARGE_RENDER_AREA = 160_000;

export function isLikelyBlankScreenshot(
  byteLength: number,
  renderBox?: Pick<ScreenshotRenderBox, "width" | "height">,
): boolean {
  if (!renderBox) return false;
  return (
    renderBox.width * renderBox.height >= LARGE_RENDER_AREA &&
    byteLength < MIN_MEANINGFUL_SCREENSHOT_BYTES
  );
}

function createEmptyRenderStageTimings(): RenderStageTimings {
  return {
    browserMs: 0,
    pageCreateMs: 0,
    setViewportMs: 0,
    setContentMs: 0,
    waitForSelectorMs: 0,
    waitForNetworkIdleMs: 0,
    animationFrameMs: 0,
    runtimeErrorCheckMs: 0,
    measurementMs: 0,
    viewportResizeMs: 0,
    screenshotMs: 0,
  };
}

class BrowserPool {
  private browser: Browser | null = null;
  private status: BrowserStatus = "closed";
  private activePages = 0;
  private launchPromise: Promise<Browser> | null = null;
  private queue: RenderTask[] = [];
  private lastError: string | null = null;
  private taskSequence = 0;

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
      const sandboxArgs = config.puppeteerDisableSandbox
        ? ["--no-sandbox", "--disable-setuid-sandbox"]
        : [];

      browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          ...sandboxArgs,
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-breakpad",
          "--disable-crash-reporter",
          "--noerrdialogs",
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
    priority: ScreenshotPriority = "background",
    renderMode: ScreenshotRenderMode = "strict",
    measuredHeight?: number,
  ): Promise<RenderPageResult> {
    return new Promise((resolve, reject) => {
      const task: RenderTask = {
        html,
        width,
        height,
        fullPage,
        priority,
        renderMode,
        measuredHeight,
        sequence: this.taskSequence++,
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
      this.queue.sort((a, b) => {
        const priorityDiff =
          PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        return priorityDiff === 0 ? a.sequence - b.sequence : priorityDiff;
      });
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
      task.renderMode,
      task.measuredHeight,
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
    renderMode: ScreenshotRenderMode,
    measuredHeight?: number,
  ): Promise<Omit<RenderPageResult, "queueWaitMs" | "renderMs">> {
    const renderTimings = createEmptyRenderStageTimings();
    const browserStart = Date.now();
    const browser = await this.getBrowser();
    renderTimings.browserMs = Date.now() - browserStart;
    let page: Page | null = null;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const pageCreateStart = Date.now();
      page = await browser.newPage();
      renderTimings.pageCreateMs = Date.now() - pageCreateStart;
      const setViewportStart = Date.now();
      await page.setViewport({ width, height });
      renderTimings.setViewportMs = Date.now() - setViewportStart;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          void page?.close().catch(() => {});
          reject(new ScreenshotError("RENDER_TIMEOUT", "截图渲染超时"));
        }, config.screenshotTaskTimeout);
      });

      const renderPromise = this.capturePage(
        page,
        html,
        width,
        height,
        fullPage,
        renderMode,
        measuredHeight,
        renderTimings,
      );
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
    renderMode: ScreenshotRenderMode,
    measuredHeight?: number,
    renderTimings: RenderStageTimings = createEmptyRenderStageTimings(),
  ): Promise<Omit<RenderPageResult, "queueWaitMs" | "renderMs">> {
    try {
      const setContentStart = Date.now();
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: config.screenshotTimeout,
      });
      renderTimings.setContentMs = Date.now() - setContentStart;

      try {
        const waitForSelectorStart = Date.now();
        await page.waitForSelector(config.waitForSelector, {
          timeout: config.screenshotTimeout,
        });
        renderTimings.waitForSelectorMs = Date.now() - waitForSelectorStart;
      } catch (error) {
        throw new ScreenshotError(
          "SELECTOR_TIMEOUT",
          `等待选择器 ${config.waitForSelector} 超时`,
          error,
        );
      }

      if (renderMode === "strict") {
        const networkIdleStart = Date.now();
        try {
          await page.waitForNetworkIdle({
            timeout: config.waitForNetworkIdleTimeout,
          });
        } catch {
          // Network idle timeout is acceptable — page may have ongoing requests
        } finally {
          renderTimings.waitForNetworkIdleMs = Date.now() - networkIdleStart;
        }
      } else {
        const animationFrameStart = Date.now();
        await this.waitForAnimationFramePair(page);
        renderTimings.animationFrameMs = Date.now() - animationFrameStart;
      }

      const runtimeErrorStart = Date.now();
      const runtimeError = await this.readPreviewRuntimeError(page);
      renderTimings.runtimeErrorCheckMs = Date.now() - runtimeErrorStart;
      if (runtimeError) {
        const stage = runtimeError.stage ? `${runtimeError.stage}: ` : "";
        throw new ScreenshotError(
          "RUNTIME_ERROR",
          `页面运行时错误: ${stage}${runtimeError.error || "组件运行时发生错误"}`,
          runtimeError,
        );
      }

      const measurementStart = Date.now();
      const measurement =
        renderMode === "strict"
          ? await this.waitForStableMeasurement(page, measuredHeight)
          : await this.measureFastPage(page, measuredHeight);
      renderTimings.measurementMs = Date.now() - measurementStart;
      const hasVisibleContent = await this.hasVisiblePreviewContent(page);
      if (!hasVisibleContent) {
        throw new ScreenshotError(
          "EMPTY_RENDER",
          "页面预览没有可见内容，已跳过截图写入",
        );
      }
      const captureWidth = viewportWidth;
      const captureHeight = fullPage
        ? Math.max(
            viewportHeight,
            measurement.bodyHeight,
            measurement.documentHeight,
          )
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
        const viewportResizeStart = Date.now();
        await page.setViewport({ width: viewportWidth, height: captureHeight });
        renderTimings.viewportResizeMs = Date.now() - viewportResizeStart;
      }

      const screenshotStart = Date.now();
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
      renderTimings.screenshotMs = Date.now() - screenshotStart;
      const screenshotBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      if (isLikelyBlankScreenshot(screenshotBuffer.length, renderBox)) {
        throw new ScreenshotError(
          "EMPTY_RENDER",
          "截图结果过小，疑似空白渲染，已跳过截图写入",
        );
      }

      return {
        buffer: screenshotBuffer,
        renderBox,
        renderTimings,
      };
    } catch (error) {
      if (error instanceof ScreenshotError) {
        throw error;
      }
      throw new ScreenshotError(
        "SCREENSHOT_ERROR",
        getErrorMessage(error),
        error,
      );
    }
  }

  private async readPreviewRuntimeError(
    page: Page,
  ): Promise<PreviewRuntimeErrorPayload | null> {
    const raw = await page.evaluate(() => {
      return document.documentElement.getAttribute("data-preview-runtime-error");
    });
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const payload = parsed as Record<string, unknown>;
        return {
          stage: typeof payload.stage === "string" ? payload.stage : undefined,
          error: typeof payload.error === "string" ? payload.error : undefined,
          stack: typeof payload.stack === "string" ? payload.stack : undefined,
          source: typeof payload.source === "string" ? payload.source : undefined,
          line: typeof payload.line === "number" ? payload.line : undefined,
        };
      }
    } catch {
      return { error: raw };
    }

    return { error: raw };
  }

  private async hasVisiblePreviewContent(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const browserGlobal = globalThis as unknown as {
        document: {
          querySelector: (selector: string) => unknown;
        };
        window: {
          getComputedStyle: (element: unknown) => {
            display: string;
            visibility: string;
            opacity: string;
          };
        };
      };
      const root = browserGlobal.document.querySelector("#root") as
        | {
            querySelectorAll: (selector: string) => ArrayLike<unknown>;
            getClientRects?: () => ArrayLike<{ width: number; height: number }>;
          }
        | null;
      if (!root) return false;

      const elements = Array.from(root.querySelectorAll("*"));
      return elements.some((element) => {
        const candidate = element as {
          getClientRects?: () => ArrayLike<{ width: number; height: number }>;
        };
        if (typeof candidate.getClientRects !== "function") {
          return false;
        }

        const style = browserGlobal.window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          return false;
        }

        const rects = Array.from(candidate.getClientRects());
        return rects.some((rect) => rect.width > 2 && rect.height > 2);
      });
    });
  }

  private async waitForStableMeasurement(
    page: Page,
    measuredHeight?: number,
  ): Promise<PageMeasurement> {
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
        measuredHeight &&
        Math.abs(current.documentHeight - measuredHeight) <= 4
      ) {
        return current;
      }
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

  private async measureFastPage(
    page: Page,
    measuredHeight?: number,
  ): Promise<PageMeasurement> {
    await this.waitForAnimationFramePair(page);
    const measurement = await this.measurePage(page);
    if (!measuredHeight || measuredHeight <= 0) {
      return measurement;
    }

    const hintedHeight = Math.ceil(measuredHeight);
    return {
      ...measurement,
      bodyHeight: Math.max(measurement.bodyHeight, hintedHeight),
      documentHeight: Math.max(measurement.documentHeight, hintedHeight),
    };
  }

  private async waitForAnimationFramePair(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const browserGlobal = globalThis as unknown as {
        requestAnimationFrame: (callback: () => void) => void;
      };
      await new Promise<void>((resolve) => {
        browserGlobal.requestAnimationFrame(() => {
          browserGlobal.requestAnimationFrame(() => resolve());
        });
      });
    });
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

  async warmup(): Promise<{ ok: boolean; elapsed: number; error?: string }> {
    const start = Date.now();
    try {
      await this.getBrowser();
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

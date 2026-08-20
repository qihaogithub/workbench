import puppeteer, { type Browser, type BrowserContext, type Page } from "puppeteer-core";
import { existsSync } from "node:fs";
import { config } from "../config";
import { ScreenshotError, getErrorMessage } from "./errors";
import type { RenderPageResult, RenderStageTimings, ScreenshotRenderBox, ScreenshotRenderMode, ScreenshotPriority } from "./browser-pool";

/**
 * The sandbox renderer deliberately does not share the trusted React/prototype
 * browser pool. Each request gets a fresh Chromium process and an isolated
 * BrowserContext; all network requests and permission prompts are denied.
 */
export class SandboxBrowserRunner {
  async renderPage(
    html: string,
    width: number,
    height: number,
    fullPage = false,
    _priority: ScreenshotPriority = "background",
    _renderMode: ScreenshotRenderMode = "strict",
    measuredHeight?: number,
  ): Promise<RenderPageResult> {
    const started = Date.now();
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    const timings = emptyTimings();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => reject(new ScreenshotError("RENDER_TIMEOUT", "沙箱截图渲染超时")), config.screenshotTaskTimeout);
    });

    const render = (async () => {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: findExecutablePath() || undefined,
        args: [
          ...(config.puppeteerDisableSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
          "--disable-dev-shm-usage", "--disable-gpu", "--disable-breakpad",
          "--disable-crash-reporter", "--noerrdialogs", "--disable-background-networking",
          "--disable-component-update", "--disable-features=InterestFeedContentSuggestions",
        ],
      });
      context = await browser.createBrowserContext();
      page = await context.newPage();
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const scheme = new URL(request.url()).protocol;
        if (scheme === "data:" || scheme === "about:" || scheme === "blob:") void request.continue();
        else void request.abort();
      });
      page.on("dialog", (dialog) => { void dialog.dismiss().catch(() => {}); });
      await page.setViewport({ width, height });
      const setContentStart = Date.now();
      await page.setContent(buildSandboxDocument(html), { waitUntil: "domcontentloaded", timeout: config.screenshotTimeout });
      timings.setContentMs = Date.now() - setContentStart;
      await page.evaluate(async () => {
        const browserGlobal = globalThis as unknown as { requestAnimationFrame: (callback: () => void) => void };
        await new Promise<void>((resolve) => browserGlobal.requestAnimationFrame(() => browserGlobal.requestAnimationFrame(() => resolve())));
      });
      const runtimeError = await page.evaluate(() => {
        const browserGlobal = globalThis as unknown as { document: { documentElement: { getAttribute: (name: string) => string | null } } };
        return browserGlobal.document.documentElement.getAttribute("data-preview-runtime-error");
      });
      if (runtimeError) throw new ScreenshotError("RUNTIME_ERROR", `沙箱页面运行时错误: ${runtimeError}`);
      const measurement = await page.evaluate(() => {
        const browserGlobal = globalThis as unknown as { document: { body: any; documentElement: any }; getComputedStyle: (element: any) => any };
        const body = browserGlobal.document.body;
        const root = browserGlobal.document.documentElement;
        return {
          bodyWidth: Math.ceil(Math.max(body?.scrollWidth ?? 0, body?.offsetWidth ?? 0, body?.getBoundingClientRect().width ?? 0)),
          bodyHeight: Math.ceil(Math.max(body?.scrollHeight ?? 0, body?.offsetHeight ?? 0, body?.getBoundingClientRect().height ?? 0)),
          documentWidth: Math.ceil(Math.max(root.scrollWidth, root.offsetWidth, root.clientWidth, root.getBoundingClientRect().width)),
          documentHeight: Math.ceil(Math.max(root.scrollHeight, root.offsetHeight, root.clientHeight, root.getBoundingClientRect().height)),
          visible: Array.from(body?.querySelectorAll("*") ?? []).some((element: any) => {
            const style = browserGlobal.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 2 && rect.height > 2;
          }),
        };
      });
      if (!measurement.visible) throw new ScreenshotError("EMPTY_RENDER", "沙箱页面没有可见内容");
      const captureHeight = fullPage ? Math.max(height, measurement.bodyHeight, measurement.documentHeight, measuredHeight ?? 0) : height;
      if (fullPage && captureHeight !== height) await page.setViewport({ width, height: captureHeight });
      const buffer = await page.screenshot({ type: "png", ...(fullPage ? { clip: { x: 0, y: 0, width, height: captureHeight } } : { fullPage: false }) });
      const renderBox: ScreenshotRenderBox = { width, height: captureHeight, viewportWidth: width, viewportHeight: height, bodyWidth: measurement.bodyWidth, bodyHeight: measurement.bodyHeight, documentWidth: measurement.documentWidth, documentHeight: measurement.documentHeight, fullPage };
      return { buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), renderBox, queueWaitMs: 0, renderMs: Date.now() - started, renderTimings: timings };
    })();

    try {
      return await Promise.race([render, deadline]);
    } catch (error) {
      if (error instanceof ScreenshotError) throw error;
      throw new ScreenshotError("SCREENSHOT_ERROR", getErrorMessage(error), error);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      // Closing the context first prevents a timed-out page from surviving; the
      // process is then always reaped, even if Chromium is wedged in a script.
      const cleanupContext = context as BrowserContext | null;
      const cleanupBrowser = browser as Browser | null;
      await closeSandboxBrowser(cleanupContext, cleanupBrowser);
    }
  }
}

function emptyTimings(): RenderStageTimings {
  return { browserMs: 0, pageCreateMs: 0, setViewportMs: 0, setContentMs: 0, waitForSelectorMs: 0, waitForNetworkIdleMs: 0, animationFrameMs: 0, runtimeErrorCheckMs: 0, measurementMs: 0, viewportResizeMs: 0, screenshotMs: 0 };
}

function findExecutablePath(): string {
  if (config.puppeteerExecutablePath) return config.puppeteerExecutablePath;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium", "/usr/bin/google-chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? "";
}

function buildSandboxDocument(source: string): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; script-src-elem 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'";
  const errorBridge = `<script>(function(){function report(stage,error){try{var value=String(error&&error.message||error||'运行时错误').slice(0,2000);document.documentElement.setAttribute('data-preview-runtime-error',JSON.stringify({stage:stage,error:value}));}catch(_){}}window.addEventListener('error',function(e){report('window-error',e.error||e.message);});window.addEventListener('unhandledrejection',function(e){report('unhandled-rejection',e.reason);});})();</script>`;
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">${errorBridge}`;
  const withoutDangerousMeta = source
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?content-security-policy\b)[^>]*>/gi, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?refresh\b)[^>]*>/gi, "");
  if (/<head\b[^>]*>/i.test(withoutDangerousMeta)) return withoutDangerousMeta.replace(/<head\b[^>]*>/i, (tag) => `${tag}${head}`);
  if (/<html\b[^>]*>/i.test(withoutDangerousMeta)) return withoutDangerousMeta.replace(/<html\b[^>]*>/i, (tag) => `${tag}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${withoutDangerousMeta}</body></html>`;
}

async function closeSandboxBrowser(context: BrowserContext | null, browser: Browser | null): Promise<void> {
  let contextClosed = true;
  if (context) contextClosed = await boundedClose(() => context.close());
  if (!contextClosed) killBrowser(browser);
  if (browser) {
    const browserClosed = await boundedClose(() => browser.close());
    if (!browserClosed) killBrowser(browser);
  }
}

async function boundedClose(close: () => Promise<unknown>, timeoutMs = 500): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      close(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("sandbox cleanup timeout")), timeoutMs); }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function killBrowser(browser: Browser | null): void {
  try { browser?.process()?.kill("SIGKILL"); } catch { /* process already exited */ }
}

let runner: SandboxBrowserRunner | null = null;
export function getSandboxBrowserRunner(): SandboxBrowserRunner {
  return (runner ??= new SandboxBrowserRunner());
}

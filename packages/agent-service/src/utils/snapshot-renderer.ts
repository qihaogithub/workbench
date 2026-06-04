import puppeteer, { Browser } from "puppeteer";
import { generateIframeHtml } from "@opencode-workbench/shared/demo";

interface RenderOptions {
  code: string;
  schema?: string;
  configData?: Record<string, unknown>;
  width: number;
  height: number;
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
  }
  return browserPromise;
}

export function getSnapshotRenderer() {
  return {
    async render(options: RenderOptions): Promise<Buffer> {
      const { code, configData = {}, width, height } = options;

      const html = generateIframeHtml({
        compiledCode: code,
        configData,
        supportUrlMode: false,
      });

      const browser = await getBrowser();
      const page = await browser.newPage();

      try {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.setContent(html, {
          waitUntil: "load",
          timeout: 15000,
        });

        await page.evaluate(() => document.fonts.ready);
        await new Promise((r) => setTimeout(r, 500));

        const buffer = (await page.screenshot({
          type: "png",
          fullPage: false,
          clip: { x: 0, y: 0, width, height },
        })) as Buffer;

        return buffer;
      } finally {
        await page.close();
      }
    },

    async destroy() {
      if (browserPromise) {
        const browser = await browserPromise;
        await browser.close();
        browserPromise = null;
      }
    },
  };
}

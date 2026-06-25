import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createPage(delayMs: number, counters: { active: number; max: number }) {
  counters.active++;
  counters.max = Math.max(counters.max, counters.active);

  return {
    setViewport: vi.fn(),
    setContent: vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
    ),
    waitForSelector: vi.fn(),
    waitForNetworkIdle: vi.fn(),
    evaluate: vi.fn(async (fn: () => unknown) => {
      if (String(fn).includes("bodyWidth")) {
        return {
          bodyWidth: 100,
          bodyHeight: 180,
          documentWidth: 100,
          documentHeight: 180,
        };
      }
      return undefined;
    }),
    screenshot: vi.fn(() => Buffer.from("png")),
    close: vi.fn(() => {
      counters.active--;
      return Promise.resolve();
    }),
  };
}

describe("BrowserPool", () => {
  const originalQueueTimeout = process.env.SCREENSHOT_QUEUE_TIMEOUT_MS;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalQueueTimeout === undefined) {
      delete process.env.SCREENSHOT_QUEUE_TIMEOUT_MS;
    } else {
      process.env.SCREENSHOT_QUEUE_TIMEOUT_MS = originalQueueTimeout;
    }
  });

  it("并发超过上限时进入队列而不是直接失败", async () => {
    const counters = { active: 0, max: 0 };

    vi.doMock("puppeteer-core", () => ({
      default: {
        launch: vi.fn(async () => ({
          connected: true,
          on: vi.fn(),
          newPage: vi.fn(() => createPage(20, counters)),
          close: vi.fn(),
        })),
      },
    }));

    const { getBrowserPool } = await import("../src/utils/browser-pool");
    const pool = getBrowserPool();
    const tasks = Array.from({ length: 4 }, () =>
      pool.renderPage("<div id=\"root\">ok</div>", 100, 100, false),
    );

    const results = await Promise.all(tasks);

    expect(results).toHaveLength(4);
    expect(counters.max).toBeLessThanOrEqual(3);
  });

  it("队列等待超过阈值时返回 QUEUE_TIMEOUT", async () => {
    process.env.SCREENSHOT_QUEUE_TIMEOUT_MS = "5";
    const counters = { active: 0, max: 0 };

    vi.doMock("puppeteer-core", () => ({
      default: {
        launch: vi.fn(async () => ({
          connected: true,
          on: vi.fn(),
          newPage: vi.fn(() => createPage(40, counters)),
          close: vi.fn(),
        })),
      },
    }));

    const { getBrowserPool } = await import("../src/utils/browser-pool");
    const pool = getBrowserPool();
    const tasks = Array.from({ length: 4 }, () =>
      pool.renderPage("<div id=\"root\">ok</div>", 100, 100, false),
    );

    await expect(tasks[3]).rejects.toMatchObject({ code: "QUEUE_TIMEOUT" });
    await Promise.allSettled(tasks.slice(0, 3));
  });
});

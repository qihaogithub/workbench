import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function createApp() {
  const { screenshotRoutes } = await import("../src/routes/screenshots");
  const app = Fastify({ logger: false });
  await app.register(screenshotRoutes, { prefix: "/api/screenshots" });
  return app;
}

const renderBox = {
  width: 320,
  height: 900,
  viewportWidth: 320,
  viewportHeight: 640,
  bodyWidth: 320,
  bodyHeight: 900,
  documentWidth: 320,
  documentHeight: 900,
  fullPage: true,
};

const renderTimings = {
  browserMs: 1,
  pageCreateMs: 2,
  setViewportMs: 3,
  setContentMs: 4,
  waitForSelectorMs: 5,
  waitForNetworkIdleMs: 6,
  animationFrameMs: 7,
  runtimeErrorCheckMs: 8,
  measurementMs: 9,
  viewportResizeMs: 10,
  screenshotMs: 11,
};

describe("screenshot routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("同一截图 hash 的并发请求会复用同一个渲染任务", async () => {
    let renderCount = 0;
    let resolveRender: (() => void) | null = null;
    const renderGate = new Promise<void>((resolve) => {
      resolveRender = resolve;
    });

    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(async () => ({
        compiledCode: "function Demo(){return null}",
        cssImports: [],
      })),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage: vi.fn(async () => {
          renderCount++;
          await renderGate;
          return {
            buffer: Buffer.from("png"),
            renderBox,
            queueWaitMs: 0,
            renderMs: 1,
          };
        }),
      }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: () => "same-hash",
      screenshotExists: vi.fn(async () => false),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot: vi.fn(),
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const payload = {
      projectId: "proj_1",
      pageId: "page_1",
      code: "export default function Demo() { return null; }",
      configData: {},
    };

    const first = app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload,
    });
    await vi.waitFor(() => {
      expect(renderCount).toBe(1);
    });
    const second = app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    resolveRender?.();
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(renderCount).toBe(1);
    await app.close();
  });

  it("批量任务可以取消并在状态接口暴露 cancelled", async () => {
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(async () => ({
        compiledCode: "function Demo(){return null}",
        cssImports: [],
      })),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage: vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    buffer: Buffer.from("png"),
                    renderBox,
                    queueWaitMs: 0,
                    renderMs: 1,
                    renderTimings,
                  }),
                25,
              ),
            ),
        ),
      }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: (_code: string, _config: unknown, _w: number, _h: number, fullPage: boolean) =>
        `hash-${String(fullPage)}`,
      screenshotExists: vi.fn(async () => false),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot: vi.fn(),
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate-batch",
      payload: {
        projectId: "proj_1",
        pages: [
          {
            pageId: "page_1",
            code: "export default function Demo() { return null; }",
            configData: {},
          },
        ],
      },
    });
    const batchId = createResponse.json().data.batchId;

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/api/screenshots/cancel/proj_1/${batchId}`,
    });
    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/screenshots/status/proj_1/${batchId}`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(statusResponse.json().data.cancelled).toBe(true);
    expect(statusResponse.json().data.status).toBe("cancelled");
    await app.close();
  });

  it("批量任务创建时返回每页预期 hash", async () => {
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(async () => ({
        compiledCode: "function Demo(){return null}",
        cssImports: [],
      })),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage: vi.fn(async () => ({
          buffer: Buffer.from("png"),
          renderBox,
          queueWaitMs: 0,
          renderMs: 1,
        })),
      }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(
        (
          code: string,
          _config: unknown,
          width: number,
          height: number,
          fullPage: boolean,
        ) => `hash-${code}-${width}-${height}-${String(fullPage)}`,
      ),
      screenshotExists: vi.fn(async () => true),
      readScreenshotRenderBox: vi.fn(async () => renderBox),
      readScreenshot: vi.fn(),
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate-batch",
      payload: {
        projectId: "proj_1",
        pages: [
          {
            pageId: "page_1",
            code: "a",
            configData: {},
            width: 320,
            height: 640,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results).toEqual([
      {
        pageId: "page_1",
        priority: "background",
        variant: "strict",
        quality: "strict",
        hash: "hash-a-320-640-false",
        status: "pending",
      },
    ]);
    expect(response.json().data.priorityStats.background.total).toBe(1);
    expect(response.json().data.prioritySlices.background).toMatchObject({
      total: 1,
      status: "pending",
    });
    expect(response.json().data.retryAfterMs).toBe(1000);
    await app.close();
  });

  it("批量任务按 priority 排序并汇总性能指标", async () => {
    const renderOrder: string[] = [];
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(async () => ({
        compiledCode: "function Demo(){return null}",
        cssImports: [],
      })),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage: vi.fn(
          async (
            _html: string,
            _width: number,
            _height: number,
            _fullPage: boolean,
            priority: string,
          ) => {
            renderOrder.push(priority);
            return {
              buffer: Buffer.from("png"),
              renderBox,
              queueWaitMs: priority === "active" ? 2 : 5,
              renderMs: priority === "active" ? 7 : 11,
              renderTimings,
            };
          },
        ),
      }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn((code: string) => `hash-${code}`),
      screenshotExists: vi.fn(async () => false),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot: vi.fn(),
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate-batch",
      payload: {
        projectId: "proj_1",
        pages: [
          {
            pageId: "page_background",
            code: "background",
            configData: {},
            priority: "background",
          },
          {
            pageId: "page_active",
            code: "active",
            configData: {},
            priority: "active",
          },
        ],
      },
    });
    const batchId = response.json().data.batchId;

    await vi.waitFor(() => {
      expect(renderOrder).toEqual(["active", "background"]);
    });

    let data: {
      priorityStats: {
        active: { completed: number };
        background: { completed: number };
      };
      metrics: {
        rendered: number;
        totalQueueWaitMs: number;
        renderStages: { pageCreateMs: number; setContentMs: number };
      };
      retryAfterMs: number;
      prioritySlices: {
        active: { status: string; completedElapsedMs: number };
      };
      results: Array<{ pageId: string }>;
    } | undefined;
    await vi.waitFor(async () => {
      const statusResponse = await app.inject({
        method: "GET",
        url: `/api/screenshots/status/proj_1/${batchId}`,
      });
      data = statusResponse.json().data;
      expect(data?.priorityStats.active.completed).toBe(1);
    });

    expect(data?.priorityStats.background.completed).toBe(1);
    expect(data?.metrics.rendered).toBe(2);
    expect(data?.metrics.totalQueueWaitMs).toBe(7);
    expect(data?.metrics.renderStages.pageCreateMs).toBe(4);
    expect(data?.metrics.renderStages.setContentMs).toBe(8);
    expect(data?.retryAfterMs).toBe(0);
    expect(data?.prioritySlices.active).toMatchObject({
      status: "completed",
      completedElapsedMs: expect.any(Number),
    });
    expect(data?.results.map((item: { pageId: string }) => item.pageId)).toEqual([
      "page_active",
      "page_background",
    ]);
    await app.close();
  });

  it("单页 fast 截图写入独立 variant 并返回 assetUrl", async () => {
    const renderPage = vi.fn(async () => ({
      buffer: Buffer.from("png"),
      renderBox,
      queueWaitMs: 0,
      renderMs: 1,
    }));
    const writeScreenshot = vi.fn();
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(async () => ({
        compiledCode: "function Demo(){return null}",
        cssImports: [],
      })),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage,
      }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(() => "1111111111111111"),
      screenshotExists: vi.fn(async () => false),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot: vi.fn(),
      writeScreenshot,
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload: {
        projectId: "proj_1",
        pageId: "page_1",
        code: "export default function Demo() { return null; }",
        configData: {},
        renderMode: "fast",
        measuredHeight: 900,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(renderPage).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
      false,
      "active",
      "fast",
      900,
    );
    expect(writeScreenshot).toHaveBeenCalledWith(
      "proj_1",
      "page_1",
      "1111111111111111",
      Buffer.from("png"),
      expect.any(Number),
      renderBox,
      "fast",
    );
    expect(response.json().data).toMatchObject({
      hash: "1111111111111111",
      variant: "fast",
      quality: "fast",
      assetUrl:
        "/api/screenshots/file/proj_1/page_1?hash=1111111111111111&variant=fast",
    });
    await app.close();
  });

  it("force 单页截图会绕过同 hash 缓存但保持 hash 不变", async () => {
    const renderPage = vi.fn(async () => ({
      buffer: Buffer.from("png"),
      renderBox,
      queueWaitMs: 0,
      renderMs: 1,
      renderTimings,
    }));
    const writeScreenshot = vi.fn();
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(async () => ({
        compiledCode: "function Demo(){return null}",
        cssImports: [],
      })),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage,
      }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(() => "1111111111111111"),
      screenshotExists: vi.fn(async () => true),
      readScreenshotRenderBox: vi.fn(async () => renderBox),
      readScreenshot: vi.fn(),
      writeScreenshot,
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload: {
        projectId: "proj_1",
        pageId: "page_1",
        code: "export default function Demo() { return null; }",
        configData: {},
        force: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(writeScreenshot).toHaveBeenCalledWith(
      "proj_1",
      "page_1",
      "1111111111111111",
      Buffer.from("png"),
      expect.any(Number),
      renderBox,
      "strict",
    );
    expect(response.json().data).toMatchObject({
      hash: "1111111111111111",
      cached: false,
    });
    await app.close();
  });

  it("已有 hash 截图过小时不会作为缓存命中", async () => {
    const renderPage = vi.fn(async () => ({
      buffer: Buffer.alloc(12_000, 1),
      renderBox,
      queueWaitMs: 0,
      renderMs: 1,
      renderTimings,
    }));
    const writeScreenshot = vi.fn();
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(async () => ({
        compiledCode: "function Demo(){return null}",
        cssImports: [],
      })),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage,
      }),
      isLikelyBlankScreenshot: (byteLength: number, box?: { width: number; height: number }) =>
        Boolean(box && box.width * box.height >= 160_000 && byteLength < 8192),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(() => "1111111111111111"),
      screenshotExists: vi.fn(async () => true),
      readScreenshotRenderBox: vi.fn(async () => renderBox),
      readScreenshot: vi.fn(async () => Buffer.from("png")),
      writeScreenshot,
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload: {
        projectId: "proj_1",
        pageId: "page_1",
        code: "export default function Demo() { return null; }",
        configData: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(writeScreenshot).toHaveBeenCalledWith(
      "proj_1",
      "page_1",
      "1111111111111111",
      Buffer.alloc(12_000, 1),
      expect.any(Number),
      renderBox,
      "strict",
    );
    expect(response.json().data.cached).toBe(false);
    await app.close();
  });

  it("HTML/CSS 原型页截图走静态 HTML 分支且不调用 React 编译", async () => {
    const compileCode = vi.fn();
    const renderPage = vi.fn(async () => ({
      buffer: Buffer.from("png"),
      renderBox,
      queueWaitMs: 0,
      renderMs: 1,
      renderTimings,
    }));
    const writeScreenshot = vi.fn();
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode,
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({
        renderPage,
      }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(() => "1111111111111111"),
      screenshotExists: vi.fn(async () => false),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot: vi.fn(),
      writeScreenshot,
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload: {
        projectId: "proj_1",
        pageId: "prototype_1",
        runtimeType: "prototype-html-css",
        prototypeHtml: "<main>{{title}}<script>window.bad = true</script></main>",
        prototypeCss: "main { width: 100vw; }",
        configData: { title: "原型页" },
        width: 320,
        height: 640,
        fullPage: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(compileCode).not.toHaveBeenCalled();
    expect(renderPage).toHaveBeenCalledWith(
      expect.stringContaining("原型页"),
      320,
      640,
      true,
      "active",
      "strict",
      undefined,
    );
    expect(renderPage.mock.calls[0]?.[0]).not.toContain("<script>window.bad");
    expect(writeScreenshot).toHaveBeenCalledWith(
      "proj_1",
      "prototype_1",
      "1111111111111111",
      Buffer.from("png"),
      expect.any(Number),
      renderBox,
      "strict",
    );
    await app.close();
  });

  it("React 截图编译携带页面上下文且直接执行编译代码", async () => {
    const compileCode = vi.fn(async () => ({
      compiledCode: `export default function Demo(){return "compiled-inline"}`,
      cssImports: [],
      moduleUrl: "/api/preview-modules/stale.js",
    }));
    const renderPage = vi.fn(async () => ({
      buffer: Buffer.from("png"),
      renderBox,
      queueWaitMs: 0,
      renderMs: 1,
      renderTimings,
    }));
    vi.doMock("../src/utils/compile-client", () => ({ compileCode }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({ renderPage }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(() => "1111111111111111"),
      screenshotExists: vi.fn(async () => false),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot: vi.fn(),
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload: {
        projectId: "proj_1",
        pageId: "page_1",
        sessionId: "session_1",
        code: "export default function Demo() { return null; }",
        configData: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(compileCode).toHaveBeenCalledWith(
      "export default function Demo() { return null; }",
      "session_1",
      "page_1",
    );
    expect(renderPage.mock.calls[0]?.[0]).toContain("compiled-inline");
    expect(renderPage.mock.calls[0]?.[0]).not.toContain("stale.js");
    await app.close();
  });

  it("原型页截图按 session 和 pageId 改写相对资产", async () => {
    const renderPage = vi.fn(async () => ({
      buffer: Buffer.from("png"),
      renderBox,
      queueWaitMs: 0,
      renderMs: 1,
      renderTimings,
    }));
    vi.doMock("../src/utils/compile-client", () => ({ compileCode: vi.fn() }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: () => ({ renderPage }),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(() => "1111111111111111"),
      screenshotExists: vi.fn(async () => false),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot: vi.fn(),
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(async () => {}),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/screenshots/generate",
      payload: {
        projectId: "proj_1",
        pageId: "prototype_1",
        sessionId: "session_1",
        runtimeType: "prototype-html-css",
        prototypeHtml: '<img src="../../assets/images/hero.png">',
        prototypeCss: 'main{background:url("../../assets/images/bg.png")}',
        configData: {},
      },
    });

    expect(response.statusCode).toBe(200);
    const renderedHtml = renderPage.mock.calls[0]?.[0] ?? "";
    expect(renderedHtml).toContain(
      "http://localhost:3200/api/sessions/session_1/workspace/assets/images/hero.png",
    );
    expect(renderedHtml).toContain(
      "http://localhost:3200/api/sessions/session_1/workspace/assets/images/bg.png",
    );
    await app.close();
  });

  it("文件接口按 hash 精确读取并使用不可变缓存", async () => {
    const readScreenshot = vi.fn(async () => Buffer.from("png"));
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: vi.fn(),
      isLikelyBlankScreenshot: vi.fn(() => false),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(),
      screenshotExists: vi.fn(),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot,
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots/file/proj_1/page_1?hash=ABCDEF1234567890",
    });

    expect(response.statusCode).toBe(200);
    expect(readScreenshot).toHaveBeenCalledWith(
      "proj_1",
      "page_1",
      "abcdef1234567890",
      "strict",
    );
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    await app.close();
  });

  it("文件 meta 接口遇到过小 current 截图时返回 404", async () => {
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: vi.fn(),
      isLikelyBlankScreenshot: (byteLength: number, box?: { width: number; height: number }) =>
        Boolean(box && box.width * box.height >= 160_000 && byteLength < 8192),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(),
      screenshotExists: vi.fn(),
      readScreenshotMeta: vi.fn(async () => ({
        currentHash: "1111111111111111",
        generatedAt: new Date().toISOString(),
        elapsed: 1,
        history: ["1111111111111111"],
        renderBoxes: {
          "1111111111111111": renderBox,
        },
      })),
      readScreenshotRenderBox: vi.fn(async () => renderBox),
      readScreenshot: vi.fn(async () => Buffer.from("png")),
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots/file/proj_1/page_1?meta=1",
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("文件接口按 variant 精确读取 fast 产物", async () => {
    const readScreenshot = vi.fn(async () => Buffer.from("png"));
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: vi.fn(),
      isLikelyBlankScreenshot: vi.fn(() => false),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(),
      screenshotExists: vi.fn(),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot,
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots/file/proj_1/page_1?hash=ABCDEF1234567890&variant=fast",
    });

    expect(response.statusCode).toBe(200);
    expect(readScreenshot).toHaveBeenCalledWith(
      "proj_1",
      "page_1",
      "abcdef1234567890",
      "fast",
    );
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    await app.close();
  });

  it("文件接口带非法 hash 时不回退 current", async () => {
    const readScreenshot = vi.fn(async () => Buffer.from("png"));
    vi.doMock("../src/utils/compile-client", () => ({
      compileCode: vi.fn(),
    }));
    vi.doMock("../src/utils/browser-pool", () => ({
      getBrowserPool: vi.fn(),
      isLikelyBlankScreenshot: vi.fn(() => false),
    }));
    vi.doMock("../src/utils/screenshot-store", () => ({
      computeScreenshotHash: vi.fn(),
      screenshotExists: vi.fn(),
      readScreenshotRenderBox: vi.fn(),
      readScreenshot,
      writeScreenshot: vi.fn(),
      cleanupOldScreenshots: vi.fn(),
    }));

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/screenshots/file/proj_1/page_1?hash=../current",
    });

    expect(response.statusCode).toBe(404);
    expect(readScreenshot).not.toHaveBeenCalled();
    await app.close();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SandboxBrowserRunner", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SCREENSHOT_TASK_TIMEOUT_MS;
  });

  function installPuppeteer(options: { timeout?: boolean; runtimeError?: boolean; cleanupHang?: boolean } = {}) {
    const counters = { launches: 0, contexts: 0, contextCloses: 0, browserCloses: 0, kills: 0, aborts: 0, continues: 0 };
    vi.doMock("puppeteer-core", () => ({
      default: {
        launch: vi.fn(async () => {
          counters.launches++;
          return {
            createBrowserContext: vi.fn(async () => {
              counters.contexts++;
              return {
                newPage: vi.fn(async () => {
                  let requestHandler: ((request: any) => void) | undefined;
                  return {
                    setRequestInterception: vi.fn(),
                    on: vi.fn((event: string, handler: (value: any) => void) => {
                      if (event === "request") requestHandler = handler;
                    }),
                    setViewport: vi.fn(),
                    setContent: options.timeout ? vi.fn(() => new Promise<void>(() => {})) : vi.fn(),
                    evaluate: vi.fn(async (fn: () => unknown) => {
                      const source = String(fn);
                      if (source.includes("data-preview-runtime-error")) return options.runtimeError ? "boom" : null;
                      if (source.includes("visible:")) return { bodyWidth: 100, bodyHeight: 180, documentWidth: 100, documentHeight: 180, visible: true };
                      return undefined;
                    }),
                    screenshot: vi.fn(async () => Buffer.from("png")),
                    close: vi.fn(),
                    __requestHandler: () => requestHandler,
                  };
                }),
                close: vi.fn(async () => { counters.contextCloses++; }),
              };
            }),
            close: options.cleanupHang ? vi.fn(() => new Promise<void>(() => {})) : vi.fn(async () => { counters.browserCloses++; }),
            process: () => ({ kill: vi.fn(() => { counters.kills++; }) }),
          };
        }),
      },
    }));
    return counters;
  }

  it("为每个任务创建隔离 context，且拒绝外部请求", async () => {
    const counters = installPuppeteer();
    const { SandboxBrowserRunner } = await import("../src/utils/sandbox-browser-runner");
    const runner = new SandboxBrowserRunner();
    const result = await runner.renderPage("<div>ok</div>", 100, 100);
    expect(result.buffer).toEqual(Buffer.from("png"));
    expect(counters.launches).toBe(1);
    expect(counters.contexts).toBe(1);
    expect(counters.contextCloses).toBe(1);
    expect(counters.browserCloses).toBe(1);
  });

  it("运行时错误和 deadline 都不会复用或遗留浏览器进程", async () => {
    const runtimeCounters = installPuppeteer({ runtimeError: true });
    const { SandboxBrowserRunner } = await import("../src/utils/sandbox-browser-runner");
    await expect(new SandboxBrowserRunner().renderPage("<script>throw 1</script>", 100, 100)).rejects.toMatchObject({ code: "RUNTIME_ERROR" });
    expect(runtimeCounters.contextCloses).toBe(1);
    expect(runtimeCounters.browserCloses).toBe(1);

    vi.resetModules();
    process.env.SCREENSHOT_TASK_TIMEOUT_MS = "10";
    const timeoutCounters = installPuppeteer({ timeout: true });
    const timeoutModule = await import("../src/utils/sandbox-browser-runner");
    await expect(new timeoutModule.SandboxBrowserRunner().renderPage("<div>hang</div>", 100, 100)).rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
    expect(timeoutCounters.contextCloses).toBe(1);
    expect(timeoutCounters.browserCloses).toBe(1);

    vi.resetModules();
    process.env.SCREENSHOT_TASK_TIMEOUT_MS = "10";
    const killCounters = installPuppeteer({ timeout: true, cleanupHang: true });
    const killModule = await import("../src/utils/sandbox-browser-runner");
    await expect(new killModule.SandboxBrowserRunner().renderPage("<div>hang</div>", 100, 100)).rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
    expect(killCounters.kills).toBeGreaterThan(0);
  });
});

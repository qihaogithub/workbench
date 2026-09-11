import type { DemoPageMeta } from "@workbench/shared";
import {
  hasLoadedPrototypeHtml,
  loadCanvasPageContent,
} from "../canvas-page-content-loader";

describe("loadCanvasPageContent", () => {
  const referencePage: DemoPageMeta = {
    id: "reference-page",
    name: "引用页",
    order: 0,
    parentId: null,
    runtimeType: "prototype-html-css",
    reference: {
      grantId: "grant-1",
      sourceProjectId: "source-project",
      sourcePageId: "source-page",
    },
  };

  it("通过引用内容端点加载源页面，而不是读取目标工作空间中不存在的页面目录", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          prototypeHtml: "<main>源页面</main>",
          prototypeCss: "main { color: red; }",
          schema: '{"type":"object"}',
          projectConfigSchema:
            '{"type":"object","properties":{"brand":{"type":"string"}}}',
          configData: { title: "最新内容" },
          runtimeType: "prototype-html-css",
          requirements: "# 页面规范",
          designSpecs: [
            {
              id: "brand",
              title: "品牌规范",
              entries: [{ id: "color", title: "主色", markdown: "使用蓝色。" }],
            },
          ],
          designSpecEntries: [
            {
              docId: "brand",
              docTitle: "品牌规范",
              entryId: "color",
              entryTitle: "主色",
              markdown: "使用蓝色。",
              scope: "page",
              pageId: "reference-page",
              fieldKey: "cover",
            },
          ],
        },
      }),
    });

    await expect(
      loadCanvasPageContent({
        page: referencePage,
        projectId: "target-project",
        sessionId: "session-1",
        request,
      }),
    ).resolves.toMatchObject({
      pageId: "reference-page",
      prototypeHtml: "<main>源页面</main>",
      configData: { title: "最新内容" },
      projectConfigSchema: expect.stringContaining("brand"),
      requirements: "# 页面规范",
      designSpecs: [{ title: "品牌规范" }],
      designSpecEntries: [{ fieldKey: "cover", pageId: "reference-page" }],
    });

    expect(request).toHaveBeenCalledWith(
      "/api/projects/target-project/reference-page/reference-page?sessionId=session-1",
    );
  });

  it("普通页面仍从当前 session 工作空间读取", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { code: "export default () => null" },
      }),
    });

    await loadCanvasPageContent({
      page: { ...referencePage, id: "local-page", reference: undefined },
      projectId: "target-project",
      sessionId: "session-1",
      request,
    });

    expect(request).toHaveBeenCalledWith(
      "/api/sessions/session-1/files/local-page",
    );
  });

  it("引用 sandbox 页面通过目标作用域端点签发执行票据", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { runtimeType: "sandboxed-html", sandboxHtml: "<button>go</button>" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { executionUrl: "https://sandbox.test/execution", channelId: "channel" } }),
      });

    await expect(loadCanvasPageContent({
      page: { ...referencePage, runtimeType: "sandboxed-html" },
      projectId: "target-project",
      sessionId: "session-1",
      request,
    })).resolves.toMatchObject({
      sandboxExecutionUrl: "https://sandbox.test/execution",
      sandboxChannelId: "channel",
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/projects/target-project/reference-page/reference-page/html-execution",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("动态 API 路由编译期短暂返回 HTML 时会重试页面内容请求", async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { code: "export default () => null" },
        }),
      });
    jest.useFakeTimers();

    try {
      const pending = loadCanvasPageContent({
        page: { ...referencePage, id: "local-page", reference: undefined },
        projectId: "target-project",
        sessionId: "session-1",
        request,
      });
      await jest.advanceTimersByTimeAsync(200);

      await expect(pending).resolves.toMatchObject({
        pageId: "local-page",
        code: "export default () => null",
      });
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("持续收到 HTML 时给出接口上下文而不是 JSON 语法错误", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });
    jest.useFakeTimers();

    try {
      const pending = loadCanvasPageContent({
        page: { ...referencePage, id: "local-page", reference: undefined },
        projectId: "target-project",
        sessionId: "session-1",
        request,
      });
      const rejected = expect(pending).rejects.toThrow(
        "页面内容接口 返回了非 JSON 响应",
      );
      await jest.runAllTimersAsync();

      await rejected;
      expect(request).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it("sandboxed-html 页面只通过鉴权接口申请执行票据", async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            sandboxHtml: "<button>安全预览</button>",
            runtimeType: "sandboxed-html",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            executionUrl: "/api/html-sandbox/executions/ticket",
            channelId: "channel-1",
            expiresAt: "2026-08-20T00:05:00.000Z",
          },
        }),
      });

    const result = await loadCanvasPageContent({
      page: {
        ...referencePage,
        id: "interactive-page",
        runtimeType: "sandboxed-html" as DemoPageMeta["runtimeType"],
        reference: undefined,
      },
      projectId: "target-project",
      sessionId: "session-1",
      request,
    });

    expect(result).toMatchObject({
      sandboxHtml: "<button>安全预览</button>",
      sandboxExecutionUrl: "/api/html-sandbox/executions/ticket",
      sandboxChannelId: "channel-1",
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/api/projects/target-project/demos/interactive-page/html-execution",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
  });

  it("默认 fetch 适配器会把 POST 方法和请求体透传给执行票据接口", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            sandboxHtml: "<button>安全预览</button>",
            runtimeType: "sandboxed-html",
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            executionUrl: "/api/html-sandbox/executions/ticket",
            channelId: "channel-1",
          },
        }),
      } as Response);

    try {
      await loadCanvasPageContent({
        page: {
          ...referencePage,
          id: "interactive-page",
          runtimeType: "sandboxed-html" as DemoPageMeta["runtimeType"],
          reference: undefined,
        },
        projectId: "target-project",
        sessionId: "session-1",
      });

      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "/api/projects/target-project/demos/interactive-page/html-execution",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ sessionId: "session-1" }),
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("hasLoadedPrototypeHtml", () => {
  it("does not treat an empty collaboration placeholder as loaded page content", () => {
    expect(hasLoadedPrototypeHtml(undefined)).toBe(false);
    expect(hasLoadedPrototypeHtml("")).toBe(false);
    expect(hasLoadedPrototypeHtml(" \n ")).toBe(false);
    expect(hasLoadedPrototypeHtml("<main>课程首页</main>")).toBe(true);
  });
});

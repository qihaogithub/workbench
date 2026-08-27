import type { DemoPageMeta } from "@workbench/shared";
import { loadCanvasPageContent } from "../canvas-page-content-loader";

describe("loadCanvasPageContent", () => {
  const referencePage: DemoPageMeta = {
    id: "reference-page",
    name: "引用页",
    order: 0,
    parentId: null,
    runtimeType: "prototype-html-css",
    reference: {
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
          schema: "{\"type\":\"object\"}",
          projectConfigSchema: "{\"type\":\"object\",\"properties\":{\"brand\":{\"type\":\"string\"}}}",
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
    });

    expect(request).toHaveBeenCalledWith(
      "/api/projects/target-project/reference-page/reference-page?sessionId=session-1",
    );
  });

  it("普通页面仍从当前 session 工作空间读取", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { code: "export default () => null" } }),
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

  it("sandboxed-html 页面只通过鉴权接口申请执行票据", async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { sandboxHtml: "<button>安全预览</button>", runtimeType: "sandboxed-html" },
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

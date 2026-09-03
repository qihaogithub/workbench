import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageConfigPanel } from "./PageConfigPanel";

const pageSchema = JSON.stringify({
  type: "object",
  properties: {
    cover: { type: "string", title: "封面", format: "image" },
  },
});

describe("PageConfigPanel design-spec bubble", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("引用页明确没有绑定时不回退到目标项目的规范", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/design-specs?")) {
        return Promise.resolve({ json: async () => ({ success: true, data: [{ id: "target-doc", title: "目标项目规范" }] }) });
      }
      return Promise.resolve({ json: async () => ({
        success: true,
        data: {
          id: "target-doc",
          title: "目标项目规范",
          entries: [{
            id: "target-entry",
            title: "目标封面规范",
            markdown: "不属于引用页",
            target: { type: "config", refs: [{ scope: "page", pageId: "reference-page", fieldKey: "cover" }] },
          }],
        },
      }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PageConfigPanel
        pages={[{ id: "reference-page", name: "引用页", schema: pageSchema, configData: {}, designSpecEntries: [] }]}
        detailPageId="reference-page"
        onPageConfigChange={vi.fn()}
        designSpecApiContext={{ workingDir: "/target-workspace" }}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "查看设计规范：封面" })).not.toBeInTheDocument();
  });

  it("仅显示当前页面的页面规范，常驻展示并复用规范详情气泡", async () => {
    render(
      <PageConfigPanel
        pages={[
          { id: "page-a", name: "页面 A", schema: pageSchema, configData: {} },
          { id: "page-b", name: "页面 B", schema: pageSchema, configData: {} },
        ]}
        detailPageId="page-a"
        onPageConfigChange={vi.fn()}
        pageDesignSpecEntries={[
          {
            docId: "doc-1",
            docTitle: "互动规范",
            entryId: "intro",
            entryTitle: "玩法介绍",
            markdown: "拖动选项填入空位。",
            pageId: "page-a",
          },
          {
            docId: "doc-1",
            docTitle: "互动规范",
            entryId: "reference",
            entryTitle: "往期资源参考",
            markdown: "[查看录屏](https://example.test/video)",
            pageId: "page-b",
          },
          {
            docId: "doc-1",
            docTitle: "互动规范",
            entryId: "empty",
            entryTitle: "空规范",
            markdown: "   ",
            pageId: "page-a",
          },
        ]}
      />,
    );

    expect(screen.queryByRole("heading", { name: "页面规范（1）" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看页面规范：玩法介绍" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看页面规范：往期资源参考" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看页面规范：玩法介绍" }));
    const bubble = await screen.findByRole("complementary", { name: "设计规范" });
    expect(bubble.querySelector("h3")).toHaveTextContent("玩法介绍");
    expect(screen.getByText("拖动选项填入空位。")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "查看页面规范：玩法介绍" }));
    fireEvent.click(screen.getByRole("button", { name: "查看页面规范：玩法介绍" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "设计规范" })).not.toBeInTheDocument());
  });

  it("引用页也复用字段旁规范入口，不渲染旧的整块规范区", async () => {
    render(
      <PageConfigPanel
        pages={[{
          id: "reference-page",
          name: "引用页",
          schema: pageSchema,
          configData: {},
          designSpecEntries: [{
            docId: "doc-1",
            docTitle: "设计规范",
            entryId: "entry-1",
            entryTitle: "封面样式",
            markdown: "引用页规范",
            scope: "page",
            pageId: "reference-page",
            fieldKey: "cover",
          }],
        }]}
        detailPageId="reference-page"
        onPageConfigChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("旧规范区")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看设计规范：封面" })).toBeInTheDocument();
  });

  it("将规范气泡挂到文档根层，避免分栏容器裁切", async () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page-1", name: "示例页", schema: pageSchema, configData: {} }]}
        detailPageId="page-1"
        onPageConfigChange={vi.fn()}
        mediaBaseUrl="https://assets.example.test"
        designSpecEntries={[{
          docId: "doc-1",
          docTitle: "设计规范",
          entryId: "entry-1",
          entryTitle: "封面样式",
          markdown: "图片高度不超过 300px\n\n![效果图](/api/images/spec.png)",
          scope: "page",
          pageId: "page-1",
          fieldKey: "cover",
        }]}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "查看设计规范：封面" }));
    fireEvent.click(screen.getByRole("button", { name: "查看设计规范：封面" }));

    const bubble = await screen.findByRole("complementary", { name: "设计规范" });
    expect(bubble.parentElement).toBe(document.body);
    expect(bubble.querySelector("h3")).toHaveTextContent("封面");
    expect(screen.getByText("图片高度不超过 300px")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "效果图" })).toHaveAttribute(
      "src",
      "https://assets.example.test/api/images/spec.png",
    );
    expect(bubble.style.height).toBe("");
    expect(bubble.style.maxHeight).not.toBe("");

    expect(screen.getByRole("button", { name: "查看设计规范：封面" })).toHaveClass("bg-blue-600", "text-white");
    fireEvent.pointerDown(screen.getByRole("button", { name: "查看设计规范：封面" }));
    fireEvent.click(screen.getByRole("button", { name: "查看设计规范：封面" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "设计规范" })).not.toBeInTheDocument());

    fireEvent.pointerDown(screen.getByRole("button", { name: "查看设计规范：封面" }));
    fireEvent.click(screen.getByRole("button", { name: "查看设计规范：封面" }));
    await screen.findByRole("complementary", { name: "设计规范" });

    fireEvent.click(screen.getByRole("button", { name: "关闭设计规范" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "设计规范" })).not.toBeInTheDocument());
  });

  it("标题操作菜单打开批注气泡，并按最新顺序展示线程", async () => {
    const target = {
      kind: "config" as const,
      scope: "page" as const,
      pageId: "page-1",
      fieldKey: "cover",
      fieldTitleSnapshot: "封面",
    };
    render(
      <PageConfigPanel
        pages={[{ id: "page-1", name: "示例页", schema: pageSchema, configData: {} }]}
        detailPageId="page-1"
        onPageConfigChange={vi.fn()}
        configComments={{
          readOnly: true,
          threads: [
            {
              id: "old",
              projectId: "project-1",
              target,
              content: "较早批注",
              author: { id: "u1", name: "甲", isAnonymous: false },
              createdAt: 10,
              updatedAt: 10,
              resolved: false,
              replies: [],
            },
            {
              id: "new",
              projectId: "project-1",
              target,
              content: "最新批注",
              author: { id: "u2", name: "乙", isAnonymous: false },
              createdAt: 20,
              updatedAt: 20,
              resolved: true,
              replies: [],
            },
          ],
        }}
      />,
    );

    const titleTrigger = screen.getByRole("button", { name: "封面配置项操作" });
    expect(titleTrigger).toBeVisible();
    fireEvent.click(titleTrigger);
    fireEvent.click(screen.getByRole("button", { name: "添加批注：封面" }));
    const bubble = await screen.findByRole("complementary", { name: "配置项批注" });
    expect(bubble).toHaveTextContent("最新批注");
    expect(bubble).toHaveTextContent("较早批注");
    expect(bubble.textContent!.indexOf("最新批注")).toBeLessThan(bubble.textContent!.indexOf("较早批注"));
    expect(screen.queryByText("新增批注")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "配置项批注" })).not.toBeInTheDocument());

  });

  it("将 Spine 上传回执作为已持久化的配置变更透传给宿主", async () => {
    const onPageConfigChange = vi.fn();
    const ref = { kind: "spine", version: 1, assetId: `spine_${"c".repeat(64)}` };
    const receipt = {
      committed: true,
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      baseRevision: 0,
      revision: 2,
      rootHash: "hash",
      actor: "author-site",
      resources: [],
      committedAt: 1,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ref, receipt, configCommitted: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ));
    const spineSchema = JSON.stringify({
      type: "object",
      properties: {
        spineAsset: {
          type: "object",
          format: "spine",
          title: "Spine 素材",
          properties: {
            kind: { const: "spine" },
            version: { const: 1 },
            assetId: { type: "string", pattern: "^spine_[a-f0-9]{64}$" },
          },
          required: ["kind", "version", "assetId"],
          additionalProperties: false,
        },
      },
    });
    const { container } = render(
      <PageConfigPanel
        pages={[{ id: "page-1", name: "示例页", schema: spineSchema, configData: {} }]}
        detailPageId="page-1"
        sessionId="session-1"
        onPageConfigChange={onPageConfigChange}
      />,
    );
    const file = new File([new Uint8Array([0x50, 0x4b, 3, 4])], "star_second.zip.flutter", { type: "application/zip" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(onPageConfigChange).toHaveBeenCalledWith(
      "page-1",
      { spineAsset: ref },
      { persistence: "committed", receipt },
    ));
  });
});

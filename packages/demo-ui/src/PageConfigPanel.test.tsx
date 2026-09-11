import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageConfigPanel } from "./PageConfigPanel";

const pageSchema = JSON.stringify({
  type: "object",
  properties: {
    cover: { type: "string", title: "封面", format: "image" },
  },
});

const semanticPageSchema = JSON.stringify({
  type: "object",
  properties: {
    pageFeatureEnabled: {
      type: "boolean",
      title: "本页功能开关",
      "ui:options": { configType: "business" },
    },
    pageCover: { type: "string", title: "本页封面" },
  },
});

const semanticProjectSchema = JSON.stringify({
  type: "object",
  properties: {
    membershipEnabled: {
      type: "boolean",
      title: "会员功能开关",
      "ui:options": { configType: "business" },
    },
    logo: { type: "string", title: "品牌 Logo" },
  },
});

function makeRect(top: number, height: number, left = 700, width = 500): DOMRect {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockRect(element: Element, rect: DOMRect | (() => DOMRect)) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: typeof rect === "function" ? rect : () => rect,
  });
}

async function openMeasuredSpecBubble({
  triggerTop,
  bubbleHeight,
  viewportHeight = 800,
}: {
  triggerTop: number;
  bubbleHeight: number;
  viewportHeight?: number;
}) {
  window.innerHeight = viewportHeight;
  const result = render(
    <PageConfigPanel
      pages={[{ id: "page-1", name: "示例页", schema: pageSchema, configData: {} }]}
      detailPageId="page-1"
      onPageConfigChange={vi.fn()}
      designSpecEntries={[{
        docId: "doc-1",
        docTitle: "设计规范",
        entryId: "entry-1",
        entryTitle: "封面样式",
        markdown: "规范正文",
        scope: "page",
        pageId: "page-1",
        fieldKey: "cover",
      }]}
    />,
  );

  const panel = result.container.firstElementChild as HTMLElement;
  mockRect(panel, makeRect(100, 700));
  const trigger = screen.getByRole("button", { name: "查看设计规范：封面" });
  mockRect(trigger, makeRect(triggerTop, 24, 900, 80));
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);

  const bubble = await screen.findByRole("complementary", { name: "设计规范" });
  mockRect(bubble, makeRect(0, bubbleHeight, 300, 380));
  fireEvent(window, new Event("resize"));
  return { ...result, bubble, trigger };
}

describe("PageConfigPanel design-spec bubble", () => {
  afterEach(() => {
    window.innerHeight = 768;
    vi.unstubAllGlobals();
  });

  it("以点击的规范标签中心为浮窗中心定位", async () => {
    const { bubble } = await openMeasuredSpecBubble({ triggerTop: 360, bubbleHeight: 240 });

    await waitFor(() => expect(bubble.style.top).toBe("252px"));
    expect(bubble.style.maxHeight).toBe("768px");
  });

  it("规范标签靠近视口边缘时将浮窗钳制在安全区域内", async () => {
    const topResult = await openMeasuredSpecBubble({ triggerTop: 20, bubbleHeight: 240 });
    await waitFor(() => expect(topResult.bubble.style.top).toBe("16px"));

    topResult.unmount();
    const bottomResult = await openMeasuredSpecBubble({ triggerTop: 740, bubbleHeight: 240 });
    await waitFor(() => expect(bottomResult.bubble.style.top).toBe("544px"));
  });

  it("规范内容过高时限制浮窗高度并让正文区域滚动", async () => {
    const { bubble } = await openMeasuredSpecBubble({
      triggerTop: 280,
      bubbleHeight: 1000,
      viewportHeight: 600,
    });

    await waitFor(() => expect(bubble.style.top).toBe("16px"));
    expect(bubble.style.maxHeight).toBe("568px");
    expect(bubble.querySelector('[class*="overflow-y-auto"]')).not.toBeNull();
  });

  it("配置栏滚动后浮窗跟随当前规范标签位置", async () => {
    let triggerTop = 300;
    const result = render(
      <PageConfigPanel
        pages={[{ id: "page-1", name: "示例页", schema: pageSchema, configData: {} }]}
        detailPageId="page-1"
        onPageConfigChange={vi.fn()}
        designSpecEntries={[{
          docId: "doc-1",
          docTitle: "设计规范",
          entryId: "entry-1",
          entryTitle: "封面样式",
          markdown: "规范正文",
          scope: "page",
          pageId: "page-1",
          fieldKey: "cover",
        }]}
      />,
    );
    mockRect(result.container.firstElementChild as HTMLElement, makeRect(100, 700));
    const trigger = screen.getByRole("button", { name: "查看设计规范：封面" });
    mockRect(trigger, () => makeRect(triggerTop, 24, 900, 80));
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    const bubble = await screen.findByRole("complementary", { name: "设计规范" });
    mockRect(bubble, makeRect(0, 240, 300, 380));
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(bubble.style.top).toBe("192px"));

    triggerTop = 500;
    const configContent = result.container.querySelector('[tabindex="-1"]');
    expect(configContent).not.toBeNull();
    fireEvent.scroll(configContent!);
    await waitFor(() => expect(bubble.style.top).toBe("392px"));
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

  it("标题直接编辑，批注标签打开气泡并按最新顺序展示线程", async () => {
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

    const commentButton = screen.getByRole("button", { name: "查看或添加批注：封面" });
    expect(commentButton).toBeVisible();
    expect(commentButton.parentElement).toHaveClass("pointer-events-auto", "opacity-100");
    expect(commentButton).toHaveClass("bg-amber-400", "text-amber-950");
    expect(screen.queryByRole("button", { name: "编辑配置项：封面" })).not.toBeInTheDocument();
    fireEvent.click(commentButton);
    const bubble = await screen.findByRole("complementary", { name: "配置项批注" });
    expect(bubble).toHaveTextContent("最新批注");
    expect(bubble).toHaveTextContent("较早批注");
    expect(bubble.textContent!.indexOf("最新批注")).toBeLessThan(bubble.textContent!.indexOf("较早批注"));
    expect(screen.queryByText("新增批注")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "配置项批注" })).not.toBeInTheDocument());

    fireEvent.click(commentButton);
    await screen.findByRole("complementary", { name: "配置项批注" });
    fireEvent.click(commentButton);
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "配置项批注" })).not.toBeInTheDocument());

  });

  it("浏览端没有配置批注时不显示批注标签", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page-1", name: "示例页", schema: pageSchema, configData: {} }]}
        detailPageId="page-1"
        onPageConfigChange={vi.fn()}
        configComments={{ readOnly: true, threads: [] }}
      />,
    );

    expect(screen.queryByRole("button", { name: "查看或添加批注：封面" })).not.toBeInTheDocument();
  });

  it("嵌套图片字段标题打开编辑器并定向更新原始 Schema", async () => {
    const onPageDefinitionChange = vi.fn();
    const schema = JSON.stringify({
      type: "object",
      properties: {
        navColor: { type: ["string", "null"], title: "导航栏颜色", format: "color", default: null },
        modules: {
          type: "array",
          title: "内容模块",
          items: {
            oneOf: [{
              title: "图片模块",
              properties: {
                type: { const: "image" },
                image: { type: "string", title: "图片", format: "image" },
              },
            }],
          },
        },
      },
    });

    render(
      <PageConfigPanel
        pages={[{
          id: "page-1",
          name: "示例页",
          schema,
          configData: { modules: [{ type: "image", image: "" }] },
        }]}
        detailPageId="page-1"
        onPageDefinitionChange={onPageDefinitionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "图片模块" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑配置项：图片" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "图片资源" } });
    fireEvent.click(screen.getByRole("button", { name: "保存字段" }));

    await waitFor(() => expect(onPageDefinitionChange).toHaveBeenCalledWith(
      "page-1",
      expect.objectContaining({
        diff: expect.objectContaining({ updated: ["modules[type=image].image"] }),
      }),
    ));
    const mutation = onPageDefinitionChange.mock.calls[0]?.[1];
    expect(JSON.parse(mutation.schema).properties.modules.items.oneOf[0].properties.image.title).toBe("图片资源");
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

  it("三级关卡入口打开单实例 Sheet，并把字段修改写回页面配置", async () => {
    const onPageConfigChange = vi.fn();
    const schema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          title: "内容模块",
          $demo: { sortable: true },
          items: {
            oneOf: [{
              title: "关卡模块",
              properties: {
                type: { const: "level" },
                levels: {
                  type: "array",
                  title: "关卡图",
                  $demo: { sortable: false },
                  "ui:options": {
                    detailPresentation: "sheet",
                    detailBreadcrumbTitle: "关卡列表",
                    itemTitleTemplate: "关卡 {index}",
                  },
                  items: {
                    oneOf: [{
                      title: "关卡",
                      properties: {
                        type: { const: "levelCard" },
                        status: { type: "string", title: "当前状态", enum: ["locked", "open"], "ui:widget": "segmented" },
                        showDetails: { type: "boolean", title: "显示详情", default: true },
                        secretText: {
                          type: "string",
                          title: "条件详情",
                          visibleWhen: { field: "showDetails", equals: true },
                        },
                        position: { type: "position", title: "自由坐标", key: "levelCard", size: { width: 375, height: 656 } },
                      },
                    }],
                  },
                },
              },
            }],
          },
        },
      },
    });

    render(
      <PageConfigPanel
        pages={[{
          id: "page-1",
          name: "闯关页",
          schema,
          configData: {
            modules: [{
              type: "level",
              levels: [{
                type: "levelCard",
                status: "locked",
                showDetails: true,
                secretText: "保留的详情",
                position: { x: 1, y: 2 },
              }],
            }],
          },
        }]}
        detailPageId="page-1"
        onPageConfigChange={onPageConfigChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "关卡模块" }));
    fireEvent.click(screen.getByRole("button", { name: "关卡 01" }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet.querySelectorAll('[data-config-detail-sheet="true"]')).toHaveLength(0);
    const breadcrumb = within(sheet).getByRole("navigation", { name: "配置层级" });
    expect(breadcrumb.querySelectorAll("li")).toHaveLength(1);
    expect(breadcrumb).toHaveTextContent("关卡 01");
    expect(breadcrumb).not.toHaveTextContent("关卡模块");
    expect(breadcrumb).not.toHaveTextContent("关卡列表");
    expect(sheet).toHaveTextContent("当前状态");
    expect(sheet).toHaveTextContent("条件详情");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(screen.getByRole("radio", { name: "open" }));
    expect(onPageConfigChange).toHaveBeenLastCalledWith(
      "page-1",
      {
        modules: [{
          type: "level",
          levels: [{
            type: "levelCard",
            status: "open",
            showDetails: true,
            secretText: "保留的详情",
            position: { x: 1, y: 2 },
          }],
        }],
      },
      undefined,
    );

    fireEvent.click(within(sheet).getByRole("switch"));
    expect(sheet).not.toHaveTextContent("条件详情");
    expect(onPageConfigChange).toHaveBeenLastCalledWith(
      "page-1",
      {
        modules: [{
          type: "level",
          levels: [{
            type: "levelCard",
            status: "open",
            showDetails: false,
            secretText: "保留的详情",
            position: { x: 1, y: 2 },
          }],
        }],
      },
      undefined,
    );

    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("PageConfigPanel 引用页配置能力", () => {
  it("允许编辑值并恢复默认，但隐藏定义编辑与保存为默认", () => {
    const onPageConfigChange = vi.fn();
    const onRestoreDefaults = vi.fn();
    const onSaveAsDefaults = vi.fn();
    const onPageDefinitionChange = vi.fn();

    render(
      <PageConfigPanel
        pages={[{
          id: "reference-page",
          name: "引用页",
          reference: { grantId: "grant-1", sourceProjectId: "source-project", sourcePageId: "source-page" },
          schema: pageSchema,
          configData: { cover: "/cover.png" },
          configItemCapabilities: {
            page: { canEditDefinition: false, canEditValue: true, canAddComment: true, reason: "reference" },
          },
        }]}
        detailPageId="reference-page"
        onPageConfigChange={onPageConfigChange}
        onPageDefinitionChange={onPageDefinitionChange}
        onRestoreDefaults={onRestoreDefaults}
        onSaveAsDefaults={onSaveAsDefaults}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更多配置操作" }));
    expect(screen.getByText("恢复默认")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存为默认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加配置项" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑配置项：封面" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("恢复默认"));
    fireEvent.click(screen.getByRole("button", { name: "确认恢复" }));
    expect(onRestoreDefaults).toHaveBeenCalled();
    expect(onPageDefinitionChange).not.toHaveBeenCalled();
  });
});

describe("PageConfigPanel 配置语义分区", () => {
  it("按语义合并作用域，并为共享字段提供按需来源提示", () => {
    render(
      <PageConfigPanel
        pages={[{
          id: "page-1",
          name: "示例页",
          schema: semanticPageSchema,
          configData: {},
        }]}
        detailPageId="page-1"
        projectConfigSchema={semanticProjectSchema}
        onPageConfigChange={vi.fn()}
        onProjectConfigChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("heading", { name: "业务配置" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "资源配置" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "共享配置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "本页配置" })).not.toBeInTheDocument();

    const projectBusinessSection = screen.getByText("会员功能开关").closest("section");
    const projectResourceSection = screen.getByText("品牌 Logo").closest("section");
    const pageBusinessSection = screen.getByText("本页功能开关").closest("section");
    const pageResourceSection = screen.getByText("本页封面").closest("section");

    expect(within(projectBusinessSection!).getByRole("heading", { name: "业务配置" })).toBeInTheDocument();
    expect(within(projectResourceSection!).getByRole("heading", { name: "资源配置" })).toBeInTheDocument();
    expect(within(pageBusinessSection!).getByRole("heading", { name: "业务配置" })).toBeInTheDocument();
    expect(within(pageResourceSection!).getByRole("heading", { name: "资源配置" })).toBeInTheDocument();
    expect(screen.getByLabelText("项目共享配置：会员功能开关")).toBeInTheDocument();
    expect(screen.getByLabelText("项目共享配置：品牌 Logo")).toBeInTheDocument();
    expect(screen.queryByLabelText("项目共享配置：本页功能开关")).not.toBeInTheDocument();
  });
});

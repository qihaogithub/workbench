import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  ConfigForm,
  extractCodeConfigBindingKeys,
  extractPrototypeConfigBindingKeys,
  PageConfigPanel,
} from "@workbench/demo-ui";
import { TooltipProvider } from "@/components/ui/tooltip";

const sharedSchema = JSON.stringify({
  type: "object",
  properties: {
    logo: { type: "string", title: "Logo" },
    theme: { type: "string", title: "主题" },
  },
});

const pageSchema = JSON.stringify({
  type: "object",
  properties: {
    title: { type: "string", title: "标题" },
  },
});

const typedPageSchema = JSON.stringify({
  type: "object",
  properties: {
    title: { type: "string", title: "标题" },
    heroImage: {
      type: "string",
      title: "主视觉图",
      format: "image",
      "ui:options": { category: "设计" },
    },
    accentColor: {
      type: "string",
      title: "强调色",
      format: "color",
      "ui:options": { category: "其他" },
    },
    campaignBanner: {
      type: "string",
      title: "商业横幅",
      "ui:options": { category: "商业" },
    },
  },
});

const switchOnlySchema = JSON.stringify({
  type: "object",
  properties: {
    enabled: { type: "boolean", title: "是否启用" },
  },
});

const conditionalMediaSchema = JSON.stringify({
  type: "object",
  properties: {
    mediaType: {
      type: "string",
      title: "弹窗媒体类型",
      enum: ["image", "svga"],
      enumNames: ["图片", "SVGA动画"],
      default: "image",
      "ui:options": {
        category: "视频",
        group: "弹窗素材",
      },
    },
    modalImage: {
      type: "string",
      title: "弹窗图片",
      default: "default-image.png",
      "ui:options": {
        category: "视频",
        group: "弹窗素材",
        visibleWhen: { field: "mediaType", equals: "image" },
      },
    },
    svgaSrc: {
      type: "string",
      title: "SVGA动画文件",
      default: "",
      "ui:options": {
        category: "视频",
        group: "弹窗素材",
        visibleWhen: { field: "mediaType", equals: "svga" },
      },
    },
  },
});

describe("PageConfigPanel", () => {
  it("一级列表可隐藏配置面板标题栏", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: "", configData: {} }]}
        hideOverviewHeader
        readonly
      />,
    );

    expect(screen.queryByText("配置面板")).not.toBeInTheDocument();
    expect(screen.getByText("页面 A")).toBeInTheDocument();
  });

  it("零配置页面隐藏数量和箭头，点击只触发页面选择不进入详情", () => {
    const onPageSelect = jest.fn();
    const onDetailPageIdChange = jest.fn();
    const { container } = render(
      <PageConfigPanel
        pages={[
          {
            id: "empty-page",
            name: "空配置页",
            order: 0,
            schema: "",
            configData: {},
            projectConfigBindings: [],
          },
        ]}
        activePageId="empty-page"
        onPageSelect={onPageSelect}
        onDetailPageIdChange={onDetailPageIdChange}
        readonly
      />,
    );

    const pageButton = screen.getByRole("button", { name: "空配置页" });
    expect(pageButton).toBeInTheDocument();
    expect(pageButton).not.toHaveTextContent("0");
    expect(container.querySelector(".lucide-chevron-right")).toBeNull();

    fireEvent.click(pageButton);

    expect(onPageSelect).toHaveBeenCalledWith("empty-page", {
      openConfigDetail: false,
    });
    expect(onDetailPageIdChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("返回所有页面")).not.toBeInTheDocument();
  });

  it("没有页面时展示明确空状态", () => {
    render(
      <PageConfigPanel
        pages={[]}
        readonly
      />,
    );

    expect(screen.getByText("暂无页面")).toBeInTheDocument();
    expect(screen.getByText("添加页面后即可配置页面内容")).toBeInTheDocument();
    expect(screen.queryByText("没有匹配的配置项")).not.toBeInTheDocument();
  });

  it("一级展示页面配置数量，二级展示共享配置和本页配置", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: {},
          },
          {
            id: "page_b",
            name: "页面 B",
            order: 1,
            schema: "",
            configData: {},
          },
        ]}
        activePageId="page_a"
        projectConfigSchema={sharedSchema}
        readonly
      />,
    );

    expect(screen.queryByText(/个页面有配置/)).not.toBeInTheDocument();
    expect(screen.queryByText(/共享 2 · 独有/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("筛选配置分类")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("页面 A"));

    expect(screen.queryByText(/项配置/)).not.toBeInTheDocument();
    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.queryByText("影响多个页面")).not.toBeInTheDocument();
    expect(screen.queryByText("仅当前页面")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText("受影响页面")).toBeInTheDocument();
    expect(screen.getAllByText("页面 A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("页面 B").length).toBeGreaterThan(0);
    expect(screen.getByText("本页配置")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("返回所有页面"));
    fireEvent.click(screen.getByText("页面 B"));

    expect(screen.queryByText(/项配置/)).not.toBeInTheDocument();
    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.queryByText("本页配置")).not.toBeInTheDocument();
  });

  it("单页详情模式隐藏配置面板头部", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: {},
          },
        ]}
        activePageId="page_a"
        detailPageId="page_a"
        projectConfigSchema={sharedSchema}
        hideDetailHeader
        readonly
      />,
    );

    expect(screen.queryByText("配置面板")).not.toBeInTheDocument();
    expect(screen.queryByText("页面 A")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("返回所有页面")).not.toBeInTheDocument();
    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();
  });

  it("项目级配置只在当前页面绑定对应字段时展示", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: {},
            projectConfigBindings: extractPrototypeConfigBindingKeys(
              '<section><img data-bind-src="logo" src="" /><h1>{{title}}</h1></section>',
            ),
          },
          {
            id: "page_b",
            name: "页面 B",
            order: 1,
            schema: "",
            configData: {},
            projectConfigBindings: [],
          },
        ]}
        activePageId="page_a"
        projectConfigSchema={sharedSchema}
        readonly
      />,
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("页面 A"));

    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(screen.queryByText("主题")).not.toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("返回所有页面"));
    fireEvent.click(screen.getByText("页面 B"));

    expect(screen.queryByLabelText("返回所有页面")).not.toBeInTheDocument();
    expect(screen.getByText("页面 B")).toBeInTheDocument();
  });

  it("支持按显式配置分类筛选页面列表和详情字段", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: typedPageSchema,
            configData: {},
          },
          {
            id: "page_b",
            name: "页面 B",
            order: 1,
            schema: switchOnlySchema,
            configData: {},
          },
        ]}
        activePageId="page_a"
        readonly
      />,
    );

    const filter = screen.getByLabelText("筛选配置分类");
    expect(screen.getByText("设计")).toBeInTheDocument();
    expect(screen.getByText("其他")).toBeInTheDocument();
    expect(screen.getByText("商业")).toBeInTheDocument();
    expect(screen.queryByText("动效")).not.toBeInTheDocument();
    expect(screen.queryByText("音效")).not.toBeInTheDocument();
    expect(screen.queryByText("视频")).not.toBeInTheDocument();

    fireEvent.change(filter, {
      target: { value: "设计" },
    });

    expect(screen.getByText("页面 A")).toBeInTheDocument();
    expect(screen.queryByText("页面 B")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("页面 A"));

    expect(screen.getByText("主视觉图")).toBeInTheDocument();
    expect(screen.queryByText("标题")).not.toBeInTheDocument();
    expect(screen.queryByText("强调色")).not.toBeInTheDocument();
  });

  it("支持自定义分类筛选", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: typedPageSchema,
            configData: {},
          },
          {
            id: "page_b",
            name: "页面 B",
            order: 1,
            schema: switchOnlySchema,
            configData: {},
          },
        ]}
        activePageId="page_a"
        readonly
      />,
    );

    fireEvent.change(screen.getByLabelText("筛选配置分类"), {
      target: { value: "商业" },
    });

    expect(screen.getByText("页面 A")).toBeInTheDocument();
    expect(screen.queryByText("页面 B")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("页面 A"));

    expect(screen.getByText("商业横幅")).toBeInTheDocument();
    expect(screen.queryByText("主视觉图")).not.toBeInTheDocument();
    expect(screen.queryByText("标题")).not.toBeInTheDocument();
  });

  it("配置内容无标题且不折叠，恢复入口收入右下角更多菜单", () => {
    const onRestoreDefaults = jest.fn();
    render(
      <TooltipProvider>
        <PageConfigPanel
          pages={[
            {
              id: "page_a",
              name: "页面 A",
              order: 0,
              schema: pageSchema,
              configData: { title: "标题" },
            },
          ]}
          activePageId="page_a"
          detailPageId="page_a"
          hideDetailHeader
          onRestoreDefaults={onRestoreDefaults}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByText("配置项")).not.toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "恢复默认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更多配置操作" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
    expect(screen.getByText("恢复默认配置")).toBeInTheDocument();
    expect(screen.getByText(/当前页面配置恢复为初始默认值/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认恢复" }));
    expect(onRestoreDefaults).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("恢复默认配置")).not.toBeInTheDocument();

  });

  it("字段名称打开单项编辑器，新增入口不再打开集合管理器", async () => {
    const onPageDefinitionChange = jest.fn();
    render(
      <TooltipProvider>
        <PageConfigPanel
          pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
          activePageId="page_a"
          detailPageId="page_a"
          hideDetailHeader
          onPageDefinitionChange={onPageDefinitionChange}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "标题配置项操作" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑配置项：标题" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("编辑配置项");
    expect(screen.queryByText("管理配置项")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "页面标题" } });
    fireEvent.click(screen.getByRole("button", { name: "保存字段" }));
    await waitFor(() => expect(onPageDefinitionChange).toHaveBeenCalledWith("page_a", expect.objectContaining({ diff: expect.objectContaining({ updated: ["title"] }) })));
    await waitFor(() => expect(screen.queryByRole("button", { name: "保存字段" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "更多配置操作" }));
    fireEvent.click(screen.getByRole("button", { name: "添加配置项" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("添加配置项");
  });

  it("等待异步字段定义保存完成，失败时保留编辑对话框", async () => {
    let resolveSave: (() => void) | undefined;
    const onPageDefinitionChange = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(
      <TooltipProvider>
        <PageConfigPanel
          pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
          activePageId="page_a"
          detailPageId="page_a"
          hideDetailHeader
          onPageDefinitionChange={onPageDefinitionChange}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "标题配置项操作" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑配置项：标题" }));
    fireEvent.click(screen.getByRole("button", { name: "保存字段" }));

    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    expect(onPageDefinitionChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave?.();
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "保存中…" })).not.toBeInTheDocument());
  });

  it("字段定义异步保存失败时不关闭对话框", async () => {
    const onPageDefinitionChange = jest.fn(async () => {
      throw new Error("保存失败");
    });
    render(
      <TooltipProvider>
        <PageConfigPanel
          pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
          activePageId="page_a"
          detailPageId="page_a"
          hideDetailHeader
          onPageDefinitionChange={onPageDefinitionChange}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "标题配置项操作" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑配置项：标题" }));
    fireEvent.click(screen.getByRole("button", { name: "保存字段" }));

    await waitFor(() => expect(onPageDefinitionChange).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "保存字段" })).not.toBeDisabled();
  });

  it("消费外部配置焦点并打开对应字段定义编辑器", () => {
    const onConsumed = jest.fn();
    render(
      <TooltipProvider>
        <PageConfigPanel
          pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
          activePageId="page_a"
          detailPageId="page_a"
          hideDetailHeader
          onPageDefinitionChange={jest.fn()}
          configDefinitionFocus={{ scope: "page", pageId: "page_a", fieldKey: "title" }}
          onConfigDefinitionFocusConsumed={onConsumed}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("编辑配置项");
    expect(screen.getByLabelText("名称")).toHaveValue("标题");
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("忽略不存在的外部配置字段，不误打开新增编辑器", () => {
    const onConsumed = jest.fn();
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        configDefinitionFocus={{ scope: "page", pageId: "page_a", fieldKey: "missing" }}
        onConfigDefinitionFocusConsumed={onConsumed}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("未传入配置项回调时不展示恢复与保存按钮", () => {
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: {},
          },
        ]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        projectConfigSchema={sharedSchema}
        readonly
      />,
    );

    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多配置操作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
  });

  it("只读模式不展示配置写入菜单", () => {
    const onRestoreDefaults = jest.fn();
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: { title: "标题" },
          },
        ]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        onRestoreDefaults={onRestoreDefaults}
        onSaveAsDefaults={() => {}}
        readonly
      />,
    );

    expect(screen.queryByRole("button", { name: "更多配置操作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "恢复默认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(onRestoreDefaults).not.toHaveBeenCalled();
  });
});

describe("ConfigForm 条件显示", () => {
  function ConditionalFormHarness() {
    const [data, setData] = useState<Record<string, unknown>>({
      mediaType: "image",
      modalImage: "default-image.png",
      svgaSrc: "intro.svga",
    });

    return (
      <div>
        <button
          type="button"
          onClick={() => setData((prev) => ({ ...prev, mediaType: "svga" }))}
        >
          切换SVGA
        </button>
        <button
          type="button"
          onClick={() => setData((prev) => ({ ...prev, mediaType: "image" }))}
        >
          切换图片
        </button>
        <ConfigForm
          key={String(data.mediaType)}
          schema={conditionalMediaSchema}
          initialData={data}
          onChange={(patch) => setData((prev) => ({ ...prev, ...patch }))}
        />
        <output data-testid="form-data">{JSON.stringify(data)}</output>
      </div>
    );
  }

  it("按 visibleWhen 展示当前媒体类型对应字段，并保留隐藏字段值", () => {
    render(<ConditionalFormHarness />);

    expect(screen.getByText("弹窗图片")).toBeInTheDocument();
    expect(screen.queryByText("SVGA动画文件")).not.toBeInTheDocument();
    expect(screen.getByText("弹窗素材").parentElement).not.toHaveTextContent("2");
    expect(screen.queryByText("基础配置")).not.toBeInTheDocument();
    expect(screen.queryByText("图片资源")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("切换SVGA"));

    expect(screen.queryByText("弹窗图片")).not.toBeInTheDocument();
    expect(screen.getByText("SVGA动画文件")).toBeInTheDocument();
    expect(screen.getByDisplayValue("intro.svga")).toBeInTheDocument();
    expect(screen.getByText("弹窗素材").parentElement).not.toHaveTextContent("2");
    expect(screen.queryByText("图片资源")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-data")).toHaveTextContent("intro.svga");

    fireEvent.click(screen.getByText("切换图片"));

    expect(screen.getByText("弹窗图片")).toBeInTheDocument();
    expect(screen.queryByText("SVGA动画文件")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-data")).toHaveTextContent("intro.svga");
  });

  it("分类筛选与 visibleWhen 同时生效", () => {
    render(
      <ConfigForm
        schema={conditionalMediaSchema}
        initialData={{
          mediaType: "svga",
          modalImage: "default-image.png",
          svgaSrc: "intro.svga",
        }}
        configCategoryFilter="视频"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("弹窗媒体类型")).toBeInTheDocument();
    expect(screen.getByText("SVGA动画文件")).toBeInTheDocument();
    expect(screen.queryByText("弹窗图片")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("intro.svga")).toBeInTheDocument();
  });
});

describe("ConfigForm 空标题", () => {
  const emptyTitleSchema = JSON.stringify({
    type: "object",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    properties: {
      modules: {
        type: "object",
        title: "",
        properties: {
          items: {
            type: "array",
            title: "",
            description: "描述文字",
            items: {
              type: "object",
              oneOf: [
                {
                  title: "图片模块",
                  properties: {
                    type: { const: "image", type: "string", title: "模块类型" },
                    imageUrl: { type: "string", title: "图片", format: "image" },
                  },
                  required: ["type"],
                },
              ],
            },
            default: [
              { type: "image", imageUrl: "https://example.com/img.png" },
            ],
          },
        },
      },
    },
    required: [],
  });

  it("空标题分组不渲染分组标题，空标题字段不渲染字段标签", () => {
    render(<ConfigForm schema={emptyTitleSchema} onChange={() => {}} />);

    expect(screen.queryByText("基础配置")).not.toBeInTheDocument();
    expect(screen.queryByText("modules")).not.toBeInTheDocument();
    expect(screen.queryByText("Items")).not.toBeInTheDocument();
    expect(screen.queryByText("描述文字")).not.toBeInTheDocument();
    expect(screen.getAllByText("图片模块").length).toBeGreaterThan(0);
  });
});

describe("PageConfigPanel 配置项与资源规范折叠区", () => {
  const pageSchema = JSON.stringify({
    type: "object",
    properties: {
      title: { type: "string", title: "标题" },
    },
  });

  it("配置内容无标题直接展示，资源规范折叠区默认展开", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
      />,
    );

    expect(screen.queryByText("配置项")).not.toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();
    expect(screen.getByText("资源规范")).toBeInTheDocument();
    expect(screen.getByText("暂无资源规范")).toBeInTheDocument();
  });

  it("配置项关联的设计规范说明为空时不展示整个规范模块", () => {
    render(
      <ConfigForm
        schema={typedPageSchema}
        initialData={{ heroImage: "https://example.com/hero.png" }}
        designSpecEntries={[
          {
            docId: "spec-1",
            docTitle: "视觉规范",
            entryId: "entry-1",
            entryTitle: "主视觉图片",
            markdown: "  \n ",
            scope: "page",
            fieldKey: "heroImage",
          },
          {
            docId: "spec-1",
            docTitle: "视觉规范",
            entryId: "entry-2",
            entryTitle: "有内容的规范",
            markdown: "保留这条说明。",
            scope: "page",
            fieldKey: "heroImage",
          },
        ]}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole("heading", { name: "主视觉图片" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "有内容的规范" })).not.toBeInTheDocument();
    expect(screen.queryByText("暂无说明")).not.toBeInTheDocument();
  });

  it("可隐藏资源规范，仅保留配置项", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
        requirementsPosition="hidden"
      />,
    );

    expect(screen.queryByText("配置项")).not.toBeInTheDocument();
    expect(screen.queryByText("资源规范")).not.toBeInTheDocument();
  });

  it("浏览端将设计规范内联在配置项下，不再放入资源规范区", () => {
    const { rerender } = render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
        requirementsPosition="beforeConfig"
        hideEmptyRequirements
      />,
    );

    expect(screen.queryByText("资源规范")).not.toBeInTheDocument();

    rerender(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
        requirementsPosition="beforeConfig"
        hideEmptyRequirements
        designSpecEntries={[{
          docId: "spec-1",
          docTitle: "弹窗规范",
          entryId: "entry-1",
          entryTitle: "配图",
          markdown: "图片底部不留白。",
          scope: "page",
          pageId: "page_a",
          fieldKey: "title",
        }]}
      />,
    );

    expect(screen.queryByText("资源规范")).not.toBeInTheDocument();
    expect(screen.queryByText("弹窗规范 · 配图")).not.toBeInTheDocument();
    const specButton = screen.getByRole("button", { name: "查看设计规范：标题" });
    expect(specButton).toBeInTheDocument();
    fireEvent.click(specButton);
    expect(screen.getByRole("complementary", { name: "设计规范" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(screen.getByText("图片底部不留白。")).toBeInTheDocument();
  });

  it("资源规范中的 Markdown 标题、列表和 HTTPS 图片按展示格式渲染", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
        requirementsPosition="beforeConfig"
        requirements={"## 图片要求\n\n- 底部不留白\n\n![示例](https://example.com/spec.png)"}
      />,
    );

    expect(screen.getByRole("heading", { name: "图片要求" })).toBeInTheDocument();
    expect(screen.getByText("底部不留白")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "示例" })).toHaveAttribute(
      "src",
      "https://example.com/spec.png",
    );
  });

  it("可将资源规范视觉排列在配置项之前", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
        requirementsPosition="beforeConfig"
      />,
    );

    expect(screen.getByText("资源规范").closest(".order-first")).not.toBeNull();
  });

  it("readonly 时资源规范不显示编辑按钮", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
        requirements=""
      />,
    );

    expect(screen.getByText("资源规范")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("非只读且有保存回调时资源规范显示编辑，可进入编辑态", () => {
    const onRequirementsChange = jest.fn();
    render(
      <TooltipProvider>
        <PageConfigPanel
          pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
          activePageId="page_a"
          detailPageId="page_a"
          hideDetailHeader
          requirements=""
          onRequirementsChange={onRequirementsChange}
        />
      </TooltipProvider>,
    );

    const editButton = screen.getByRole("button", { name: "编辑" });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("有配置要求内容时渲染只读内容且不显示编辑（readonly）", () => {
    render(
      <PageConfigPanel
        pages={[{ id: "page_a", name: "页面 A", order: 0, schema: pageSchema, configData: {} }]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        readonly
        requirements="# 交互要求\n\n@[标题](title) 需突出显示。"
      />,
    );

    expect(screen.queryByText("暂无资源规范")).not.toBeInTheDocument();
    expect(screen.getByText("交互要求", { exact: false })).toBeInTheDocument();
  });

  it("共享配置受影响页面数徽标点击后弹出列表，点击页面名跳转", () => {
    const onPageSelect = jest.fn();
    render(
      <PageConfigPanel
        pages={[
          {
            id: "page_a",
            name: "页面 A",
            order: 0,
            schema: pageSchema,
            configData: {},
          },
          {
            id: "page_b",
            name: "页面 B",
            order: 1,
            schema: "",
            configData: {},
          },
        ]}
        activePageId="page_a"
        detailPageId="page_a"
        hideDetailHeader
        projectConfigSchema={sharedSchema}
        readonly
        onPageSelect={onPageSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText("受影响页面")).toBeInTheDocument();
    fireEvent.click(screen.getByText("页面 B"));
    expect(onPageSelect).toHaveBeenCalledWith("page_b");
  });

  it("extractCodeConfigBindingKeys 提取 props 解构的共享配置字段", () => {
    const code = `
export default function Page(props: DemoProps) {
  const {
    bigBannerForeground = 'a.png',
    bigBannerBackground = 'b.png',
    miniBanners = [],
  } = props as Record<string, unknown>;
  return <div />;
}`;
    expect(extractCodeConfigBindingKeys(code)).toEqual(
      expect.arrayContaining([
        "bigBannerForeground",
        "bigBannerBackground",
        "miniBanners",
      ]),
    );
  });

  it("extractCodeConfigBindingKeys 忽略无关对象字面量字段", () => {
    const code = `
const subjects = [{ key: 'a', label: '阅读' }];
export default function Page(props: DemoProps) {
  const { theme = 'light' } = props;
  return <div>{subjects[0].key}</div>;
}`;
    expect(extractCodeConfigBindingKeys(code)).toEqual(["theme"]);
  });

  it("extractCodeConfigBindingKeys 无 props 解构时返回空", () => {
    expect(extractCodeConfigBindingKeys("export default () => <div />")).toEqual(
      [],
    );
    expect(extractCodeConfigBindingKeys(undefined)).toEqual([]);
  });

  it("extractCodeConfigBindingKeys 识别 props 别名、静态访问和动态共享字段族", () => {
    const code = `
export default function Page(props: DemoProps) {
  const p = props as Record<string, unknown>;
  const subject = (p.activeSubject as string) || 'reading';
  const mobile = p[\`headerBg\${cap(subject)}\`];
  const progress = p[\`progressBg\${cap(subject)}\`];
  return <div>{String(mobile)}{String(progress)}</div>;
}`;

    expect(
      extractCodeConfigBindingKeys(code, [
        "activeSubject",
        "headerBgReading",
        "headerBgThinking",
        "progressBgReading",
        "progressBgThinking",
        "padHeaderBgReading",
      ]),
    ).toEqual([
      "activeSubject",
      "headerBgReading",
      "headerBgThinking",
      "progressBgReading",
      "progressBgThinking",
    ]);
  });

  it("extractCodeConfigBindingKeys 不把动态字段前缀扩散到未引用字段族", () => {
    const code = `
export default function Page(props: DemoProps) {
  const p = props as Record<string, unknown>;
  return <img src={String(p[\`headerBg\${subject}\`])} />;
}`;

    expect(
      extractCodeConfigBindingKeys(code, [
        "headerBgReading",
        "headerBgThinking",
        "progressBgReading",
      ]),
    ).toEqual(["headerBgReading", "headerBgThinking"]);
  });

  it("extractCodeConfigBindingKeys 无稳定前后缀的动态键不推断为全部共享字段", () => {
    const code = `
export default function Page(props: DemoProps) {
  const p = props as Record<string, unknown>;
  return <div>{String(p[\`\${fieldName}\`])}</div>;
}`;

    expect(
      extractCodeConfigBindingKeys(code, ["logo", "theme", "activeSubject"]),
    ).toEqual([]);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  ConfigForm,
  extractPrototypeConfigBindingKeys,
  PageConfigPanel,
} from "@workbench/demo-ui";

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
    expect(screen.getByRole("button", { name: "影响 2 个页面" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "影响 2 个页面" }));
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
    expect(screen.getByText("0")).toBeInTheDocument();

    fireEvent.click(screen.getByText("页面 A"));

    expect(screen.getByText("共享配置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "影响 1 个页面" })).toBeInTheDocument();
    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(screen.queryByText("主题")).not.toBeInTheDocument();
    expect(screen.getByText("本页配置")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("返回所有页面"));
    fireEvent.click(screen.getByText("页面 B"));

    expect(screen.queryByText("共享配置")).not.toBeInTheDocument();
    expect(screen.queryByText("本页配置")).not.toBeInTheDocument();
    expect(screen.getByText("没有匹配的配置项")).toBeInTheDocument();
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

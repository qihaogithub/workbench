import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ConfigForm, PageConfigPanel } from "@opencode-workbench/demo-ui";

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
        group: "弹窗素材",
      },
    },
    modalImage: {
      type: "string",
      title: "弹窗图片",
      default: "default-image.png",
      "ui:options": {
        group: "弹窗素材",
        visibleWhen: { field: "mediaType", equals: "image" },
      },
    },
    svgaSrc: {
      type: "string",
      title: "SVGA动画文件",
      default: "",
      "ui:options": {
        group: "弹窗素材",
        visibleWhen: { field: "mediaType", equals: "svga" },
      },
    },
  },
});

describe("PageConfigPanel", () => {
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
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("页面 A"));

    expect(screen.queryByText(/项配置/)).not.toBeInTheDocument();
    expect(screen.getByText("共享配置")).toBeInTheDocument();
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
    expect(screen.getByText("弹窗素材").parentElement).toHaveTextContent("2");
    expect(screen.queryByText("基础配置")).not.toBeInTheDocument();
    expect(screen.queryByText("图片资源")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("切换SVGA"));

    expect(screen.queryByText("弹窗图片")).not.toBeInTheDocument();
    expect(screen.getByText("SVGA动画文件")).toBeInTheDocument();
    expect(screen.getByDisplayValue("intro.svga")).toBeInTheDocument();
    expect(screen.getByText("弹窗素材").parentElement).toHaveTextContent("2");
    expect(screen.queryByText("图片资源")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-data")).toHaveTextContent("intro.svga");

    fireEvent.click(screen.getByText("切换图片"));

    expect(screen.getByText("弹窗图片")).toBeInTheDocument();
    expect(screen.queryByText("SVGA动画文件")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-data")).toHaveTextContent("intro.svga");
  });
});

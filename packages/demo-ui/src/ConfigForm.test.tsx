import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfigForm } from "./ConfigForm";

const schema = JSON.stringify({
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "页面标题",
    },
  },
});

const groupedSchema = JSON.stringify({
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "页面标题",
      "ui:options": { group: "文本" },
    },
  },
});

const compactSchema = JSON.stringify({
  type: "object",
  properties: {
    count: { type: "number", title: "数量" },
    enabled: { type: "boolean", title: "启用" },
    color: { type: "string", title: "背景色", format: "color" },
  },
});

const imageSchema = JSON.stringify({
  type: "object",
  properties: {
    cover: { type: "string", title: "封面", format: "image" },
    gallery: { type: "array", title: "图库", "ui:widget": "imageList", items: { type: "string" } },
    attachment: { type: "string", title: "附件", format: "file" },
  },
});

describe("ConfigForm configuration-definition entry", () => {
  it("有非空设计规范时标题仍编辑配置项，规范标签打开气泡", () => {
    const onOpenDesignSpec = vi.fn();
    const onEditConfigDefinition = vi.fn();
    const spec = {
      docId: "doc-1",
      docTitle: "页面规范",
      entryId: "entry-1",
      entryTitle: "封面规范",
      markdown: "图片高度不超过 300px",
      scope: "page" as const,
      pageId: "page-1",
      fieldKey: "title",
    };

    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        designSpecEntries={[spec]}
        onOpenDesignSpec={onOpenDesignSpec}
        onEditConfigDefinition={onEditConfigDefinition}
      />,
    );

    expect(screen.getByText("规范")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑配置项：页面标题" }));
    expect(onEditConfigDefinition).toHaveBeenCalledWith("title", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "查看设计规范：页面标题" }));
    expect(onOpenDesignSpec).toHaveBeenCalledWith(spec, "页面标题");
  });

  it("没有非空设计规范时不显示规范标签", () => {
    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        designSpecEntries={[{
          docId: "doc-1",
          docTitle: "页面规范",
          entryId: "entry-1",
          entryTitle: "空规范",
          markdown: "  ",
          scope: "page",
          pageId: "page-1",
          fieldKey: "title",
        }]}
        onOpenDesignSpec={vi.fn()}
      />,
    );

    expect(screen.queryByText("规范")).not.toBeInTheDocument();
  });

  it("在提供编辑回调时将字段标题呈现为可操作入口", () => {
    const onEditConfigDefinition = vi.fn();

    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        onEditConfigDefinition={onEditConfigDefinition}
      />,
    );

    const trigger = screen.getByRole("button", { name: "编辑配置项：页面标题" });
    fireEvent.click(trigger);

    expect(onEditConfigDefinition).toHaveBeenCalledWith(
      "title",
      expect.objectContaining({ key: "title", title: "页面标题" }),
    );
  });

  it("未提供回调或只读时保持静态字段标题", () => {
    const { rerender } = render(<ConfigForm schema={schema} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "编辑配置项：页面标题" })).not.toBeInTheDocument();

    rerender(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        readonly
        onEditConfigDefinition={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "编辑配置项：页面标题" })).not.toBeInTheDocument();
    expect(screen.getByText(/页面标题/).closest("label")?.tagName).toBe("LABEL");
  });

  it("分组始终展示字段，字段固定呈现完整编辑态", () => {
    render(<ConfigForm schema={groupedSchema} onChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "文本" })).toBeInTheDocument();
    const textInput = screen.getByPlaceholderText("请输入页面标题");
    expect(textInput).toBeVisible();
    expect(textInput.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("数字、开关和颜色保持紧凑的行内编辑布局", () => {
    render(<ConfigForm schema={compactSchema} onChange={vi.fn()} />);

    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByDisplayValue("#000000")).toBeInTheDocument();
  });

  it("将标准单图和当前图片列表项解析为无 IO 白板目标", () => {
    const onLaunchWhiteboard = vi.fn();
    render(
      <ConfigForm
        schema={imageSchema}
        initialData={{ cover: "/cover.png", gallery: ["/one.png", "/two.png"], attachment: "/file.pdf" }}
        onChange={vi.fn()}
        imageConfigScope="page"
        pageId="page-1"
        onLaunchWhiteboard={onLaunchWhiteboard}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "白板绘图" })[0]);
    expect(onLaunchWhiteboard).toHaveBeenLastCalledWith({
      scope: "page",
      pageId: "page-1",
      fieldPath: "cover",
      currentValue: "/cover.png",
    });

    fireEvent.click(screen.getAllByRole("button", { name: "白板绘图" })[2]);
    expect(onLaunchWhiteboard).toHaveBeenLastCalledWith({
      scope: "page",
      pageId: "page-1",
      fieldPath: "gallery",
      listItem: { index: 1, url: "/two.png" },
    });
    expect(screen.getAllByRole("button", { name: "白板绘图" })).toHaveLength(4);
    expect(screen.queryAllByRole("button", { name: "AI绘图" })).toHaveLength(0);
  });

  it("只读表单不展示白板入口", () => {
    render(
      <ConfigForm
        schema={imageSchema}
        initialData={{ gallery: ["/one.png"] }}
        onChange={vi.fn()}
        readonly
        onLaunchWhiteboard={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole("button", { name: "白板绘图" })).toHaveLength(0);
  });
});

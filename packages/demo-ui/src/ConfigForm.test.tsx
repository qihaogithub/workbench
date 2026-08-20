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

describe("ConfigForm configuration-definition entry", () => {
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
});

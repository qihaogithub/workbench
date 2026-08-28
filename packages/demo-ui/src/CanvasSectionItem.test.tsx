import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasSectionItem } from "./CanvasSectionItem";

const section = {
  id: "section_a",
  kind: "section" as const,
  title: "登录流程",
  layout: { x: 10, y: 20, width: 240, height: 160 },
  children: [{ kind: "page" as const, id: "page_a" }],
  createdAt: 1,
  updatedAt: 1,
};

describe("CanvasSectionItem", () => {
  it("创建后可直接聚焦标题输入", () => {
    render(<CanvasSectionItem section={section} editable startEditing />);
    expect(screen.getByRole("textbox", { name: "Section 标题" })).toHaveFocus();
  });

  it("标题栏双击进入重命名，同时不影响标题栏拖拽入口", () => {
    const onRename = vi.fn();
    render(<CanvasSectionItem section={section} editable onRename={onRename} />);
    fireEvent.doubleClick(
      screen.getByRole("button", { name: /选择 Section: 登录流程/ })
        .parentElement as HTMLElement,
    );
    const input = screen.getByRole("textbox", { name: "Section 标题" });
    expect(input).toBeVisible();
    fireEvent.change(input, { target: { value: "新流程" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("section_a", "新流程");
  });

  it("始终显示标题栏，不再提供折叠入口", () => {
    const { container } = render(
      <CanvasSectionItem section={section} editable />,
    );

    const item = container.querySelector(
      "[data-canvas-section-id]",
    ) as HTMLElement;
    expect(item).not.toHaveAttribute("data-canvas-section-collapsed");
    expect(screen.getByRole("button", { name: /选择 Section: 登录流程/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /折叠 Section|展开 Section/ })).toBeNull();
  });

  it("标题始终可见，边缘仍可选择且内部不会成为点击目标", () => {
    const onSelect = vi.fn();
    render(
      <CanvasSectionItem
        section={section}
        editable
        onSelect={onSelect}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "选择并移动 Section: 登录流程" }),
    );
    expect(onSelect).toHaveBeenCalledWith("section_a");
    expect(screen.getByRole("button", { name: /选择 Section: 登录流程/ })).toBeVisible();
  });

  it("以更大的字号展示标题", () => {
    render(<CanvasSectionItem section={section} editable />);
    expect(screen.getByRole("button", { name: /选择 Section: 登录流程/ }).parentElement).toHaveClass(
      "text-base",
    );
  });
});

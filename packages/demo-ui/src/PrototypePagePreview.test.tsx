import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrototypePagePreview } from "./PrototypePagePreview";

function getPrototypeRoot(container: HTMLElement): HTMLElement {
  const host = container.querySelector<HTMLElement>("[data-prototype-preview]");
  const root = host?.shadowRoot?.querySelector<HTMLElement>(".prototype-root");
  if (!root) throw new Error("原型页 Shadow DOM 尚未渲染");
  return root;
}

describe("PrototypePagePreview 文本直接编辑", () => {
  it("点击预览宿主空白处时清空选择和图层栈", () => {
    const onVisualSelect = vi.fn();
    const onVisualSelectStack = vi.fn();
    const { container } = render(
      <PrototypePagePreview
        html="<button>保存</button>"
        visualEditMode
        onVisualSelect={onVisualSelect}
        onVisualSelectStack={onVisualSelectStack}
      />,
    );

    const host = container.querySelector<HTMLElement>("[data-prototype-preview]");
    if (!host) throw new Error("原型页宿主未渲染");
    fireEvent.click(host);

    expect(onVisualSelect).toHaveBeenCalledWith(null);
    expect(onVisualSelectStack).toHaveBeenCalledWith([]);
  });

  it("点击缩放页面外的预览容器空白处时清空选择和图层栈", () => {
    const onVisualSelect = vi.fn();
    const onVisualSelectStack = vi.fn();
    const { container } = render(
      <PrototypePagePreview
        html="<button>保存</button>"
        previewSize={{ width: 960, height: 640 }}
        containerSizeOverride={{ width: 1280, height: 900 }}
        visualEditMode
        onVisualSelect={onVisualSelect}
        onVisualSelectStack={onVisualSelectStack}
      />,
    );

    const previewContainer = container.querySelector<HTMLElement>(
      "[data-prototype-preview-container]",
    );
    if (!previewContainer) throw new Error("缩放预览容器未渲染");
    fireEvent.click(previewContainer);

    expect(onVisualSelect).toHaveBeenCalledWith(null);
    expect(onVisualSelectStack).toHaveBeenCalledWith([]);
  });

  it("受控选中节点会保留原型页选中标记", () => {
    const { container } = render(
      <PrototypePagePreview
        html="<button>保存</button>"
        visualEditMode
        selectedVisualNodeId="prototype-root > button:nth-of-type(1)"
      />,
    );

    const root = getPrototypeRoot(container);
    expect(root.querySelector("button")).toHaveAttribute(
      "data-prototype-selected",
      "true",
    );
  });

  it("关闭视觉编辑后清除选中框、悬停框和标签状态", () => {
    const { container, rerender } = render(
      <PrototypePagePreview
        html="<button>保存</button>"
        visualEditMode
        visualHoverNodeId="prototype-root > button:nth-of-type(1)"
        selectedVisualNodeId="prototype-root > button:nth-of-type(1)"
      />,
    );

    const root = getPrototypeRoot(container);
    const button = root.querySelector("button");
    if (!button) throw new Error("测试按钮未渲染");
    expect(button).toHaveAttribute("data-prototype-selected", "true");
    expect(button).toHaveAttribute("data-prototype-hovered", "true");

    rerender(
      <PrototypePagePreview
        html="<button>保存</button>"
        visualEditMode={false}
        visualHoverNodeId="prototype-root > button:nth-of-type(1)"
        selectedVisualNodeId="prototype-root > button:nth-of-type(1)"
      />,
    );

    const rerenderedButton = getPrototypeRoot(container).querySelector("button");
    if (!rerenderedButton) throw new Error("重渲染后的测试按钮未渲染");
    expect(rerenderedButton).not.toHaveAttribute("data-prototype-selected");
    expect(rerenderedButton).not.toHaveAttribute("data-prototype-hovered");
  });

  it("内容重建后仍注入可视化编辑专用鼠标", () => {
    const { container, rerender } = render(
      <PrototypePagePreview html="<button>保存</button>" visualEditMode />,
    );

    const host = container.querySelector<HTMLElement>("[data-prototype-preview]");
    if (!host?.shadowRoot) throw new Error("原型页 Shadow DOM 未渲染");
    expect(
      host.shadowRoot.getElementById("prototype-visual-selection-cursor"),
    ).not.toBeNull();

    rerender(
      <PrototypePagePreview
        html="<button>保存</button>"
        configData={{ title: "更新后的配置" }}
        visualEditMode
      />,
    );

    expect(
      host.shadowRoot.getElementById("prototype-visual-selection-cursor"),
    ).not.toBeNull();
  });

  it("点击实际元素不会触发宿主空白清空逻辑", () => {
    const onVisualSelect = vi.fn();
    const { container } = render(
      <PrototypePagePreview
        html="<button>保存</button>"
        visualEditMode
        onVisualSelect={onVisualSelect}
      />,
    );

    const root = getPrototypeRoot(container);
    const button = root.querySelector("button");
    if (!button) throw new Error("测试按钮未渲染");
    fireEvent.click(button);

    expect(onVisualSelect).toHaveBeenCalledWith(
      expect.objectContaining({ tagName: "button" }),
    );
    expect(onVisualSelect).not.toHaveBeenCalledWith(null);
  });

  it("双击叶子文本后用覆盖层提交修改", () => {
    const onVisualTextChange = vi.fn();
    const { container } = render(
      <PrototypePagePreview
        html={'<button class="primary">保存</button>'}
        css={".primary { font-size: 16px; }"}
        visualEditMode
        onVisualTextChange={onVisualTextChange}
      />,
    );

    const root = getPrototypeRoot(container);
    const button = root.querySelector("button");
    if (!button) throw new Error("测试按钮未渲染");

    fireEvent.doubleClick(button);
    const editor = root.querySelector<HTMLTextAreaElement>(
      "textarea[data-prototype-text-editor]",
    );
    expect(editor).not.toBeNull();
    expect(editor).toHaveValue("保存");

    fireEvent.change(editor!, { target: { value: "发布" } });
    fireEvent.keyDown(editor!, { key: "Enter" });

    expect(onVisualTextChange).toHaveBeenCalledTimes(1);
    expect(onVisualTextChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tagName: "button",
        domPath: "prototype-root > button:nth-of-type(1)",
      }),
      "发布",
      "保存",
    );
    expect(root.querySelector("[data-prototype-text-editor]")).toBeNull();
  });

  it("Escape 取消修改并恢复原节点显示", () => {
    const onVisualTextChange = vi.fn();
    const { container } = render(
      <PrototypePagePreview
        html="<p>原文</p>"
        visualEditMode
        onVisualTextChange={onVisualTextChange}
      />,
    );
    const root = getPrototypeRoot(container);
    const paragraph = root.querySelector<HTMLElement>("p");
    if (!paragraph) throw new Error("测试段落未渲染");

    fireEvent.doubleClick(paragraph);
    const editor = root.querySelector<HTMLTextAreaElement>(
      "textarea[data-prototype-text-editor]",
    );
    if (!editor) throw new Error("文本覆盖层未创建");
    fireEvent.change(editor, { target: { value: "未提交" } });
    fireEvent.keyDown(editor, { key: "Escape" });

    expect(onVisualTextChange).not.toHaveBeenCalled();
    expect(paragraph.style.color).toBe("");
  });

  it("把 data-bind-text 暴露为配置绑定元数据", () => {
    const onVisualTextChange = vi.fn();
    const { container } = render(
      <PrototypePagePreview
        html={'<h1 data-bind-text="heroTitle">默认标题</h1>'}
        configData={{ heroTitle: "配置标题" }}
        visualEditMode
        onVisualTextChange={onVisualTextChange}
      />,
    );
    const root = getPrototypeRoot(container);
    const heading = root.querySelector("h1");
    if (!heading) throw new Error("测试标题未渲染");

    fireEvent.doubleClick(heading);
    const editor = root.querySelector<HTMLTextAreaElement>(
      "textarea[data-prototype-text-editor]",
    );
    if (!editor) throw new Error("文本覆盖层未创建");
    fireEvent.change(editor, { target: { value: "新配置标题" } });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(onVisualTextChange).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: { kind: "text", key: "heroTitle" },
      }),
      "新配置标题",
      "配置标题",
    );
  });

  it("不把包含子元素的混合内容作为整块文本编辑", () => {
    const { container } = render(
      <PrototypePagePreview
        html="<p>欢迎 <strong>回来</strong></p>"
        visualEditMode
      />,
    );
    const root = getPrototypeRoot(container);
    const paragraph = root.querySelector("p");
    if (!paragraph) throw new Error("测试段落未渲染");

    fireEvent.doubleClick(paragraph);

    expect(root.querySelector("[data-prototype-text-editor]")).toBeNull();
  });
});

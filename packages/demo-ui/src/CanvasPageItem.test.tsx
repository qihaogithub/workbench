import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CanvasPageItem } from "./CanvasPageItem";
import { CanvasViewport } from "./CanvasViewport";
import type { CanvasToolMode } from "./types";

const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "setPointerCapture",
);
const originalReleasePointerCapture = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "releasePointerCapture",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  if (originalSetPointerCapture) {
    Object.defineProperty(
      HTMLElement.prototype,
      "setPointerCapture",
      originalSetPointerCapture,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
  }
  if (originalReleasePointerCapture) {
    Object.defineProperty(
      HTMLElement.prototype,
      "releasePointerCapture",
      originalReleasePointerCapture,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture");
  }
});

function renderPageInViewport(toolMode: CanvasToolMode) {
  const onDragStart = vi.fn();
  const onViewportChange = vi.fn();
  const result = render(
    <CanvasViewport
      viewport={{ x: 0, y: 0, zoom: 1 }}
      onViewportChange={onViewportChange}
      editable
      interactionMode="editor"
      toolMode={toolMode}
    >
      <CanvasPageItem
        page={{
          id: "page-1",
          name: "页面一",
          order: 0,
          code: "export default function Page() { return null; }",
          previewSize: { width: 375, height: 812 },
        }}
        layout={{ x: 100, y: 120, width: 375, height: 812 }}
        editable
        renderMode="loading"
        toolMode={toolMode}
        onDragStart={onDragStart}
      />
    </CanvasViewport>,
  );

  return { ...result, onDragStart, onViewportChange };
}

describe("CanvasPageItem context menu", () => {
  it("提供复制命令，并在执行后关闭菜单且不启动拖拽", () => {
    const onCopy = vi.fn();
    const onDragStart = vi.fn();
    const { container } = render(
      <CanvasPageItem
        page={{ id: "page-1", name: "页面一", order: 0 }}
        layout={{ x: 100, y: 120, width: 375, height: 812 }}
        editable
        renderMode="loading"
        toolMode="select"
        onCopy={onCopy}
        onDragStart={onDragStart}
      />,
    );
    const page = container.querySelector('[data-page-id="page-1"]')!;

    fireEvent.contextMenu(page, { clientX: 240, clientY: 260 });
    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    expect(onCopy).toHaveBeenCalledWith("page-1");
    expect(onDragStart).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "复制" })).not.toBeInTheDocument();
  });

  it.each(["select", "hand"] as const)(
    "%s 工具下按下菜单外区域会关闭菜单且不启动画布手势",
    (toolMode) => {
      const { container, onDragStart, onViewportChange } =
        renderPageInViewport(toolMode);
      const page = container.querySelector(
        '[data-page-id="page-1"]',
      ) as HTMLElement;

      fireEvent.contextMenu(page, { clientX: 240, clientY: 260 });
      expect(screen.getByText("重置大小")).toBeInTheDocument();

      const backdrop = document.body.querySelector(
        '[data-canvas-context-menu-layer="backdrop"]',
      ) as HTMLElement;
      expect(backdrop).toBeInTheDocument();

      fireEvent.pointerDown(backdrop, {
        button: 0,
        clientX: 20,
        clientY: 20,
        pointerId: 1,
      });

      expect(screen.queryByText("重置大小")).not.toBeInTheDocument();
      expect(onDragStart).not.toHaveBeenCalled();
      expect(onViewportChange).not.toHaveBeenCalled();
    },
  );
});

describe("CanvasPageItem navigation targets", () => {
  it("directly selects this page as a pending navigation target instead of dragging it", () => {
    const onNavigationTargetSelect = vi.fn();
    const onDragStart = vi.fn();
    const { container } = render(
      <CanvasPageItem
        page={{ id: "target", name: "目标页", order: 1 }}
        layout={{ x: 0, y: 0, width: 375, height: 812 }}
        editable
        renderMode="loading"
        toolMode="navigation"
        navigationTargetPending
        onNavigationTargetSelect={onNavigationTargetSelect}
        onDragStart={onDragStart}
      />,
    );
    fireEvent(
      container.querySelector("[data-page-id='target']")!,
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    expect(onNavigationTargetSelect).toHaveBeenCalledWith("target");
    expect(onDragStart).not.toHaveBeenCalled();
  });
});

describe("CanvasPageItem title editing", () => {
  it("双击标题重命名且不启动页面拖拽", async () => {
    const onRename = vi.fn().mockResolvedValue(true);
    const onDragStart = vi.fn();
    render(
      <CanvasPageItem
        page={{
          id: "page-1",
          name: "页面一",
          order: 0,
          code: "export default function Page() { return null; }",
          previewSize: { width: 375, height: 812 },
        }}
        layout={{ x: 100, y: 120, width: 375, height: 812 }}
        editable
        renderMode="loading"
        toolMode="select"
        onRename={onRename}
        onDragStart={onDragStart}
      />,
    );

    const title = screen.getByRole("button", { name: /页面标题：页面一/ });
    fireEvent.pointerDown(title, { button: 0, pointerId: 1 });
    expect(onDragStart).not.toHaveBeenCalled();

    fireEvent.doubleClick(title);
    const input = screen.getByRole("textbox", { name: "页面标题" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "新页面" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith("page-1", "新页面"),
    );
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("Escape 取消页面标题编辑，失焦提交修改", async () => {
    const onRename = vi.fn().mockResolvedValue(true);
    render(
      <CanvasPageItem
        page={{ id: "page-1", name: "页面一", order: 0 }}
        layout={{ x: 0, y: 0, width: 375, height: 812 }}
        editable
        renderMode="loading"
        toolMode="select"
        onRename={onRename}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("button", { name: /页面标题：页面一/ }));
    const input = screen.getByRole("textbox", { name: "页面标题" });
    fireEvent.change(input, { target: { value: "放弃的名称" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByRole("button", { name: /页面标题：页面一/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "页面标题" }), {
      target: { value: "失焦名称" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "页面标题" }));
    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith("page-1", "失焦名称"),
    );
  });
});

describe("CanvasPageItem cursor", () => {
  it("选择工具悬停页面内容时使用标准指针，而不是四向移动光标", () => {
    const { container } = render(
      <CanvasPageItem
        page={{ id: "page-1", name: "页面一", order: 0 }}
        layout={{ x: 0, y: 0, width: 375, height: 812 }}
        editable
        renderMode="loading"
        toolMode="select"
      />,
    );

    expect(container.querySelector("[data-page-id='page-1']")).toHaveStyle({
      cursor: "default",
    });
  });
});

describe("CanvasPageItem proportional resize", () => {
  it("exposes all resize handles while preserving the page aspect ratio", () => {
    const onLayoutChange = vi.fn();
    const { container } = render(
      <CanvasPageItem
        page={{ id: "page-1", name: "页面一", order: 0, previewSize: { width: 375, height: 812 } }}
        layout={{ x: 100, y: 120, width: 375, height: 812 }}
        editable
        selected
        renderMode="loading"
        toolMode="select"
        onLayoutChange={onLayoutChange}
      />,
    );

    expect(container.querySelectorAll("[data-canvas-resize-handle]")).toHaveLength(8);
    expect(container.querySelector('[data-canvas-resize-handle="nw"]')).toHaveStyle({ cursor: "nwse-resize" });
    expect(container.querySelector('[data-canvas-resize-handle="n"]')).toHaveStyle({ cursor: "ns-resize" });
    expect(container.querySelector('[data-canvas-resize-handle="e"]')).toHaveStyle({ cursor: "ew-resize" });

    const southEast = container.querySelector('[data-canvas-resize-handle="se"]') as HTMLElement;
    const page = container.querySelector('[data-page-id="page-1"]') as HTMLElement;
    fireEvent(southEast, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    fireEvent(page, new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 10 }));

    const resized = onLayoutChange.mock.calls.at(-1)?.[1];
    expect(resized.width / resized.height).toBeCloseTo(375 / 812);

    fireEvent(page, new MouseEvent("pointerup", { bubbles: true, clientX: 40, clientY: 10 }));

    const east = container.querySelector('[data-canvas-resize-handle="e"]') as HTMLElement;
    fireEvent(east, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    fireEvent(page, new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 10 }));

    const edgeResized = onLayoutChange.mock.calls.at(-1)?.[1];
    expect(edgeResized.width / edgeResized.height).toBeCloseTo(375 / 812);
  });
});

describe("CanvasPageItem visibility", () => {
  it("can change from hidden to visible without changing its Hook order", () => {
    const page = { id: "page-visibility", name: "可见性页面", order: 0 };
    const layout = { x: 0, y: 0, width: 375, height: 812 };
    const { rerender } = render(
      <CanvasPageItem
        page={page}
        layout={layout}
        editable
        visible={false}
        renderMode="loading"
        toolMode="select"
      />,
    );

    expect(() =>
      rerender(
        <CanvasPageItem
          page={page}
          layout={layout}
          editable
          visible
          renderMode="loading"
          toolMode="select"
        />,
      ),
    ).not.toThrow();
  });
});

describe("CanvasPageItem sandbox HTML preview", () => {
  it("画布中使用受控 sandbox execution iframe，而不是空的 React 代码预览", () => {
    const { container } = render(
      <CanvasPageItem
        page={{
          id: "sandbox-page",
          name: "交互页面",
          order: 0,
          runtimeType: "sandboxed-html",
          sandboxExecutionUrl: "https://sandbox.example/executions/ticket-1",
          sandboxChannelId: "channel-1",
          previewSize: { width: 375, height: 812 },
        }}
        layout={{ x: 0, y: 0, width: 375, height: 812 }}
        editable={false}
        renderMode="iframe"
      />,
    );

    const frame = container.querySelector(
      'iframe[data-sandbox-channel="channel-1"]',
    ) as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    expect(frame?.src).toContain("https://sandbox.example/executions/ticket-1");
    expect(frame?.getAttribute("sandbox")).toContain("allow-scripts");
  });
});

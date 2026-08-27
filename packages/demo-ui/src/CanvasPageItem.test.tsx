import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

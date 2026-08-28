import { fireEvent, render } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CanvasFreeNodeItem } from "./CanvasFreeNodeItem";

const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "setPointerCapture",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
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
});

const baseNode = {
  id: "node-1",
  title: "节点",
  layout: { x: 20, y: 30, width: 200, height: 120 },
  createdAt: 1,
  updatedAt: 1,
} as const;

describe("CanvasFreeNodeItem resize affordances", () => {
  it("gives document corners diagonal cursors while preserving edge resize cursors", () => {
    const onDragStart = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <CanvasFreeNodeItem
        node={{ ...baseNode, kind: "document" }}
        editable
        selected
        toolMode="select"
        onDragStart={onDragStart}
        onSelect={onSelect}
      />,
    );

    const northWest = container.querySelector('[data-canvas-resize-handle="nw"]') as HTMLElement;
    const north = container.querySelector('[data-canvas-resize-handle="n"]') as HTMLElement;
    const west = container.querySelector('[data-canvas-resize-handle="w"]') as HTMLElement;
    expect(northWest).toHaveStyle({ cursor: "nwse-resize" });
    expect(north).toHaveStyle({ cursor: "ns-resize" });
    expect(west).toHaveStyle({ cursor: "ew-resize" });

    fireEvent(
      northWest,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 30,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith("node-1", expect.anything());
    expect(onSelect.mock.calls[0]?.[1]?.button).toBe(0);
    expect(onDragStart).toHaveBeenCalledWith("node-1");
  });

  it("only shows corner resize handles for images", () => {
    const onLayoutChange = vi.fn();
    const { container } = render(
      <CanvasFreeNodeItem
        node={{ ...baseNode, kind: "image", src: "https://example.test/image.png", intrinsicWidth: 400, intrinsicHeight: 240 }}
        editable
        selected
        toolMode="select"
        onLayoutChange={onLayoutChange}
      />,
    );

    expect(container.querySelectorAll("[data-canvas-resize-handle]")).toHaveLength(4);
    expect(container.querySelector('[data-canvas-resize-handle="e"]')).toBeNull();

    const southEast = container.querySelector('[data-canvas-resize-handle="se"]') as HTMLElement;
    const node = container.querySelector('[data-canvas-node-id="node-1"]') as HTMLElement;
    fireEvent(southEast, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
    fireEvent(node, new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 10 }));

    const resized = onLayoutChange.mock.calls.at(-1)?.[1];
    expect(resized.width / resized.height).toBeCloseTo(400 / 240);
  });
});

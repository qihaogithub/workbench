import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PageNavigationOverlay } from "./PageNavigationOverlay";

function renderOverlay() {
  const onCreate = vi.fn();
  const onPendingTargetChange = vi.fn();
  const result = render(
    <div className="relative h-[100px] w-[100px]">
      <PageNavigationOverlay
        pageId="source"
        pages={[
          { id: "source", name: "来源页", order: 0 },
          { id: "target", name: "目标页", order: 1 },
        ]}
        enabled
        visible
        editable
        onCreate={onCreate}
        onPendingTargetChange={onPendingTargetChange}
      />
    </div>,
  );
  const overlay = screen.getByLabelText("绘制页面跳转热区");
  Object.defineProperty(overlay, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  });
  Object.defineProperty(overlay, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(overlay, "clientHeight", { configurable: true, value: 100 });
  Object.defineProperty(overlay, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(overlay, "releasePointerCapture", { configurable: true, value: vi.fn() });
  return { ...result, onCreate, onPendingTargetChange, overlay };
}

describe("PageNavigationOverlay", () => {
  it("turns a click into an invisible point anchor and opens the page menu", () => {
    const { onCreate, onPendingTargetChange, overlay } = renderOverlay();
    fireEvent(overlay, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
    fireEvent(overlay, new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 50, clientY: 50 }));

    expect(screen.getByText("跳转到页面")).toBeInTheDocument();
    expect(onPendingTargetChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "point" }));
    fireEvent.click(screen.getByRole("button", { name: "目标页" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ width: 0.002, height: 0.002 }), "target", "point");
  });

  it("keeps a drag as a visible area anchor", () => {
    const { onCreate, onPendingTargetChange, overlay } = renderOverlay();
    fireEvent(overlay, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    fireEvent(overlay, new MouseEvent("pointermove", { bubbles: true, button: 0, clientX: 80, clientY: 80 }));
    fireEvent(overlay, new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 80, clientY: 80 }));

    expect(onPendingTargetChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "area" }));
    fireEvent.click(screen.getByRole("button", { name: "目标页" }));
    const [rect, targetPageId, kind] = onCreate.mock.calls[0];
    expect(rect.width).toBeCloseTo(0.7);
    expect(rect.height).toBeCloseTo(0.7);
    expect(targetPageId).toBe("target");
    expect(kind).toBe("area");
  });
});

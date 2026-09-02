import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CanvasResizeHandles,
  detectCanvasResizeEdge,
} from "./CanvasResizeHandles";

describe("canvas resize interaction", () => {
  const allHandles = { handles: "all" as const, edgeHitSize: 8, cornerHitSize: 16 };
  const cornerHandles = { handles: "corners" as const, edgeHitSize: 8, cornerHitSize: 16 };

  it("gives corner zones priority over edge zones and recognizes all eight directions", () => {
    expect(detectCanvasResizeEdge(4, 4, 200, 120, allHandles)).toBe("nw");
    expect(detectCanvasResizeEdge(196, 4, 200, 120, allHandles)).toBe("ne");
    expect(detectCanvasResizeEdge(4, 116, 200, 120, allHandles)).toBe("sw");
    expect(detectCanvasResizeEdge(196, 116, 200, 120, allHandles)).toBe("se");
    expect(detectCanvasResizeEdge(100, 4, 200, 120, allHandles)).toBe("n");
    expect(detectCanvasResizeEdge(196, 60, 200, 120, allHandles)).toBe("e");
    expect(detectCanvasResizeEdge(100, 116, 200, 120, allHandles)).toBe("s");
    expect(detectCanvasResizeEdge(4, 60, 200, 120, allHandles)).toBe("w");
    expect(detectCanvasResizeEdge(100, 60, 200, 120, allHandles)).toBeNull();
  });

  it("only exposes and recognizes corners for proportional nodes", () => {
    expect(detectCanvasResizeEdge(100, 4, 200, 120, cornerHandles)).toBeNull();
    expect(detectCanvasResizeEdge(4, 4, 200, 120, cornerHandles)).toBe("nw");

    const { container } = render(<CanvasResizeHandles visible options={cornerHandles} />);
    expect(container.querySelectorAll("[data-canvas-resize-handle]")).toHaveLength(4);
    expect(container.querySelector('[data-canvas-resize-handle="nw"]')).toHaveStyle({ cursor: "nwse-resize" });
    expect(container.querySelector('[data-canvas-resize-handle="ne"]')).toHaveStyle({ cursor: "nesw-resize" });
  });

  it("keeps edge hit areas above page overlays", () => {
    const { container } = render(<CanvasResizeHandles visible options={allHandles} />);

    for (const edge of ["n", "s", "e", "w"]) {
      expect(
        container.querySelector(`[data-canvas-resize-handle="${edge}"]`),
      ).toHaveClass("z-50");
    }
  });
});

import { describe, expect, it } from "vitest";

import { computeAlignment } from "./canvas-geometry";
import type { CanvasPageLayout } from "./types";

describe("canvas drag performance baseline", () => {
  it("computes alignment against 500 canvas objects within one responsive frame budget", () => {
    const others: CanvasPageLayout[] = Array.from({ length: 500 }, (_, index) => ({
      x: (index % 25) * 180,
      y: Math.floor(index / 25) * 140,
      width: 140,
      height: 100,
    }));
    const moving = { x: 360, y: 280, width: 140, height: 100 };

    const startedAt = performance.now();
    const result = computeAlignment(moving, others);
    const duration = performance.now() - startedAt;

    expect(result.layout).toMatchObject(moving);
    // This is intentionally looser than the browser's 16ms frame target so
    // normal CI variance is tolerated while O(n²) regressions are caught.
    expect(duration).toBeLessThan(100);
  });
});

import { describe, expect, it } from "vitest";

import { chooseSafeOverlayPosition } from "./document-overlay-positioning";

const boundary = {
  top: 0,
  right: 400,
  bottom: 400,
  left: 0,
  width: 400,
  height: 400,
};

const reference = {
  top: 160,
  right: 220,
  bottom: 190,
  left: 120,
  width: 100,
  height: 30,
};

describe("editor overlay safe positioning", () => {
  it("uses the requested bottom-first order when it does not cover the selection", () => {
    const result = chooseSafeOverlayPosition({
      reference,
      floating: { width: 120, height: 40 },
      boundary,
      placements: ["bottom-start", "top-start", "right-start", "left-start"],
    });

    expect(result?.placement).toBe("bottom-start");
    expect(result?.rect.top).toBe(198);
    expect(result?.rect.left).toBe(120);
  });

  it("flips to the top when the bottom safe area is too small", () => {
    const result = chooseSafeOverlayPosition({
      reference: { ...reference, top: 360, bottom: 390 },
      floating: { width: 120, height: 40 },
      boundary,
      placements: ["bottom-start", "top-start", "right-start", "left-start"],
    });

    expect(result?.placement).toBe("top-start");
    expect(result?.rect.bottom).toBe(352);
  });

  it("tries side placements after both vertical placements fail", () => {
    const result = chooseSafeOverlayPosition({
      reference: {
        top: 180,
        right: 390,
        bottom: 220,
        left: 350,
        width: 40,
        height: 40,
      },
      floating: { width: 100, height: 80 },
      boundary,
      obstacles: [
        { top: 100, right: 390, bottom: 150, left: 350, width: 40, height: 50 },
        { top: 220, right: 390, bottom: 260, left: 350, width: 40, height: 40 },
      ],
      placements: ["bottom-start", "top-start", "right-start", "left-start"],
    });

    expect(result?.placement).toBe("left-start");
    expect(result?.rect.right).toBe(342);
  });

  it("returns null instead of covering the protected selection when no placement is safe", () => {
    const result = chooseSafeOverlayPosition({
      reference: {
        top: 170,
        right: 230,
        bottom: 230,
        left: 170,
        width: 60,
        height: 60,
      },
      floating: { width: 360, height: 360 },
      boundary,
      placements: ["bottom-start", "top-start", "right-start", "left-start"],
    });

    expect(result).toBeNull();
  });
});

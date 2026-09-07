import { describe, expect, it } from "vitest";

import {
  chooseSafeOverlayPosition,
  chooseSelectionToolbarPosition,
  getDocumentOverlayBoundary,
} from "./document-overlay-positioning";

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
  it("keeps a first-line selection toolbar below the selection when TopBar occupies the upper slot", () => {
    const position = chooseSelectionToolbarPosition({
      reference: {
        top: 374,
        bottom: 392,
        left: 482,
        right: 587,
        width: 105,
        height: 18,
      },
      floating: { width: 244, height: 40 },
      boundary: {
        top: 267,
        bottom: 700,
        left: 449,
        right: 808,
        width: 359,
        height: 433,
      },
      obstacles: [
        {
          top: 267,
          bottom: 364,
          left: 449,
          right: 808,
          width: 359,
          height: 97,
        },
      ],
      placements: ["top-start", "bottom-start"],
    });
    expect(position?.placement).toBe("bottom-start");
    expect(position?.top).toBe(400);
    expect(position?.rect.right).toBeLessThanOrEqual(800);
  });

  it("docks viewport-spanning selections below TopBar instead of silently hiding", () => {
    const position = chooseSelectionToolbarPosition({
      reference: { ...reference, top: 40, bottom: 390, height: 350 },
      floating: { width: 240, height: 40 },
      boundary,
      obstacles: [
        { top: 0, bottom: 60, left: 0, right: 400, width: 400, height: 60 },
      ],
      placements: ["top-start", "bottom-start"],
    });
    expect(position?.placement).toBe("docked");
    expect(position?.top).toBe(68);
  });
  it("uses the scrollport height for a short flowing document, retaining its own width", () => {
    expect(
      getDocumentOverlayBoundary(
        {
          top: 300,
          bottom: 450,
          left: 500,
          right: 900,
          width: 400,
          height: 150,
        },
        { x: 450, y: 80, width: 600, height: 700 },
        true,
      ),
    ).toEqual({
      top: 80,
      bottom: 780,
      left: 500,
      right: 900,
      width: 400,
      height: 700,
    });
  });

  it("clips internally scrolling editors to both their own rectangle and viewport", () => {
    expect(
      getDocumentOverlayBoundary(
        {
          top: 300,
          bottom: 950,
          left: 500,
          right: 900,
          width: 400,
          height: 650,
        },
        { x: 450, y: 80, width: 600, height: 700 },
        false,
      ),
    ).toEqual({
      top: 300,
      bottom: 780,
      left: 500,
      right: 900,
      width: 400,
      height: 480,
    });
  });
  it("shrinks a scrollable menu before rejecting a small visible viewport", () => {
    const result = chooseSafeOverlayPosition({
      reference,
      floating: { width: 304, height: 360 },
      boundary,
      placements: ["bottom-start", "top-start"],
      minimumSize: { width: 160, height: 96 },
    });
    expect(result?.rect.height).toBe(194);
    expect(result?.rect.bottom).toBe(392);
    expect(result?.rect.width).toBe(304);
  });

  it("uses the upper safe area when the menu would have no usable rows below", () => {
    const result = chooseSafeOverlayPosition({
      reference: { ...reference, top: 350, bottom: 380 },
      floating: { width: 304, height: 360 },
      boundary,
      placements: ["bottom-start", "top-start"],
      minimumSize: { width: 160, height: 96 },
    });
    expect(result?.placement).toBe("top-start");
    expect(result?.rect.bottom).toBe(342);
  });

  it("does not render an unusably small menu", () => {
    expect(
      chooseSafeOverlayPosition({
        reference,
        floating: { width: 304, height: 360 },
        boundary: { ...boundary, bottom: 220, height: 220 },
        placements: ["bottom-start"],
        minimumSize: { width: 160, height: 96 },
      }),
    ).toBeNull();
  });
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

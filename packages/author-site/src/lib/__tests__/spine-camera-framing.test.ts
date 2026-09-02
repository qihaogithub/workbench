import {
  calculateSpineCameraFrame,
  normalizeSpineAlignment,
  normalizeSpineFit,
} from "../spine-camera-framing";

describe("Spine camera framing", () => {
  const bounds = { x: 10, y: 20, width: 100, height: 50 };

  it("uses contain to keep the full bounds visible and center them", () => {
    expect(
      calculateSpineCameraFrame(bounds, { width: 200, height: 200 }, "contain", "center"),
    ).toEqual({ x: 60, y: 45, zoom: 0.5 });
  });

  it("uses cover to fill the viewport while preserving the requested alignment", () => {
    expect(
      calculateSpineCameraFrame(bounds, { width: 200, height: 200 }, "cover", "top-left"),
    ).toEqual({ x: 35, y: 45, zoom: 0.25 });
  });

  it.each([
    ["left", 110],
    ["center", 60],
    ["right", 10],
  ] as const)("maps %s alignment to the horizontal camera edge", (alignment, x) => {
    expect(
      calculateSpineCameraFrame(bounds, { width: 200, height: 50 }, "contain", alignment),
    ).toMatchObject({ x, y: 45, zoom: 1 });
  });

  it.each([
    ["top", -30],
    ["center", 45],
    ["bottom", 120],
  ] as const)("maps %s alignment to the vertical camera edge", (alignment, y) => {
    expect(
      calculateSpineCameraFrame(bounds, { width: 100, height: 200 }, "contain", alignment),
    ).toMatchObject({ x: 60, y, zoom: 1 });
  });

  it("preserves the existing camera for fit=none", () => {
    expect(
      calculateSpineCameraFrame(bounds, { width: 200, height: 200 }, "none", "bottom-right", {
        x: 7,
        y: 8,
        zoom: 1.5,
      }),
    ).toEqual({ x: 7, y: 8, zoom: 1.5 });
  });

  it("rejects zero-size and non-finite bounds without producing invalid camera values", () => {
    expect(calculateSpineCameraFrame({ ...bounds, width: 0 }, { width: 200, height: 200 })).toBeNull();
    expect(calculateSpineCameraFrame({ ...bounds, height: Number.NaN }, { width: 200, height: 200 })).toBeNull();
    expect(calculateSpineCameraFrame(bounds, { width: 0, height: 200 })).toBeNull();
  });

  it("normalizes unknown public values to the safe defaults", () => {
    expect(normalizeSpineFit("unexpected")).toBe("contain");
    expect(normalizeSpineAlignment("unexpected")).toBe("center");
  });
});

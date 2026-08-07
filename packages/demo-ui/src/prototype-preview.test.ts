import { describe, it, expect } from "vitest";
import { normalizePrototypeViewportUnits } from "@workbench/shared";

describe("normalizePrototypeViewportUnits", () => {
  const W = 1920;
  const H = 1080;

  it("把 vw / vh 归一化为设计尺寸 px", () => {
    expect(normalizePrototypeViewportUnits("width: 100vw", W, H)).toBe(
      "width: 1920px",
    );
    expect(normalizePrototypeViewportUnits("height: 100vh", W, H)).toBe(
      "height: 1080px",
    );
  });

  it("把 vmin / vmax 归一化为较小 / 较大设计尺寸", () => {
    expect(normalizePrototypeViewportUnits("width: 50vmin", W, H)).toBe(
      "width: 540px",
    );
    expect(normalizePrototypeViewportUnits("width: 50vmax", W, H)).toBe(
      "width: 960px",
    );
  });

  it("把小/大/动态视口单位 svh/dvh/lvh 归一化为 designHeight", () => {
    expect(normalizePrototypeViewportUnits("height: 100svh", W, H)).toBe(
      "height: 1080px",
    );
    expect(normalizePrototypeViewportUnits("height: 100dvh", W, H)).toBe(
      "height: 1080px",
    );
    expect(normalizePrototypeViewportUnits("height: 50lvh", W, H)).toBe(
      "height: 540px",
    );
  });

  it("把小/大/动态视口宽度单位 svw/dvw/lvw 归一化为 designWidth", () => {
    expect(normalizePrototypeViewportUnits("width: 100svw", W, H)).toBe(
      "width: 1920px",
    );
    expect(normalizePrototypeViewportUnits("width: 100dvw", W, H)).toBe(
      "width: 1920px",
    );
    expect(normalizePrototypeViewportUnits("width: 50lvw", W, H)).toBe(
      "width: 960px",
    );
  });

  it("保留非视口单位与数值", () => {
    expect(
      normalizePrototypeViewportUnits("height: 200px; margin: 1em", W, H),
    ).toBe("height: 200px; margin: 1em");
  });

  it("skipVh 时跳过 vh 族但保留 vw", () => {
    expect(
      normalizePrototypeViewportUnits("width: 100vw; height: 100vh", W, H, true),
    ).toBe("width: 1920px; height: 100vh");
    expect(
      normalizePrototypeViewportUnits("height: 100dvh", W, H, true),
    ).toBe("height: 100dvh");
  });

  it("min-h-screen 等价写法（100vh）被归一化", () => {
    expect(normalizePrototypeViewportUnits("min-height: 100vh", W, H)).toBe(
      "min-height: 1080px",
    );
  });
});
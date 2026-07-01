import {
  getCanvasPreviewSizeKey,
  normalizeCanvasPageLayout,
  normalizeCanvasPageLayouts,
  resolveCanvasContentHeightLayout,
} from "@opencode-workbench/demo-ui";
import type {
  CanvasPageData,
  CanvasPageLayout,
} from "@opencode-workbench/demo-ui";

function makePage(id = "page_1"): CanvasPageData {
  return {
    id,
    name: id,
    order: 0,
    previewSize: { width: 1133, height: 749 },
  };
}

describe("canvas layout normalization", () => {
  it("历史手机旧尺寸遇到当前 previewSize 时重置尺寸并保留位置", () => {
    const page = makePage("phone");
    const layout = normalizeCanvasPageLayout(page, {
      x: 12,
      y: 34,
      width: 375,
      height: 812,
      zIndex: 7,
    });

    expect(layout).toEqual({
      x: 12,
      y: 34,
      width: 1133,
      height: 749,
      zIndex: 7,
      sizeMode: "preview",
      previewSizeKey: "1133x749",
    });
  });

  it("历史平板放大尺寸遇到当前 previewSize 时重置尺寸并保留位置", () => {
    const page = makePage("tablet");
    const layout = normalizeCanvasPageLayouts([page], {
      tablet: {
        x: 418.64774680071815,
        y: -9.204505835986042,
        width: 1242.2225702432206,
        height: 821.2045058359861,
      },
    });

    expect(layout.tablet).toMatchObject({
      x: 418.64774680071815,
      y: -9.204505835986042,
      width: 1133,
      height: 749,
      sizeMode: "preview",
      previewSizeKey: "1133x749",
    });
  });

  it("当前 previewSize 下的手动 custom 尺寸不会被重置", () => {
    const page = makePage("custom");
    const customLayout: CanvasPageLayout = {
      x: 20,
      y: 30,
      width: 900,
      height: 595,
      sizeMode: "custom",
      previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
    };

    expect(normalizeCanvasPageLayout(page, customLayout)).toBe(customLayout);
  });

  it("内容高度上报不会用过期 layout.width 放大错误高度", () => {
    const page = makePage("content");
    const staleLayout: CanvasPageLayout = {
      x: 0,
      y: 0,
      width: 1242.2225702432206,
      height: 821.2045058359861,
    };

    expect(
      resolveCanvasContentHeightLayout(page, staleLayout, 749, 1133),
    ).toBeNull();

    expect(
      resolveCanvasContentHeightLayout(page, staleLayout, 900, 1133),
    ).toEqual({
      x: 0,
      y: 0,
      width: 1133,
      height: 900,
      sizeMode: "preview",
      previewSizeKey: "1133x749",
    });
  });
});

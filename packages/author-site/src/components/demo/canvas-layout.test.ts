import {
  getCanvasPreviewSizeKey,
  normalizeCanvasPageLayout,
  normalizeCanvasPageLayouts,
  resolveCanvasContentHeightLayout,
} from "@workbench/demo-ui";
import type {
  CanvasPageData,
  CanvasPageLayout,
} from "@workbench/demo-ui";

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

    // 内容高度等于设计高度时，将过期尺寸归一化回设计尺寸（而非用过期宽度放大）
    expect(
      resolveCanvasContentHeightLayout(page, staleLayout, 749, 1133),
    ).toEqual({
      x: 0,
      y: 0,
      width: 1133,
      height: 749,
      sizeMode: "preview",
      previewSizeKey: "1133x749",
    });

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

  it("内容高度小于设计高度时布局收缩到内容高度", () => {
    const page = makePage("short");
    const layout: CanvasPageLayout = {
      x: 0,
      y: 0,
      width: 1133,
      height: 749,
      sizeMode: "preview",
      previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
    };

    expect(resolveCanvasContentHeightLayout(page, layout, 500, 1133)).toEqual({
      x: 0,
      y: 0,
      width: 1133,
      height: 500,
      sizeMode: "preview",
      previewSizeKey: "1133x749",
    });
  });

  it("内容高度等于设计高度且布局已正确时不产生空更新", () => {
    const page = makePage("exact");
    const layout: CanvasPageLayout = {
      x: 0,
      y: 0,
      width: 1133,
      height: 749,
      sizeMode: "preview",
      previewSizeKey: getCanvasPreviewSizeKey(page.previewSize),
    };

    expect(
      resolveCanvasContentHeightLayout(page, layout, 749, 1133),
    ).toBeNull();
  });

  it("删除页面后：未固化的页面会随索引变化漂移", () => {
    const pages = [makePage("a"), makePage("b"), makePage("c")];
    // 没有任何显式布局，全部依赖索引兜底
    const before = normalizeCanvasPageLayouts(pages, {});

    // 删除中间页后，c 的索引从 2 变为 1，位置随之变化
    const afterDelete = normalizeCanvasPageLayouts(
      [makePage("a"), makePage("c")],
      {},
    );
    const cBefore = before.c;
    const cAfter = afterDelete.c;
    expect(cBefore?.x).not.toBe(cAfter?.x);
  });

  it("删除页面前固化剩余页面的有效位置，删除后位置保持不变", () => {
    const pages = [makePage("a"), makePage("b"), makePage("c")];
    // 固化前：部分页面没有显式布局，落在索引兜底上
    const frozen = normalizeCanvasPageLayouts(pages, {
      a: { x: 100, y: 200, width: 1133, height: 749, zIndex: 0 },
    });

    // 删除 b 后，以固化后的布局为准，c 的位置不再漂移
    const afterDelete = normalizeCanvasPageLayouts(
      [makePage("a"), makePage("c")],
      { a: frozen.a, c: frozen.c },
    );
    expect(afterDelete.a).toMatchObject({ x: 100, y: 200 });
    expect(afterDelete.c).toMatchObject({
      x: frozen.c?.x,
      y: frozen.c?.y,
    });
  });
});

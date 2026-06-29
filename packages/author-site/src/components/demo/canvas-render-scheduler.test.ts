import {
  computeCanvasRenderModes,
  computePreviewRuntimePoolPlan,
  type CanvasPageData,
  type CanvasPageLayout,
} from "@opencode-workbench/demo-ui";

function makePage(id: string): CanvasPageData {
  return { id, name: id, order: 0 };
}

function makeLayout(index: number): CanvasPageLayout {
  return { x: index * 120, y: 0, width: 100, height: 100 };
}

describe("computeCanvasRenderModes", () => {
  it("少于 6 页时忽略截图和 iframe 预算，所有页面使用 iframe", () => {
    const pages = Array.from({ length: 5 }, (_, index) =>
      makePage(`page_${index}`),
    );
    const layouts = Object.fromEntries(
      pages.map((page, index) => [page.id, makeLayout(index)]),
    );
    const visiblePageIds = new Set(pages.map((page) => page.id));

    const result = computeCanvasRenderModes({
      pages,
      layouts,
      visiblePageIds,
      viewport: { x: 0, y: 0, zoom: 1 },
      containerWidth: 220,
      containerHeight: 200,
      screenshotUrls: { page_2: "/shot-2.png", page_3: "/shot-3.png" },
      recentIframeAccess: new Map(),
      maxActiveIframes: 2,
      maxSleepingIframes: 2,
    });

    expect(result.modes).toEqual({
      page_0: "iframe",
      page_1: "iframe",
      page_2: "iframe",
      page_3: "iframe",
      page_4: "iframe",
    });
    expect(result.activePageIds).toEqual([
      "page_0",
      "page_1",
      "page_2",
      "page_3",
      "page_4",
    ]);
    expect(result.sleepingPageIds).toEqual([]);
  });

  it("6 页及以上时选中页始终 active，截图页保持 screenshot", () => {
    const pages = Array.from({ length: 6 }, (_, index) =>
      makePage(`page_${index + 1}`),
    );
    const layouts = Object.fromEntries(
      pages.map((page, index) => [page.id, makeLayout(index)]),
    );
    const visiblePageIds = new Set(pages.map((page) => page.id));

    const result = computeCanvasRenderModes({
      pages,
      layouts,
      visiblePageIds,
      viewport: { x: 0, y: 0, zoom: 1 },
      containerWidth: 500,
      containerHeight: 500,
      editingPageId: "page_2",
      screenshotUrls: { page_2: "/shot-2.png", page_3: "/shot-3.png" },
      recentIframeAccess: new Map(),
      maxActiveIframes: 2,
      maxSleepingIframes: 2,
    });

    expect(result.modes.page_2).toBe("iframe");
    expect(result.modes.page_3).toBe("screenshot");
    expect(result.activePageIds).toContain("page_2");
  });

  it("超出 active 上限后，最近 active 的候选页进入 sleeping", () => {
    const pages = Array.from({ length: 6 }, (_, index) =>
      makePage(`page_${index}`),
    );
    const layouts = Object.fromEntries(
      pages.map((page, index) => [page.id, makeLayout(index)]),
    );
    const visiblePageIds = new Set(pages.map((page) => page.id));

    const result = computeCanvasRenderModes({
      pages,
      layouts,
      visiblePageIds,
      viewport: { x: 0, y: 0, zoom: 1 },
      containerWidth: 220,
      containerHeight: 200,
      recentIframeAccess: new Map([
        ["page_3", 300],
        ["page_4", 400],
      ]),
      maxActiveIframes: 2,
      maxSleepingIframes: 1,
    });

    expect(result.activePageIds).toHaveLength(2);
    expect(result.sleepingPageIds).toEqual(["page_4"]);
    expect(result.modes.page_4).toBe("sleeping-iframe");
    expect(result.modes.page_3).toBe("loading");
  });

  it("6 页及以上时离屏页不保留 iframe", () => {
    const pages = Array.from({ length: 6 }, (_, index) =>
      makePage(`page_${index + 1}`),
    );
    const layouts = {
      page_1: { x: 0, y: 0, width: 100, height: 100 },
      page_2: { x: 1000, y: 1000, width: 100, height: 100 },
      page_3: { x: 1120, y: 1000, width: 100, height: 100 },
      page_4: { x: 1240, y: 1000, width: 100, height: 100 },
      page_5: { x: 1360, y: 1000, width: 100, height: 100 },
      page_6: { x: 1480, y: 1000, width: 100, height: 100 },
    };

    const result = computeCanvasRenderModes({
      pages,
      layouts,
      visiblePageIds: new Set(["page_1"]),
      viewport: { x: 0, y: 0, zoom: 1 },
      containerWidth: 200,
      containerHeight: 200,
      recentIframeAccess: new Map([["page_2", 999]]),
      maxActiveIframes: 1,
      maxSleepingIframes: 1,
    });

    expect(result.modes.page_1).toBe("iframe");
    expect(result.modes.page_2).toBe("loading");
  });

  it("PreviewRuntimePool 统一返回 active 与 sleeping 的保留集合", () => {
    const pages = Array.from({ length: 6 }, (_, index) =>
      makePage(`page_${index}`),
    );
    const layouts = Object.fromEntries(
      pages.map((page, index) => [page.id, makeLayout(index)]),
    );

    const result = computePreviewRuntimePoolPlan({
      pages,
      layouts,
      visiblePageIds: new Set(pages.map((page) => page.id)),
      viewport: { x: 0, y: 0, zoom: 1 },
      containerWidth: 220,
      containerHeight: 200,
      recentRuntimeAccess: new Map([
        ["page_3", 300],
        ["page_4", 400],
      ]),
      maxActiveRuntimes: 2,
      maxSleepingRuntimes: 1,
    });

    expect(result.activePageIds).toHaveLength(2);
    expect(result.sleepingPageIds).toEqual(["page_4"]);
    expect(result.retainedRuntimePageIds).toEqual([
      ...result.activePageIds,
      "page_4",
    ]);
  });
});

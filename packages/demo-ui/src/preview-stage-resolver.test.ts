import { describe, expect, it } from "vitest";

import {
  normalizePreviewStagePages,
  resolvePagePreviewRenderer,
  resolvePreviewStageSize,
} from "./preview-stage-resolver";
import type { PreviewStagePage } from "./preview-stage-types";

function createPage(
  overrides: Partial<PreviewStagePage> = {},
): PreviewStagePage {
  return {
    id: "page-1",
    name: "页面一",
    order: 0,
    runtimeType: "high-fidelity-react",
    ...overrides,
  };
}

describe("preview stage resolver", () => {
  it("按 schema、页面尺寸、原型元数据、fallback 的顺序解析尺寸", () => {
    const page = createPage({
      schema: JSON.stringify({
        $demo: { previewSize: { width: 1200, height: 800 } },
      }),
      previewSize: { width: 900, height: 600 },
      prototypeMeta: { previewSize: { width: 375, height: 812 } },
      fallbackPreviewSize: { width: 320, height: 568 },
    });
    expect(resolvePreviewStageSize(page)).toEqual({
      width: 1200,
      height: 800,
    });

    expect(resolvePreviewStageSize({ ...page, schema: undefined })).toEqual({
      width: 900,
      height: 600,
    });
    expect(
      resolvePreviewStageSize({
        ...page,
        schema: undefined,
        previewSize: undefined,
      }),
    ).toEqual({ width: 375, height: 812 });
    expect(
      resolvePreviewStageSize({
        ...page,
        schema: undefined,
        previewSize: undefined,
        prototypeMeta: undefined,
      }),
    ).toEqual({ width: 320, height: 568 });
  });

  it("统一 renderer 选择优先级", () => {
    expect(
      resolvePagePreviewRenderer(
        createPage({
          iframeUrl: "/published.html",
          compiledJsUrl: "/compiled.js",
          code: "export default function Page() {}",
        }),
      ),
    ).toBe("published-iframe");
    expect(
      resolvePagePreviewRenderer(
        createPage({ runtimeType: "prototype-html-css" }),
      ),
    ).toBe("prototype");
    expect(
      resolvePagePreviewRenderer(
        createPage({ runtimeType: "sketch-scene" }),
      ),
    ).toBe("sketch");
    expect(
      resolvePagePreviewRenderer(
        createPage({ compiledJsUrl: "/compiled.js" }),
      ),
    ).toBe("compiled-module");
    expect(
      resolvePagePreviewRenderer(
        createPage({ code: "export default function Page() {}" }),
      ),
    ).toBe("authoring-code");
    expect(resolvePagePreviewRenderer(createPage())).toBe("empty");
  });

  it("规范化页面列表并复用未变化的引用", () => {
    const stablePage = createPage({ previewSize: { width: 800, height: 600 } });
    const stablePages = [stablePage];
    expect(normalizePreviewStagePages(stablePages)).toBe(stablePages);

    const unresolvedPage = createPage({
      schema: JSON.stringify({
        $demo: { previewSize: { width: 1024, height: 768 } },
      }),
    });
    const unresolvedPages = [unresolvedPage];
    const normalized = normalizePreviewStagePages(unresolvedPages);
    expect(normalized).not.toBe(unresolvedPages);
    expect(normalized[0]).not.toBe(unresolvedPage);
    expect(normalized[0]?.previewSize).toEqual({
      width: 1024,
      height: 768,
    });
  });
});

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
  it("只按 presentation 或 schema 投影解析尺寸，忽略历史 previewSize", () => {
    const page = createPage({
      schema: JSON.stringify({
        $demo: { presentation: { version: 1, mode: "responsive-page", viewport: { width: 1200, height: 800 }, heightBehavior: "content", preset: "custom", source: "user" } },
      }),
      previewSize: { width: 900, height: 600 },
      prototypeMeta: { previewSize: { width: 375, height: 812 } },
    });
    expect(resolvePreviewStageSize(page)).toEqual({
      width: 1200,
      height: 800,
    });

    expect(resolvePreviewStageSize({ ...page, schema: undefined })).toBeUndefined();
  });

  it("统一 renderer 选择优先级", () => {
    expect(
      resolvePagePreviewRenderer(
        createPage({
          runtimeType: "sandboxed-html" as PreviewStagePage["runtimeType"],
          iframeUrl: "/should-not-be-used.html",
          sandboxExecutionUrl: "/controlled/execution/opaque-id",
        }),
      ),
    ).toBe("sandbox-html");
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

  it("未知 runtime 不会落入可信 renderer", () => {
    expect(
      resolvePagePreviewRenderer(
        createPage({
          runtimeType: "future-runtime" as PreviewStagePage["runtimeType"],
          iframeUrl: "/published.html",
          compiledJsUrl: "/compiled.js",
          code: "export default 1",
        }),
      ),
    ).toBe("empty");
  });

  it("规范化页面列表并复用未变化的引用", () => {
    const stablePage = createPage({
      presentation: {
        version: 1,
        mode: "responsive-page",
        viewport: { width: 800, height: 600 },
        heightBehavior: "content",
        preset: "custom",
        source: "user",
      },
      previewSize: { width: 800, height: 600 },
    });
    const stablePages = [stablePage];
    expect(normalizePreviewStagePages(stablePages)).toBe(stablePages);

    const unresolvedPage = createPage({
      schema: JSON.stringify({
        $demo: { presentation: { version: 1, mode: "responsive-page", viewport: { width: 1024, height: 768 }, heightBehavior: "content", preset: "custom", source: "user" } },
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

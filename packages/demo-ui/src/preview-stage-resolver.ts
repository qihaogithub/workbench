import { getPrototypePreviewSize } from "./prototype-preview-size";
import type { PreviewStagePage } from "./preview-stage-types";
import type { PreviewSize } from "./types";
import { getPreviewSize } from "./validator";

export type PagePreviewRendererKind =
  | "published-iframe"
  | "prototype"
  | "sketch"
  | "compiled-module"
  | "authoring-code"
  | "empty";

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolvePreviewStageSize(
  page: PreviewStagePage,
): PreviewSize | undefined {
  return (
    (page.schema ? getPreviewSize(page.schema) : undefined) ??
    page.previewSize ??
    getPrototypePreviewSize(page.prototypeMeta) ??
    page.fallbackPreviewSize
  );
}

export function normalizePreviewStagePage(
  page: PreviewStagePage,
): PreviewStagePage {
  const previewSize = resolvePreviewStageSize(page);
  if (previewSize === page.previewSize) return page;
  return { ...page, previewSize };
}

export function normalizePreviewStagePages(
  pages: PreviewStagePage[],
): PreviewStagePage[] {
  let changed = false;
  const normalized = pages.map((page) => {
    const next = normalizePreviewStagePage(page);
    if (next !== page) changed = true;
    return next;
  });
  return changed ? normalized : pages;
}

export function resolvePagePreviewRenderer(
  page: PreviewStagePage,
): PagePreviewRendererKind {
  if (hasText(page.iframeUrl)) return "published-iframe";
  if (page.runtimeType === "prototype-html-css") return "prototype";
  if (page.runtimeType === "sketch-scene") return "sketch";
  if (hasText(page.compiledJsUrl)) return "compiled-module";
  if (hasText(page.code)) return "authoring-code";
  return "empty";
}


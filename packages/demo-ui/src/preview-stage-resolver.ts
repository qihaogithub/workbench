import { getPageRuntimeCapabilities, resolvePagePresentation } from "@workbench/shared";
import type { PreviewStagePage } from "./preview-stage-types";
import type { PreviewSize } from "./types";

export type PagePreviewRendererKind =
  | "sandbox-html"
  | "published-iframe"
  | "prototype"
  | "sketch"
  | "compiled-module"
  | "authoring-code"
  | "empty";

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasSamePreviewSize(
  current: PreviewSize | undefined,
  next: PreviewSize | undefined,
): boolean {
  return current?.width === next?.width && current?.height === next?.height;
}

export function resolvePreviewStageSize(
  page: PreviewStagePage,
): PreviewSize | undefined {
  const presentation = page.presentation ??
    (page.schema ? resolvePagePresentation(page.schema) : undefined);
  // 页面展示尺寸的唯一持久化来源是 config.schema.json.$demo.presentation。
  // Canvas 几何、历史 previewSize 或调用方临时值都不能参与单页预览解析，
  // 否则会把不同页面的旧尺寸带入渲染分支，掩盖缺失的页面协议。
  return presentation?.viewport;
}

export function normalizePreviewStagePage(
  page: PreviewStagePage,
): PreviewStagePage {
  const previewSize = resolvePreviewStageSize(page);
  if (hasSamePreviewSize(previewSize, page.previewSize)) return page;
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
  const runtimeType = page.runtimeType as string | undefined;
  let runtimeRenderer: "prototype" | "sandbox-html" | "react-module" | "sketch" | undefined;
  if (runtimeType !== undefined) {
    try {
      runtimeRenderer = getPageRuntimeCapabilities(runtimeType).previewRenderer;
    } catch {
      return "empty";
    }
  }
  // Runtime is the persisted authority. Never let an accidental iframe URL
  // upgrade an interactive page to the trusted/published renderer.
  if (runtimeRenderer === "sandbox-html") return "sandbox-html";
  if (hasText(page.iframeUrl)) return "published-iframe";
  if (page.runtimeType === "prototype-html-css") return "prototype";
  if (page.runtimeType === "sketch-scene") return "sketch";
  if (hasText(page.compiledJsUrl)) return "compiled-module";
  if (hasText(page.code)) return "authoring-code";
  return "empty";
}

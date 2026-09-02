import type { PreviewStagePage } from "@workbench/demo-ui";
import {
  createPagePresentationProfile,
  isValidPagePresentationViewport,
  resolvePagePresentation,
} from "@workbench/shared";
import type { PagePresentationProfile } from "@workbench/shared";

import {
  DATA_BASE,
  getCompiledJsUrl,
  getPublishedFileUrl,
  type PublishedDemoPage,
  type PublishedHtmlExecution,
} from "./api";

interface CreatePublishedPreviewStagePageInput {
  projectId: string;
  page: PublishedDemoPage;
  configData?: Record<string, unknown>;
  schema?: string;
  sandboxExecution?: PublishedHtmlExecution;
  visibilityStatus?: PreviewStagePage["visibilityStatus"];
  visibilityRegions?: PreviewStagePage["visibilityRegions"];
}

function parseLegacyPreviewDimension(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value.replace(/px$/, ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Published packages created before the presentation protocol only carry
 * previewSize. Migrate that value at the viewer boundary so those packages do
 * not silently render with the 375x812 mobile default. New presentation data
 * always wins and remains the canonical value.
 */
function resolvePublishedPresentation(
  page: PublishedDemoPage,
  schema?: string,
): PagePresentationProfile | undefined {
  const canonical =
    page.presentation ?? (schema ? resolvePagePresentation(schema) : undefined);
  if (canonical) return canonical;

  const width = parseLegacyPreviewDimension(page.previewSize?.width);
  const height = parseLegacyPreviewDimension(page.previewSize?.height);
  if (width === undefined || height === undefined) return undefined;
  const viewport = { width, height };
  if (!isValidPagePresentationViewport(viewport)) return undefined;

  return createPagePresentationProfile({
    mode: "responsive-page",
    viewport,
    heightBehavior: "content",
    source: "user",
  });
}

/**
 * Published prototype HTML is rendered inside the viewer origin. In local
 * development the published data is served by author-site (4200), while the
 * viewer itself runs on 4300, so absolute /data URLs in the HTML must use the
 * configured data origin too. Docker keeps DATA_BASE empty and remains same-origin.
 */
export function resolvePrototypeDataUrls(
  value?: string,
  dataBase: string = DATA_BASE,
): string | undefined {
  if (!value || !dataBase) return value;
  const dataOrigin = dataBase.replace(/\/$/, "");
  return value
    .replace(/(\b(?:src|href|poster)\s*=\s*["'])\/data\//gi, `$1${dataOrigin}/data/`)
    .replace(/(url\(\s*["']?)\/data\//gi, `$1${dataOrigin}/data/`);
}

export function createPublishedPreviewStagePage({
  projectId,
  page,
  configData,
  schema,
  sandboxExecution,
  visibilityStatus,
  visibilityRegions,
}: CreatePublishedPreviewStagePageInput): PreviewStagePage {
  const runtimeType = page.runtimeType ?? "high-fidelity-react";
  const presentation = resolvePublishedPresentation(page, schema);
  const runtimeData =
    runtimeType === "prototype-html-css"
      ? {
          prototypeHtml: resolvePrototypeDataUrls(page.prototypeHtml),
          prototypeCss: resolvePrototypeDataUrls(page.prototypeCss),
          prototypeMeta: page.prototypeMeta,
        }
      : runtimeType === "sandboxed-html"
        ? {
            sandboxExecutionUrl: sandboxExecution?.executionUrl,
            sandboxChannelId: sandboxExecution?.channelId,
          }
      : runtimeType === "sketch-scene"
        ? {
            sketchScene: page.sketchScene
              ? JSON.stringify(page.sketchScene)
              : undefined,
            sketchMeta: page.sketchMeta,
          }
        : {
            compiledJsUrl: page.compiledJsPath
              ? getCompiledJsUrl(projectId, page.compiledJsPath)
              : undefined,
            iframeUrl: page.iframeHtmlPath
              ? getPublishedFileUrl(projectId, page.iframeHtmlPath)
              : undefined,
          };

  return {
    id: page.id,
    name: page.name,
    order: page.order,
    runtimeType,
    ...runtimeData,
    configData,
    schema,
    presentation,
    previewSize: presentation?.viewport,
    visibilityStatus,
    visibilityRegions,
  };
}

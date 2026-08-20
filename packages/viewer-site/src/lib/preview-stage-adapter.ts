import type { PreviewStagePage } from "@workbench/demo-ui";

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
}: CreatePublishedPreviewStagePageInput): PreviewStagePage {
  const runtimeType = page.runtimeType ?? "high-fidelity-react";
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
    previewSize: page.previewSize,
  };
}

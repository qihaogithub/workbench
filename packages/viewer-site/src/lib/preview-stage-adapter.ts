import type { PreviewStagePage } from "@workbench/demo-ui";

import {
  getCompiledJsUrl,
  getPublishedFileUrl,
  type PublishedDemoPage,
} from "./api";

interface CreatePublishedPreviewStagePageInput {
  projectId: string;
  page: PublishedDemoPage;
  configData?: Record<string, unknown>;
  schema?: string;
}

export function createPublishedPreviewStagePage({
  projectId,
  page,
  configData,
  schema,
}: CreatePublishedPreviewStagePageInput): PreviewStagePage {
  const runtimeType = page.runtimeType ?? "high-fidelity-react";
  const runtimeData =
    runtimeType === "prototype-html-css"
      ? {
          prototypeHtml: page.prototypeHtml,
          prototypeCss: page.prototypeCss,
          prototypeMeta: page.prototypeMeta,
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

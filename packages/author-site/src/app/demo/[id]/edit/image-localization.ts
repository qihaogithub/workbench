"use client";

import type { VisualNodeInfo } from "@workbench/demo-ui";

export interface LocalizedImageAsset {
  assetId: string;
  contentHash: string;
  workspacePath: string;
  relativePathFromPage: string;
  editPreviewUrl: string;
  mimeType: string;
  size: number;
  sourceType: "browser_blob" | "remote_url";
  originalUrl?: string;
}

type LocalizedImageResponse =
  | { success: true; data: LocalizedImageAsset }
  | { success: false; error?: { message?: string; details?: unknown } };

export interface SelectedImageSource {
  src: string;
  currentSrc: string;
  url: string;
}

export function getSelectedImageSource(
  node: VisualNodeInfo | null,
): SelectedImageSource | null {
  const src = node?.attrs?.src ?? "";
  const currentSrc = node?.attrs?.currentSrc ?? src;
  const url = currentSrc || src;
  if (!url) return null;
  return { src, currentSrc, url };
}

export function isProjectLocalImageReference(value: string): boolean {
  return (
    value.startsWith("../../assets/") ||
    value.startsWith("../assets/") ||
    value.startsWith("/api/sessions/")
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("读取图片失败"));
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

export async function readBrowserImageBlob(url: string): Promise<{
  dataBase64: string;
  mimeType: string;
} | null> {
  if (!url || url.startsWith("data:")) return null;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片读取失败：HTTP ${response.status}`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("当前资源不是图片");
  }
  return {
    dataBase64: await blobToBase64(blob),
    mimeType: blob.type,
  };
}

export async function localizeSelectedImageAsset(params: {
  sessionId: string;
  selectedNode: VisualNodeInfo;
  pageId?: string;
  runtimeType?: string;
}): Promise<LocalizedImageAsset> {
  const source = getSelectedImageSource(params.selectedNode);
  if (!source) {
    throw new Error("当前元素没有可本地化的图片地址");
  }

  let browserBlob: { dataBase64: string; mimeType: string } | null = null;
  let browserReadError: string | undefined;

  try {
    browserBlob = await readBrowserImageBlob(source.url);
  } catch (error) {
    browserReadError = error instanceof Error ? error.message : "浏览器无法读取当前图片";
  }

  const response = await fetch(`/api/sessions/${params.sessionId}/assets/localize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId: params.pageId,
      runtimeType: params.runtimeType,
      source: {
        kind: "selected-image",
        src: source.src,
        currentSrc: source.currentSrc,
        owId: params.selectedNode.nodeId,
        domPath: params.selectedNode.domPath,
      },
      browserBlob,
      browserReadError,
    }),
  });
  const payload = (await response.json()) as LocalizedImageResponse;
  if (!response.ok || !payload.success) {
    throw new Error(
      payload.success
        ? "图片本地化失败"
        : payload.error?.message || "无法本地化当前图片，需要上传原图",
    );
  }
  return payload.data;
}

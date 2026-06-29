import type { CanvasPageData, PreviewSize } from "./types";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;
const STRING_LITERAL_RE = /["'`]([^"'`]+)["'`]/g;
const MAX_RESOURCE_CACHE_SIZE = 80;
const PREWARM_CONCURRENCY = 4;

type CacheStatus = "loading" | "loaded" | "failed";

interface ResourceCacheEntry {
  status: CacheStatus;
  lastUsed: number;
  promise?: Promise<void>;
}

interface PreviewResourceInput {
  pageId?: string;
  code?: string;
  configData?: Record<string, unknown>;
  previewSize?: PreviewSize;
  sessionId?: string;
  demoId?: string;
  origin?: string;
}

const resourceCache = new Map<string, ResourceCacheEntry>();
const pendingQueue: Array<() => void> = [];
let activePrewarmCount = 0;

function now() {
  return Date.now();
}

function getBrowserOrigin(origin?: string): string {
  if (origin) return origin;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

function getCodeFingerprint(code?: string): string {
  if (!code) return "no-code";
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) | 0;
  }
  return `${code.length}:${hash.toString(36)}`;
}

function getPreviewSizeFingerprint(previewSize?: PreviewSize): string {
  if (!previewSize) return "default-size";
  return JSON.stringify({
    width: previewSize.width ?? null,
    height: previewSize.height ?? null,
    minHeight: previewSize.minHeight ?? null,
    maxHeight: previewSize.maxHeight ?? null,
    scale: previewSize.scale ?? null,
  });
}

export function resolvePreviewRelativePath(
  relativePath: string,
  basePath: string,
): string {
  const parts = basePath.split("/").filter((part) => part !== "");
  const relativeParts = relativePath.split("/");

  for (const part of relativeParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

function isLikelyImageUrl(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("data:image/")) return true;
  if (value.startsWith("/api/sessions/")) return true;
  if (/^https?:\/\//i.test(value)) {
    return IMAGE_EXT_RE.test(value) || /[?&](format|type)=image/i.test(value);
  }
  return IMAGE_EXT_RE.test(value);
}

export function normalizePreviewImageUrl(
  value: string,
  options: Pick<PreviewResourceInput, "sessionId" | "demoId" | "origin"> = {},
): string | null {
  const trimmed = value.trim();
  if (!isLikelyImageUrl(trimmed)) return null;

  if (trimmed.startsWith("data:image/")) return trimmed;

  const origin = getBrowserOrigin(options.origin);
  if (trimmed.startsWith("/api/sessions/")) {
    return origin ? origin + trimmed : trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const basePath = options.demoId ? `demos/${options.demoId}/` : "";
  if (
    options.sessionId &&
    basePath &&
    /^\.\.?\/[^'")\s]*$/.test(trimmed) &&
    IMAGE_EXT_RE.test(trimmed)
  ) {
    const resolved = resolvePreviewRelativePath(trimmed, basePath);
    return `${origin}/api/sessions/${options.sessionId}/workspace/${resolved}`;
  }

  return null;
}

function collectConfigImageUrls(
  value: unknown,
  urls: Set<string>,
  options: PreviewResourceInput,
) {
  if (typeof value === "string") {
    const normalized = normalizePreviewImageUrl(value, options);
    if (normalized) urls.add(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectConfigImageUrls(item, urls, options);
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectConfigImageUrls(item, urls, options);
    }
  }
}

function collectCodeImageUrls(
  code: string | undefined,
  urls: Set<string>,
  options: PreviewResourceInput,
) {
  if (!code) return;
  STRING_LITERAL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STRING_LITERAL_RE.exec(code)) !== null) {
    const normalized = normalizePreviewImageUrl(match[1], options);
    if (normalized) urls.add(normalized);
  }
}

export function extractPreviewImageUrls(
  input: PreviewResourceInput,
): string[] {
  const urls = new Set<string>();
  collectConfigImageUrls(input.configData, urls, input);
  collectCodeImageUrls(input.code, urls, input);
  return Array.from(urls).sort();
}

export function buildPreviewResourceFingerprint(
  input: PreviewResourceInput,
): string {
  const urls = extractPreviewImageUrls(input);
  return [
    input.pageId ?? "unknown-page",
    getCodeFingerprint(input.code),
    getPreviewSizeFingerprint(input.previewSize),
    urls.join("|"),
  ].join("::");
}

export function getPreviewPageResourceDescriptor(
  page: CanvasPageData,
  options: Pick<PreviewResourceInput, "sessionId" | "origin"> = {},
) {
  const input: PreviewResourceInput = {
    pageId: page.id,
    code: page.code,
    configData: page.configData,
    previewSize: page.previewSize,
    sessionId: options.sessionId,
    demoId: page.id,
    origin: options.origin,
  };
  return {
    fingerprint: buildPreviewResourceFingerprint(input),
    imageUrls: extractPreviewImageUrls(input),
  };
}

function pruneResourceCache() {
  if (resourceCache.size <= MAX_RESOURCE_CACHE_SIZE) return;
  const entries = Array.from(resourceCache.entries()).sort(
    (a, b) => a[1].lastUsed - b[1].lastUsed,
  );
  const removeCount = resourceCache.size - MAX_RESOURCE_CACHE_SIZE;
  for (const [url, entry] of entries.slice(0, removeCount)) {
    if (entry.status !== "loading") {
      resourceCache.delete(url);
    }
  }
}

function runNextPrewarm() {
  while (
    activePrewarmCount < PREWARM_CONCURRENCY &&
    pendingQueue.length > 0
  ) {
    const task = pendingQueue.shift();
    if (task) task();
  }
}

function loadImage(url: string): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`图片预热失败: ${url}`));
    image.src = url;

    if (typeof image.decode === "function") {
      image.decode().then(resolve).catch(() => {
        // decode 失败时仍等待 onload/onerror，避免部分浏览器误报阻断预热。
      });
    }
  });
}

function enqueuePrewarm(url: string): Promise<void> {
  const existing = resourceCache.get(url);
  if (existing) {
    existing.lastUsed = now();
    if (existing.promise) return existing.promise.catch(() => {});
    return Promise.resolve();
  }

  const promise = new Promise<void>((resolve) => {
    pendingQueue.push(() => {
      activePrewarmCount += 1;
      loadImage(url)
        .then(() => {
          resourceCache.set(url, { status: "loaded", lastUsed: now() });
        })
        .catch(() => {
          resourceCache.set(url, { status: "failed", lastUsed: now() });
        })
        .finally(() => {
          activePrewarmCount -= 1;
          pruneResourceCache();
          runNextPrewarm();
          resolve();
        });
    });
    runNextPrewarm();
  });

  resourceCache.set(url, {
    status: "loading",
    lastUsed: now(),
    promise,
  });
  pruneResourceCache();
  return promise;
}

export async function prewarmPreviewImageUrls(urls: string[]): Promise<void> {
  const uniqueUrls = Array.from(new Set(urls)).filter(Boolean);
  await Promise.all(uniqueUrls.map((url) => enqueuePrewarm(url)));
}

export function getPreviewResourceCacheStats() {
  return {
    size: resourceCache.size,
    active: activePrewarmCount,
    queued: pendingQueue.length,
    loaded: Array.from(resourceCache.values()).filter(
      (entry) => entry.status === "loaded",
    ).length,
    failed: Array.from(resourceCache.values()).filter(
      (entry) => entry.status === "failed",
    ).length,
  };
}

export function clearPreviewResourceCacheForTests() {
  resourceCache.clear();
  pendingQueue.splice(0, pendingQueue.length);
  activePrewarmCount = 0;
}

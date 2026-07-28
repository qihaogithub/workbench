import { uploadImage, type ImageSourceType } from "./image-store";

interface ImageLocalizationFailure {
  originalUrl: string;
  reason: string;
}

export interface ImageLocalizationResult {
  total: number;
  succeeded: number;
  failed: number;
  failures: ImageLocalizationFailure[];
}

interface ImageReplacement {
  original: string;
  replacement: string;
}

const FIGMA_CDN_HOSTS = [
  "figma-alpha-api.s3.",
  "s3-us-west-2.amazonaws.com/images.figma.com",
  "figma.com",
];

const EXTERNAL_URL_RE = /^https?:\/\//i;
const BASE64_IMAGE_RE = /^data:image\//i;

const IMAGE_PATTERNS: RegExp[] = [
  /<img\b[^>]*\s+src\s*=\s*["']([^"']+)["']/gi,
  /<source\b[^>]*\s+srcset\s*=\s*["']([^"',\s]+)/gi,
  /<image\b[^>]*\s+href\s*=\s*["']([^"']+)["']/gi,
  /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
];

const CONCURRENCY_LIMIT = 5;
const DOWNLOAD_TIMEOUT_MS = 10_000;

function isLocalUrl(url: string): boolean {
  return url.startsWith("/") || url.startsWith("./") || url.startsWith("../") || url.startsWith("#");
}

function shouldExtractUrl(url: string): boolean {
  if (BASE64_IMAGE_RE.test(url)) return true;
  if (EXTERNAL_URL_RE.test(url)) return true;
  return false;
}

function classifySourceType(url: string): ImageSourceType {
  if (BASE64_IMAGE_RE.test(url)) return "remote_url";
  const lower = url.toLowerCase();
  for (const host of FIGMA_CDN_HOSTS) {
    if (lower.includes(host)) return "remote_url";
  }
  return "remote_url";
}

function extractImageUrls(html: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const pattern of IMAGE_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1];
      if (shouldExtractUrl(url) && !isLocalUrl(url) && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}

function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "image";
    if (/\.[a-z]{2,5}$/i.test(last)) return last;
    return `${last}.png`;
  } catch {
    return "image.png";
  }
}

function filenameFromBase64(dataUri: string): string {
  const mimeMatch = dataUri.match(/^data:(image\/[^;]+);/i);
  const mime = mimeMatch?.[1] ?? "image/png";
  const ext = mime.split("/")[1] ?? "png";
  const hash = simpleStringHash(dataUri.slice(0, 64));
  return `image_${hash}.${ext}`;
}

function simpleStringHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64Image(dataUri: string): { buffer: Buffer; filename: string } {
  const base64Match = dataUri.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (!base64Match) {
    throw new Error("无法解析 Base64 图片数据");
  }
  return {
    buffer: Buffer.from(base64Match[1], "base64"),
    filename: filenameFromBase64(dataUri),
  };
}

type StoreImageSuccess = { type: "success"; originalUrl: string; localUrl: string };
type StoreImageFailure = { type: "failure"; originalUrl: string; reason: string };
type StoreImageOutcome = StoreImageSuccess | StoreImageFailure;

async function storeOneImage(
  url: string,
  projectId: string,
): Promise<StoreImageOutcome> {
  try {
    let buffer: Buffer;
    let filename: string;

    if (BASE64_IMAGE_RE.test(url)) {
      const decoded = decodeBase64Image(url);
      buffer = decoded.buffer;
      filename = decoded.filename;
    } else {
      const fetched = await fetchImageBuffer(url);
      buffer = fetched.buffer;
      filename = filenameFromUrl(url);
    }

    const result = await uploadImage({
      buffer,
      filename,
      sourceType: classifySourceType(url),
      sourceUrl: url,
      projectId,
      createdBy: "figma",
    });

    if (!result.success) {
      return { type: "failure", originalUrl: url, reason: result.error.message };
    }

    return { type: "success", originalUrl: url, localUrl: result.url };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "未知错误";
    return { type: "failure", originalUrl: url, reason };
  }
}

async function batchStoreImages(
  urls: string[],
  projectId: string,
): Promise<{ replacements: ImageReplacement[]; result: ImageLocalizationResult }> {
  const replacements: ImageReplacement[] = [];
  const failures: ImageLocalizationFailure[] = [];

  for (let i = 0; i < urls.length; i += CONCURRENCY_LIMIT) {
    const batch = urls.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.all(
      batch.map((url) => storeOneImage(url, projectId)),
    );
    for (const r of results) {
      if (r.type === "success") {
        replacements.push({ original: r.originalUrl, replacement: r.localUrl });
      } else {
        failures.push({ originalUrl: r.originalUrl, reason: r.reason });
      }
    }
  }

  return {
    replacements,
    result: {
      total: urls.length,
      succeeded: replacements.length,
      failed: failures.length,
      failures,
    },
  };
}

export async function localizeHtmlImages(
  html: string,
  projectId: string,
): Promise<{ html: string; result: ImageLocalizationResult }> {
  const urls = extractImageUrls(html);

  if (urls.length === 0) {
    return {
      html,
      result: { total: 0, succeeded: 0, failed: 0, failures: [] },
    };
  }

  const { replacements, result } = await batchStoreImages(urls, projectId);

  let localizedHtml = html;
  for (const { original, replacement } of replacements) {
    localizedHtml = localizedHtml.split(original).join(replacement);
  }

  return { html: localizedHtml, result };
}

export function extractImageReferences(html: string): string[] {
  return extractImageUrls(html);
}

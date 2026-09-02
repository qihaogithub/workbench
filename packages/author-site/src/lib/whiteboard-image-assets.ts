import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import sharp from "sharp";
import { uploadImage, type ImageSourceType, type UploadResult } from "./image-store";

const MAX_WHITEBOARD_IMAGE_BYTES = 10 * 1024 * 1024;
const REMOTE_DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_REMOTE_REDIRECTS = 3;

export interface WhiteboardImageInput {
  buffer: Buffer;
  mimeType?: string;
  sourceUrl?: string;
  filename?: string;
  sourceType?: ImageSourceType;
  projectId?: string;
  createdBy?: string;
}

export interface WhiteboardImageAsset extends UploadResult {
  staticFrame: true;
  sourceMimeType: string;
  sourceWasAnimated: boolean;
  sourceWidth?: number;
  sourceHeight?: number;
}

export class WhiteboardImageAssetError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WhiteboardImageAssetError";
    this.code = code;
  }
}

function normalizeMimeType(value: string | undefined): string {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [first, second] = address.split(".").map(Number);
    return first === 0 || first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 169 && second === 254);
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) return isPrivateIp(mappedIpv4[1]);
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return true;
}

async function assertPublicRemoteUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WhiteboardImageAssetError("INVALID_URL", "图片地址无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new WhiteboardImageAssetError("UNSUPPORTED_URL_PROTOCOL", "仅支持 HTTP 或 HTTPS 图片地址");
  if (url.username || url.password) throw new WhiteboardImageAssetError("INVALID_URL", "图片地址不能包含登录凭据");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new WhiteboardImageAssetError("PRIVATE_NETWORK_BLOCKED", "出于安全原因，不能读取内网图片地址");
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) throw new WhiteboardImageAssetError("PRIVATE_NETWORK_BLOCKED", "出于安全原因，不能读取内网图片地址");
  return url;
}

export async function downloadWhiteboardImage(urlString: string, redirectCount = 0): Promise<{ buffer: Buffer; mimeType: string }> {
  if (redirectCount > MAX_REMOTE_REDIRECTS) throw new WhiteboardImageAssetError("TOO_MANY_REDIRECTS", "图片地址重定向次数过多");
  const url = await assertPublicRemoteUrl(urlString);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new WhiteboardImageAssetError("DOWNLOAD_FAILED", "图片地址重定向缺少目标");
      return downloadWhiteboardImage(new URL(location, url).toString(), redirectCount + 1);
    }
    if (!response.ok) throw new WhiteboardImageAssetError("DOWNLOAD_FAILED", `图片下载失败（HTTP ${response.status}）`);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_WHITEBOARD_IMAGE_BYTES) {
      throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "图片大小超过 10MB 限制");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new WhiteboardImageAssetError("EMPTY_IMAGE", "图片内容为空");
    if (buffer.length > MAX_WHITEBOARD_IMAGE_BYTES) throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "图片大小超过 10MB 限制");
    return { buffer, mimeType: normalizeMimeType(response.headers.get("content-type") ?? undefined) };
  } catch (error) {
    if (error instanceof WhiteboardImageAssetError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new WhiteboardImageAssetError("DOWNLOAD_TIMEOUT", "图片下载超时，请改用上传图片");
    throw new WhiteboardImageAssetError("DOWNLOAD_FAILED", "图片下载失败，请改用上传图片");
  } finally {
    clearTimeout(timer);
  }
}

export function decodeWhiteboardDataUrl(source: string): { buffer: Buffer; mimeType: string } {
  const commaIndex = source.indexOf(",");
  const header = commaIndex >= 0 ? source.slice(0, commaIndex) : "";
  const payload = commaIndex >= 0 ? source.slice(commaIndex + 1) : "";
  const match = header.match(/^data:(image\/[A-Za-z0-9.+-]+)((?:;[^;]*)*)$/i);
  if (!match || !payload) throw new WhiteboardImageAssetError("INVALID_DATA_URL", "图片数据格式无效");
  const mimeType = normalizeMimeType(match[1]);
  const isBase64 = /(?:^|;)base64(?:;|$)/i.test(match[2] ?? "");
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  if (!buffer.length) throw new WhiteboardImageAssetError("EMPTY_IMAGE", "图片内容为空");
  if (buffer.length > MAX_WHITEBOARD_IMAGE_BYTES) throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "图片大小超过 10MB 限制");
  return { buffer, mimeType };
}

function safeFilename(value: string | undefined): string {
  const stem = path.basename(value || "whiteboard-image", path.extname(value || ""))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${stem || "whiteboard-image"}.png`;
}

/**
 * The whiteboard owns a static render asset. Every source format is decoded
 * once and stored as PNG so the final server renderer never depends on a
 * browser URL, an animation timeline, or a remote origin.
 */
export async function normalizeWhiteboardImage(input: WhiteboardImageInput): Promise<WhiteboardImageAsset> {
  if (!input.buffer.length) throw new WhiteboardImageAssetError("EMPTY_IMAGE", "图片内容为空");
  if (input.buffer.length > MAX_WHITEBOARD_IMAGE_BYTES) throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "图片大小超过 10MB 限制");

  let sourceMetadata: { format?: string; pages?: number; width?: number; height?: number };
  try {
    // Read animation metadata from the original container before selecting a
    // page. The normalized raster below intentionally uses page 0, but using
    // page: 0 here would hide GIF/APNG/WebP animation from the audit result.
    sourceMetadata = await sharp(input.buffer).metadata();
  } catch {
    throw new WhiteboardImageAssetError("IMAGE_DECODE_FAILED", "图片无法解码，请更换图片后重试");
  }
  const supportedFormats = new Set(["png", "jpeg", "jpg", "gif", "webp", "svg"]);
  if (!sourceMetadata.format || !supportedFormats.has(sourceMetadata.format)) throw new WhiteboardImageAssetError("UNSUPPORTED_FORMAT", "白板不支持此图片格式");

  let normalizedBuffer: Buffer;
  try {
    normalizedBuffer = await sharp(input.buffer, { page: 0 })
      .rotate()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  } catch {
    throw new WhiteboardImageAssetError("IMAGE_DECODE_FAILED", "图片无法转换为白板静态图片，请更换图片后重试");
  }
  if (!normalizedBuffer.length || normalizedBuffer.length > MAX_WHITEBOARD_IMAGE_BYTES) throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "转换后的图片大小超过 10MB 限制");

  const stored = await uploadImage({
    buffer: normalizedBuffer,
    filename: safeFilename(input.filename),
    sourceType: input.sourceType ?? (input.sourceUrl?.startsWith("http") ? "remote_url" : "user_upload"),
    sourceUrl: input.sourceUrl && !input.sourceUrl.startsWith("data:") ? input.sourceUrl : undefined,
    projectId: input.projectId,
    createdBy: input.createdBy,
  });
  if (!stored.success) throw new WhiteboardImageAssetError(stored.error.code, stored.error.message);

  const normalizedMetadata = await sharp(normalizedBuffer).metadata();
  return {
    ...stored,
    staticFrame: true,
    sourceMimeType: normalizeMimeType(input.mimeType)
      || (sourceMetadata.format === "svg" ? "image/svg+xml" : `image/${sourceMetadata.format}`),
    sourceWasAnimated: (sourceMetadata.pages ?? 1) > 1,
    sourceWidth: normalizedMetadata.width ?? sourceMetadata.width,
    sourceHeight: normalizedMetadata.height ?? sourceMetadata.height,
  };
}

export function whiteboardAssetSourceHash(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex");
}

export function resolveWorkspaceImageFile(workspacePath: string, relativePath: string): Buffer {
  const normalized = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized || normalized.split("/").includes("..")) throw new WhiteboardImageAssetError("INVALID_PATH", "图片资源路径无效");
  const root = path.resolve(workspacePath);
  const filePath = path.resolve(root, normalized);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new WhiteboardImageAssetError("INVALID_PATH", "图片资源路径无效");
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new WhiteboardImageAssetError("ASSET_NOT_FOUND", "找不到白板图片资源");
  const buffer = fs.readFileSync(filePath);
  if (buffer.length > MAX_WHITEBOARD_IMAGE_BYTES) throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "图片大小超过 10MB 限制");
  return buffer;
}

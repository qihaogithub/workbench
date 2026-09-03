import crypto from "node:crypto";
import * as dns from "node:dns/promises";
import fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import net from "node:net";
import path from "node:path";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
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
    const [first, second, third] = address.split(".").map(Number);
    return first === 0
      || first === 10
      || first === 100 && second >= 64 && second <= 127
      || first === 127
      || first === 169 && second === 254
      || first === 172 && second >= 16 && second <= 31
      || first === 192 && second === 0 && (third === 0 || third === 2)
      || first === 192 && second === 168
      || first === 192 && second === 31 && third === 196
      || first === 192 && second === 52 && third === 193
      || first === 192 && second === 88 && third === 99
      || first === 192 && second === 175 && third === 48
      || first === 198 && (second === 18 || second === 19 || second === 51 && third === 100)
      || first === 203 && second === 0 && third === 113
      || first >= 224;
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    const sections = normalized.split("::");
    if (sections.length > 2) return true;
    const parseSection = (section: string): number[] | null => {
      if (!section) return [];
      const values: number[] = [];
      for (const part of section.split(":")) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(part)) {
          const octets = part.split(".").map(Number);
          if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
          values.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        } else if (/^[0-9a-f]{1,4}$/.test(part)) {
          values.push(Number.parseInt(part, 16));
        } else {
          return null;
        }
      }
      return values;
    };
    const left = parseSection(sections[0] ?? "");
    const right = parseSection(sections[1] ?? "");
    if (!left || !right) return true;
    const hextets = sections.length === 2
      ? [...left, ...Array.from({ length: 8 - left.length - right.length }, () => 0), ...right]
      : left;
    if (hextets.length !== 8) return true;
    const allZero = hextets.every((part) => part === 0);
    const mappedIpv4 = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
    const compatibleIpv4 = hextets.slice(0, 6).every((part) => part === 0) && !allZero;
    if (mappedIpv4) {
      const firstOctet = hextets[6]! >> 8;
      const secondOctet = hextets[6]! & 0xff;
      const thirdOctet = hextets[7]! >> 8;
      const fourthOctet = hextets[7]! & 0xff;
      return isPrivateIp(`${firstOctet}.${secondOctet}.${thirdOctet}.${fourthOctet}`);
    }
    if (compatibleIpv4) return true; // deprecated ::/96 IPv4-compatible space
    const first = hextets[0]!;
    const second = hextets[1]!;
    const third = hextets[2]!;
    return allZero
      || hextets.slice(0, 7).every((part) => part === 0) && hextets[7] === 1
      || (first & 0xfe00) === 0xfc00 // fc00::/7 unique local
      || (first & 0xffc0) === 0xfe80 // fe80::/10 link local
      || (first & 0xff00) === 0xff00 // ff00::/8 multicast
      || first === 0x0100 && hextets.slice(1, 4).every((part) => part === 0) // 100::/64 discard-only
      || first === 0x2001 && second === 0x0db8 // 2001:db8::/32 documentation
      || first === 0x2001 && second === 0x0000 // 2001:0::/32 Teredo
      || first === 0x2001 && second === 0x0002 && third === 0x0000 // 2001:2::/48 benchmarking
      || first === 0x2001 && ((second & 0xfff0) === 0x0010 || (second & 0xfff0) === 0x0020) // ORCHID / ORCHIDv2
      || first === 0x3fff && (second & 0xf000) === 0; // 3fff::/20 documentation
  }
  return true;
}

interface ResolvedRemoteUrl {
  url: URL;
  address: string;
  family: 4 | 6;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.reject(new WhiteboardImageAssetError("DOWNLOAD_TIMEOUT", "图片下载超时，请改用上传图片"));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new WhiteboardImageAssetError("DOWNLOAD_TIMEOUT", "图片下载超时，请改用上传图片"));
    }, remainingMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function resolvePublicRemoteUrl(rawUrl: string, deadline: number): Promise<ResolvedRemoteUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WhiteboardImageAssetError("INVALID_URL", "图片地址无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new WhiteboardImageAssetError("UNSUPPORTED_URL_PROTOCOL", "仅支持 HTTP 或 HTTPS 图片地址");
  if (url.username || url.password) throw new WhiteboardImageAssetError("INVALID_URL", "图片地址不能包含登录凭据");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new WhiteboardImageAssetError("PRIVATE_NETWORK_BLOCKED", "出于安全原因，不能读取内网图片地址");
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new WhiteboardImageAssetError("PRIVATE_NETWORK_BLOCKED", "出于安全原因，不能读取内网图片地址");
    return { url, address: hostname, family: net.isIPv4(hostname) ? 4 : 6 };
  }
  const records = await withDeadline(dns.lookup(hostname, { all: true }), deadline);
  if (!records.length || records.some((record) => isPrivateIp(record.address))) throw new WhiteboardImageAssetError("PRIVATE_NETWORK_BLOCKED", "出于安全原因，不能读取内网图片地址");
  const record = records[0];
  if (record.family !== 4 && record.family !== 6) throw new WhiteboardImageAssetError("PRIVATE_NETWORK_BLOCKED", "出于安全原因，不能读取内网图片地址");
  return { url, address: record.address, family: record.family };
}

function requestRemoteImage(target: ResolvedRemoteUrl, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      protocol: target.url.protocol,
      hostname: target.address,
      port: target.url.port || undefined,
      path: `${target.url.pathname}${target.url.search}`,
      method: "GET",
      headers: {
        host: target.url.host,
        accept: "image/*",
        "accept-encoding": "identity",
      },
      // The hostname was resolved and checked above. Returning this exact
      // address prevents a second DNS resolution (and DNS rebinding) at the
      // socket connection boundary.
      lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        callback(null, target.address, target.family);
      }) as never,
      // Keep the original hostname for HTTPS certificate/SNI validation.
      servername: target.url.hostname.replace(/^\[|\]$/g, ""),
    } as http.RequestOptions & https.RequestOptions;

    let request: http.ClientRequest;
    const onAbort = () => request.destroy(new Error("remote image request aborted"));
    const onError = (error: Error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    };
    const onResponse = (response: IncomingMessage) => {
      signal.removeEventListener("abort", onAbort);
      resolve(response);
    };

    request = target.url.protocol === "https:"
      ? https.request(requestOptions, onResponse)
      : http.request(requestOptions, onResponse);
    request.once("error", onError);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    request.end();
  });
}

async function readRemoteImageBody(response: IncomingMessage, signal: AbortSignal): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const onAbort = () => response.destroy(new Error("remote image response aborted"));
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  try {
    for await (const chunk of response) {
      if (signal.aborted) throw new WhiteboardImageAssetError("DOWNLOAD_TIMEOUT", "图片下载超时，请改用上传图片");
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_WHITEBOARD_IMAGE_BYTES) {
        response.destroy();
        throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "图片大小超过 10MB 限制");
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof WhiteboardImageAssetError) throw error;
    if (signal.aborted) throw new WhiteboardImageAssetError("DOWNLOAD_TIMEOUT", "图片下载超时，请改用上传图片");
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  if (!total) throw new WhiteboardImageAssetError("EMPTY_IMAGE", "图片内容为空");
  return Buffer.concat(chunks, total);
}

async function downloadWhiteboardImageInternal(urlString: string, redirectCount: number, deadline: number): Promise<{ buffer: Buffer; mimeType: string }> {
  if (redirectCount > MAX_REMOTE_REDIRECTS) throw new WhiteboardImageAssetError("TOO_MANY_REDIRECTS", "图片地址重定向次数过多");
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new WhiteboardImageAssetError("DOWNLOAD_TIMEOUT", "图片下载超时，请改用上传图片");
  const target = await resolvePublicRemoteUrl(urlString, deadline);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    const response = await requestRemoteImage(target, controller.signal);
    const statusCode = response.statusCode ?? 0;
    if (statusCode >= 300 && statusCode < 400) {
      const location = headerValue(response.headers, "location");
      if (!location) throw new WhiteboardImageAssetError("DOWNLOAD_FAILED", "图片地址重定向缺少目标");
      response.resume();
      clearTimeout(timer);
      return downloadWhiteboardImageInternal(new URL(location, target.url).toString(), redirectCount + 1, deadline);
    }
    if (statusCode < 200 || statusCode >= 300) throw new WhiteboardImageAssetError("DOWNLOAD_FAILED", `图片下载失败（HTTP ${statusCode}）`);
    const contentLength = Number(headerValue(response.headers, "content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_WHITEBOARD_IMAGE_BYTES) {
      response.destroy();
      throw new WhiteboardImageAssetError("ASSET_TOO_LARGE", "图片大小超过 10MB 限制");
    }
    const buffer = await readRemoteImageBody(response, controller.signal);
    return { buffer, mimeType: normalizeMimeType(headerValue(response.headers, "content-type")) };
  } catch (error) {
    if (error instanceof WhiteboardImageAssetError) throw error;
    if (controller.signal.aborted || error instanceof Error && error.name === "AbortError") throw new WhiteboardImageAssetError("DOWNLOAD_TIMEOUT", "图片下载超时，请改用上传图片");
    throw new WhiteboardImageAssetError("DOWNLOAD_FAILED", "图片下载失败，请改用上传图片");
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadWhiteboardImage(urlString: string, redirectCount = 0): Promise<{ buffer: Buffer; mimeType: string }> {
  return downloadWhiteboardImageInternal(urlString, redirectCount, Date.now() + REMOTE_DOWNLOAD_TIMEOUT_MS);
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

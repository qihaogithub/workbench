import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { NextRequest, NextResponse } from "next/server";

import {
  appendEditorDiagnosticEvents,
} from "@/lib/editor-diagnostics/store";
import type { EditorDiagnosticEvent } from "@/lib/editor-diagnostics/types";
import { createApiError } from "@/lib/fs-utils";

export const runtime = "nodejs";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_CACHE_MAX_AGE_SECONDS = 86_400;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 0;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REDIRECTS = 3;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type ImageProxyResponse = {
  response: Response;
  finalUrl: URL;
};

type ImageProxyRateLimitBucket = {
  windowStart: number;
  count: number;
};

type ImageProxyRateLimitResult =
  | { allowed: true; headers: Record<string, string> }
  | { allowed: false; headers: Record<string, string> };

type ImageProxyAuditContext = {
  editorSessionId: string;
  projectId: string;
  sessionId?: string;
  workspaceId?: string;
  pageId?: string;
  traceId?: string;
};

class ImageProxyBlockedError extends Error {
  constructor(
    message: string,
    readonly hostname?: string,
  ) {
    super(message);
    this.name = "ImageProxyBlockedError";
  }
}

const rateLimitBuckets = new Map<string, ImageProxyRateLimitBucket>();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const auditContext = parseImageProxyAuditContext(request.nextUrl.searchParams);
  const parsed = parseInputUrl(request.nextUrl.searchParams.get("url") ?? "");
  if (!parsed.ok) {
    await recordImageProxyAudit({
      context: auditContext,
      startedAt,
      status: "rejected",
      success: false,
      reason: "invalid_url",
    });
    return jsonError(400, parsed.message);
  }
  const inputHost = normalizeHostname(parsed.url.hostname);

  const timeoutMs = readPositiveIntegerEnv(
    "OPENPENCIL_IMAGE_PROXY_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
  );
  const maxBytes = readPositiveIntegerEnv(
    "OPENPENCIL_IMAGE_PROXY_MAX_BYTES",
    DEFAULT_MAX_BYTES,
  );
  const cacheMaxAgeSeconds = readPositiveIntegerEnv(
    "OPENPENCIL_IMAGE_PROXY_CACHE_MAX_AGE_SECONDS",
    DEFAULT_CACHE_MAX_AGE_SECONDS,
  );
  const rateLimitPerMinute = readNonNegativeIntegerEnv(
    "OPENPENCIL_IMAGE_PROXY_RATE_LIMIT_PER_MINUTE",
    DEFAULT_RATE_LIMIT_PER_MINUTE,
  );
  const rateLimit = consumeImageProxyRateLimit(
    getRateLimitClientId(request),
    rateLimitPerMinute,
    Date.now(),
  );
  if (!rateLimit.allowed) {
    await recordImageProxyAudit({
      context: auditContext,
      startedAt,
      status: "rate_limited",
      success: false,
      reason: "rate_limited",
      inputHost,
      rateLimitPerMinute,
      rateLimitRemaining: 0,
    });
    return jsonError(429, "图片代理请求过于频繁，请稍后再试", rateLimit.headers);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { response, finalUrl } = await fetchWithValidatedRedirects(
      parsed.url,
      controller.signal,
    );
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      await recordImageProxyAudit({
        context: auditContext,
        startedAt,
        status: "upstream_error",
        success: false,
        reason: "upstream_http_status",
        inputHost,
        finalHost: normalizeHostname(finalUrl.hostname),
        httpStatus: response.status,
        cacheMaxAgeSeconds,
        rateLimitPerMinute,
        rateLimitRemaining: getRateLimitRemaining(rateLimit),
      });
      return jsonError(502, `图片读取失败（HTTP ${response.status}）`);
    }
    if (!isImageContentType(contentType)) {
      await recordImageProxyAudit({
        context: auditContext,
        startedAt,
        status: "rejected",
        success: false,
        reason: "non_image_content_type",
        inputHost,
        finalHost: normalizeHostname(finalUrl.hostname),
        httpStatus: response.status,
        contentType: normalizeContentType(contentType),
        cacheMaxAgeSeconds,
        rateLimitPerMinute,
        rateLimitRemaining: getRateLimitRemaining(rateLimit),
      });
      return jsonError(415, "目标 URL 不是图片资源");
    }

    const contentLength = response.headers.get("content-length");
    const declaredLength = contentLength ? Number.parseInt(contentLength, 10) : 0;
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await recordImageProxyAudit({
        context: auditContext,
        startedAt,
        status: "rejected",
        success: false,
        reason: "declared_size_limit",
        inputHost,
        finalHost: normalizeHostname(finalUrl.hostname),
        httpStatus: response.status,
        contentType: normalizeContentType(contentType),
        contentLength: declaredLength,
        cacheMaxAgeSeconds,
        rateLimitPerMinute,
        rateLimitRemaining: getRateLimitRemaining(rateLimit),
      });
      return jsonError(413, `图片资源超过读取上限（${maxBytes} bytes）`);
    }

    const body = await readResponseBody(response, maxBytes);
    if (body.tooLarge) {
      await recordImageProxyAudit({
        context: auditContext,
        startedAt,
        status: "rejected",
        success: false,
        reason: "stream_size_limit",
        inputHost,
        finalHost: normalizeHostname(finalUrl.hostname),
        httpStatus: response.status,
        contentType: normalizeContentType(contentType),
        contentLength: body.bytes.length,
        cacheMaxAgeSeconds,
        rateLimitPerMinute,
        rateLimitRemaining: getRateLimitRemaining(rateLimit),
      });
      return jsonError(413, `图片资源超过读取上限（${maxBytes} bytes）`);
    }
    if (body.bytes.length === 0) {
      await recordImageProxyAudit({
        context: auditContext,
        startedAt,
        status: "upstream_error",
        success: false,
        reason: "empty_body",
        inputHost,
        finalHost: normalizeHostname(finalUrl.hostname),
        httpStatus: response.status,
        contentType: normalizeContentType(contentType),
        contentLength: 0,
        cacheMaxAgeSeconds,
        rateLimitPerMinute,
        rateLimitRemaining: getRateLimitRemaining(rateLimit),
      });
      return jsonError(502, "图片资源为空");
    }

    await recordImageProxyAudit({
      context: auditContext,
      startedAt,
      status: "proxied",
      success: true,
      inputHost,
      finalHost: normalizeHostname(finalUrl.hostname),
      httpStatus: response.status,
      contentType: normalizeContentType(contentType),
      contentLength: body.bytes.length,
      cacheMaxAgeSeconds,
      rateLimitPerMinute,
      rateLimitRemaining: getRateLimitRemaining(rateLimit),
    });

    return new NextResponse(toArrayBuffer(body.bytes), {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": normalizeContentType(contentType),
        "Content-Length": String(body.bytes.length),
        "Cache-Control": `public, max-age=${cacheMaxAgeSeconds}`,
        "X-OpenPencil-Image-Source": finalUrl.toString(),
        ...rateLimit.headers,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `图片读取超时（${timeoutMs}ms）`
        : error instanceof Error
          ? error.message
          : "图片读取失败";
    const blocked = isBlockedProxyError(message);
    await recordImageProxyAudit({
      context: auditContext,
      startedAt,
      status: blocked ? "blocked" : "upstream_error",
      success: false,
      reason: blocked ? "blocked_target" : "fetch_failed",
      inputHost,
      finalHost: error instanceof ImageProxyBlockedError ? error.hostname : undefined,
      cacheMaxAgeSeconds,
      rateLimitPerMinute,
      rateLimitRemaining: getRateLimitRemaining(rateLimit),
    });
    return jsonError(blocked ? 403 : 502, message);
  } finally {
    clearTimeout(timeoutId);
  }
}

function jsonError(
  status: number,
  message: string,
  headers?: Record<string, string>,
) {
  return NextResponse.json(createApiError("INVALID_REQUEST", message), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

function isBlockedProxyError(message: string): boolean {
  return (
    message.includes("本机、内网或保留地址") ||
    message.includes("不在允许代理列表")
  );
}

function parseInputUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; message: string } {
  const value = rawUrl.trim();
  if (!value) return { ok: false, message: "缺少图片 URL" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "图片 URL 格式无效" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "只支持 HTTP/HTTPS 图片 URL" };
  }
  if (url.username || url.password) {
    return { ok: false, message: "不允许代理包含用户名或密码的图片 URL" };
  }
  return { ok: true, url };
}

async function fetchWithValidatedRedirects(
  inputUrl: URL,
  signal: AbortSignal,
): Promise<ImageProxyResponse> {
  let currentUrl = inputUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicUrl(currentUrl);
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "workbench-openpencil-image-proxy/1.0",
      },
    });

    if (!isRedirectStatus(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: currentUrl };
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(`图片跳转超过 ${MAX_REDIRECTS} 次`);
    }
    currentUrl = new URL(location, currentUrl);
    const parsed = parseInputUrl(currentUrl.toString());
    if (!parsed.ok) throw new Error(parsed.message);
  }

  throw new Error(`图片跳转超过 ${MAX_REDIRECTS} 次`);
}

async function assertPublicUrl(url: URL): Promise<void> {
  const hostname = normalizeHostname(url.hostname);
  if (!isAllowedProxyHostname(hostname)) {
    throw new ImageProxyBlockedError("图片 URL 域名不在允许代理列表中", hostname);
  }
  if (isBlockedHostname(hostname)) {
    throw new ImageProxyBlockedError(
      "图片 URL 指向本机、内网或保留地址，已拒绝代理",
      hostname,
    );
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new ImageProxyBlockedError(
        "图片 URL 指向本机、内网或保留地址，已拒绝代理",
        hostname,
      );
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("图片 URL 域名无法解析");
  }
  if (records.some((record) => isBlockedIp(record.address))) {
    throw new ImageProxyBlockedError(
      "图片 URL 域名解析到本机、内网或保留地址，已拒绝代理",
      hostname,
    );
  }
}

function isAllowedProxyHostname(hostname: string): boolean {
  const patterns = parseAllowedHostPatterns(
    process.env.OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS,
  );
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => matchAllowedHostPattern(hostname, pattern));
}

function parseAllowedHostPatterns(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => normalizeHostname(entry))
    .filter(Boolean);
}

function matchAllowedHostPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }
  return hostname === pattern;
}

function getRateLimitClientId(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedClient = forwardedFor?.split(",")[0]?.trim();
  if (forwardedClient) return forwardedClient;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function consumeImageProxyRateLimit(
  clientId: string,
  limitPerMinute: number,
  now: number,
): ImageProxyRateLimitResult {
  if (limitPerMinute <= 0) return { allowed: true, headers: {} };

  pruneExpiredRateLimitBuckets(now);
  const current = rateLimitBuckets.get(clientId);
  const bucket =
    current && now - current.windowStart < RATE_LIMIT_WINDOW_MS
      ? current
      : { windowStart: now, count: 0 };
  const resetAt = bucket.windowStart + RATE_LIMIT_WINDOW_MS;
  const resetSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

  if (bucket.count >= limitPerMinute) {
    rateLimitBuckets.set(clientId, bucket);
    return {
      allowed: false,
      headers: {
        "Retry-After": String(resetSeconds),
        "X-RateLimit-Limit": String(limitPerMinute),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    };
  }

  bucket.count += 1;
  rateLimitBuckets.set(clientId, bucket);
  return {
    allowed: true,
    headers: {
      "X-RateLimit-Limit": String(limitPerMinute),
      "X-RateLimit-Remaining": String(Math.max(0, limitPerMinute - bucket.count)),
      "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
    },
  };
}

function getRateLimitRemaining(rateLimit: ImageProxyRateLimitResult): number | undefined {
  const value = rateLimit.headers["X-RateLimit-Remaining"];
  if (value === undefined) return undefined;
  const remaining = Number.parseInt(value, 10);
  return Number.isFinite(remaining) ? remaining : undefined;
}

function parseImageProxyAuditContext(
  params: URLSearchParams,
): ImageProxyAuditContext | null {
  const editorSessionId = params.get("editorSessionId")?.trim();
  const projectId = params.get("projectId")?.trim();
  if (!editorSessionId || !projectId) return null;
  return {
    editorSessionId,
    projectId,
    sessionId: optionalSearchParam(params, "sessionId"),
    workspaceId: optionalSearchParam(params, "workspaceId"),
    pageId: optionalSearchParam(params, "pageId"),
    traceId: optionalSearchParam(params, "traceId"),
  };
}

function optionalSearchParam(params: URLSearchParams, key: string): string | undefined {
  return params.get(key)?.trim() || undefined;
}

function createDiagnosticId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function recordImageProxyAudit(input: {
  context: ImageProxyAuditContext | null;
  startedAt: number;
  status: string;
  success: boolean;
  reason?: string;
  inputHost?: string;
  finalHost?: string;
  httpStatus?: number;
  contentType?: string;
  contentLength?: number;
  cacheMaxAgeSeconds?: number;
  rateLimitPerMinute?: number;
  rateLimitRemaining?: number;
}): Promise<void> {
  if (!input.context) return;
  const event: EditorDiagnosticEvent = {
    id: createDiagnosticId("evt-openpencil-image-proxy"),
    editorSessionId: input.context.editorSessionId,
    projectId: input.context.projectId,
    sessionId: input.context.sessionId,
    workspaceId: input.context.workspaceId,
    activePageId: input.context.pageId,
    timestamp: Date.now(),
    category: "page",
    name: "page.openpencil_image_proxy",
    traceId: input.context.traceId,
    level: input.success ? "info" : "warn",
    details: {
      status: input.status,
      success: input.success,
      reason: input.reason,
      durationMs: Date.now() - input.startedAt,
      inputHost: input.inputHost,
      finalHost: input.finalHost,
      httpStatus: input.httpStatus,
      contentType: input.contentType,
      contentLength: input.contentLength,
      cacheMaxAgeSeconds: input.cacheMaxAgeSeconds,
      rateLimitPerMinute: input.rateLimitPerMinute,
      rateLimitRemaining: input.rateLimitRemaining,
    },
  };
  try {
    await appendEditorDiagnosticEvents([event]);
  } catch (error) {
    console.warn(
      "[openpencil/image-proxy] failed to record audit event",
      error instanceof Error ? error.message : error,
    );
  }
}

function pruneExpiredRateLimitBuckets(now: number): void {
  for (const [clientId, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(clientId);
    }
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  );
}

function isBlockedIp(address: string): boolean {
  const normalized = normalizeHostname(address);
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isBlockedIpv4(normalized);
  if (ipVersion === 6) return isBlockedIpv6(normalized);
  return true;
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  ) {
    return true;
  }

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isImageContentType(contentType: string): boolean {
  return normalizeContentType(contentType).startsWith("image/");
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function readResponseBody(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; tooLarge: boolean }> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    return {
      bytes: new Uint8Array(buffer),
      tooLarge: buffer.byteLength > maxBytes,
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      return { bytes: new Uint8Array(), tooLarge: true };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, tooLarge: false };
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

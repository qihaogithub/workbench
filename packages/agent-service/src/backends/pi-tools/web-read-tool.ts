import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Type, type Static } from "typebox";
import { fetch, type Response } from "undici";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const DEFAULT_MAX_CHARACTERS = 12_000;
const MIN_MAX_CHARACTERS = 1_000;
const MAX_MAX_CHARACTERS = 20_000;

interface WebReadDetails {
  url?: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  title?: string;
  description?: string;
  canonicalUrl?: string;
  truncated?: boolean;
  bytesRead?: number;
  maxBytes?: number;
  contentLength?: number;
  charactersReturned?: number;
  error?: string;
}

interface ReadResponse {
  response: Response;
  finalUrl: URL;
}

const WebReadParams = Type.Object({
  url: Type.String({
    description:
      "Public HTTP/HTTPS URL to read. Private network, localhost, and credential URLs are rejected.",
  }),
  maxCharacters: Type.Optional(
    Type.Number({
      description:
        "Maximum characters of page text to return. Defaults to 12000, maximum 20000.",
      minimum: MIN_MAX_CHARACTERS,
      maximum: MAX_MAX_CHARACTERS,
    }),
  ),
});

type WebReadParams = Static<typeof WebReadParams>;

export function isWebReadEnabled(): boolean {
  return process.env.PI_AGENT_WEB_READ_ENABLED !== "false";
}

export function createWebReadTool(): AgentTool<typeof WebReadParams> {
  return {
    name: "webRead",
    label: "Web Read",
    description:
      "Read a public web page by URL and return extracted text. Rejects localhost, private network addresses, credential URLs, oversized responses, and non-text content.",
    parameters: WebReadParams,
    execute: async (_toolCallId: string, args: WebReadParams) => {
      const parsed = parseInputUrl(args.url);
      if (!parsed.ok) {
        return errorResult(parsed.message, { error: parsed.error });
      }

      const maxCharacters = normalizeMaxCharacters(args.maxCharacters);
      const timeoutMs = readPositiveIntegerEnv(
        "PI_AGENT_WEB_READ_TIMEOUT_MS",
        DEFAULT_TIMEOUT_MS,
      );
      const maxBytes = readPositiveIntegerEnv(
        "PI_AGENT_WEB_READ_MAX_BYTES",
        DEFAULT_MAX_BYTES,
      );
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      timeoutId.unref?.();

      try {
        const readResponse = await fetchWithValidatedRedirects(
          parsed.url,
          controller.signal,
        );
        const { response, finalUrl } = readResponse;
        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
          return errorResult(`Error: 网页读取失败（HTTP ${response.status}）。`, {
            error: "http_error",
            status: response.status,
            url: parsed.url.toString(),
            finalUrl: finalUrl.toString(),
          });
        }

        if (!isTextContentType(contentType)) {
          return errorResult("Error: 目标 URL 不是可读取的文本或 HTML 内容。", {
            error: "unsupported_content_type",
            contentType,
            url: parsed.url.toString(),
            finalUrl: finalUrl.toString(),
          });
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
          return errorResult(`Error: 网页内容超过读取上限（${maxBytes} bytes）。`, {
            error: "response_too_large",
            maxBytes,
            contentLength: Number.parseInt(contentLength, 10),
            url: parsed.url.toString(),
            finalUrl: finalUrl.toString(),
          });
        }

        const body = await readResponseBody(response, maxBytes);
        if (body.tooLarge) {
          return errorResult(`Error: 网页内容超过读取上限（${maxBytes} bytes）。`, {
            error: "response_too_large",
            maxBytes,
            bytesRead: body.bytesRead,
            url: parsed.url.toString(),
            finalUrl: finalUrl.toString(),
          });
        }

        const htmlLike = isHtmlContentType(contentType);
        const page = htmlLike
          ? extractHtmlPage(body.text)
          : {
              title: "",
              description: "",
              canonicalUrl: "",
              text: normalizeWhitespace(body.text),
            };
        const trimmed = truncateText(page.text, maxCharacters);
        const details: WebReadDetails = {
          url: parsed.url.toString(),
          finalUrl: finalUrl.toString(),
          status: response.status,
          contentType,
          title: page.title || undefined,
          description: page.description || undefined,
          canonicalUrl: page.canonicalUrl || undefined,
          truncated: trimmed.truncated,
          bytesRead: body.bytesRead,
          charactersReturned: trimmed.text.length,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: formatWebReadResult(finalUrl.toString(), page, trimmed),
            },
          ],
          details,
        };
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? `Error: 网页读取超时（${timeoutMs}ms）。`
            : `Error: ${error instanceof Error ? error.message : "网页读取失败。"}`;
        return errorResult(message, {
          error:
            error instanceof Error && error.name === "AbortError"
              ? "timeout"
              : "network_error",
          url: parsed.url.toString(),
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

function parseInputUrl(rawUrl: string): {
  ok: true;
  url: URL;
} | {
  ok: false;
  error: string;
  message: string;
} {
  const value = rawUrl.trim();
  if (!value) {
    return { ok: false, error: "empty_url", message: "Error: URL 不能为空。" };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "invalid_url", message: "Error: URL 格式无效。" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      error: "unsupported_protocol",
      message: "Error: 只支持 HTTP/HTTPS URL。",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      error: "credential_url",
      message: "Error: 不允许读取包含用户名或密码的 URL。",
    };
  }

  return { ok: true, url };
}

async function fetchWithValidatedRedirects(
  inputUrl: URL,
  signal: AbortSignal,
): Promise<ReadResponse> {
  let currentUrl = inputUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicUrl(currentUrl);
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
        "Accept-Encoding": "gzip, br, deflate",
        "User-Agent": "workbench-pi-agent/1.0 webRead",
      },
    });

    if (!isRedirectStatus(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: currentUrl };
    }
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(`网页跳转超过 ${MAX_REDIRECTS} 次。`);
    }
    currentUrl = new URL(location, currentUrl);
    const parsed = parseInputUrl(currentUrl.toString());
    if (!parsed.ok) {
      throw new Error(parsed.message.replace(/^Error: /, ""));
    }
  }

  throw new Error(`网页跳转超过 ${MAX_REDIRECTS} 次。`);
}

async function assertPublicUrl(url: URL): Promise<void> {
  const hostname = normalizeHostname(url.hostname);
  if (isBlockedHostname(hostname)) {
    throw new Error("URL 指向本机、内网或保留地址，已拒绝读取。");
  }

  const ipVersion = isIP(hostname);
  if (ipVersion !== 0) {
    if (isBlockedIp(hostname)) {
      throw new Error("URL 指向本机、内网或保留地址，已拒绝读取。");
    }
    return;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error("URL 域名无法解析。");
  }
  if (records.some((record) => isBlockedIp(record.address))) {
    throw new Error("URL 域名解析到本机、内网或保留地址，已拒绝读取。");
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
  if (ipVersion === 4) {
    return isBlockedIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isBlockedIpv6(normalized);
  }
  return true;
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
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
    a >= 224 ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
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

function isTextContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return (
    lower.startsWith("text/") ||
    lower.includes("application/xhtml+xml") ||
    lower.includes("application/xml") ||
    lower.includes("application/json")
  );
}

function isHtmlContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml+xml");
}

async function readResponseBody(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytesRead: number; tooLarge: boolean }> {
  if (!response.body) {
    return { text: "", bytesRead: 0, tooLarge: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      return { text: "", bytesRead, tooLarge: true };
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);
  return {
    text: buffer.toString("utf8"),
    bytesRead,
    tooLarge: false,
  };
}

function extractHtmlPage(html: string): {
  title: string;
  description: string;
  canonicalUrl: string;
  text: string;
} {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  const title = decodeHtmlEntities(matchFirst(withoutNoise, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
  const description = decodeHtmlEntities(
    matchFirst(
      withoutNoise,
      /<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i,
    ),
  );
  const canonicalUrl = decodeHtmlEntities(
    matchFirst(
      withoutNoise,
      /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']*)["'])[^>]*>/i,
    ),
  );
  const withBreaks = withoutNoise
    .replace(/<\/(p|div|section|article|main|header|footer|nav|aside|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = normalizeWhitespace(
    decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " ")),
  );

  return {
    title: normalizeWhitespace(title),
    description: normalizeWhitespace(description),
    canonicalUrl: canonicalUrl.trim(),
    text,
  };
}

function matchFirst(text: string, pattern: RegExp): string {
  return pattern.exec(text)?.[1]?.trim() || "";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith("#x")) {
        const codePoint = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
      }
      if (lower.startsWith("#")) {
        const codePoint = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
      }
      const named: Record<string, string> = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: " ",
        quot: '"',
      };
      return named[lower] || "";
    });
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(
  text: string,
  maxCharacters: number,
): { text: string; truncated: boolean } {
  if (text.length <= maxCharacters) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxCharacters), truncated: true };
}

function normalizeMaxCharacters(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_CHARACTERS;
  }
  return Math.min(
    MAX_MAX_CHARACTERS,
    Math.max(MIN_MAX_CHARACTERS, Math.floor(value)),
  );
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatWebReadResult(
  url: string,
  page: { title: string; description: string; text: string },
  body: { text: string; truncated: boolean },
): string {
  const lines = [`Web page read: ${url}`];
  if (page.title) lines.push(`Title: ${page.title}`);
  if (page.description) lines.push(`Description: ${page.description}`);
  lines.push("");
  lines.push(body.text || "未提取到可读文本。");
  if (body.truncated) {
    lines.push("");
    lines.push("[内容已按 maxCharacters 截断]");
  }
  return lines.join("\n");
}

function errorResult(
  text: string,
  details: WebReadDetails,
): {
  content: Array<{ type: "text"; text: string }>;
  details: WebReadDetails;
  isError: true;
} {
  return {
    content: [{ type: "text", text }],
    details,
    isError: true,
  };
}

import { randomUUID } from "crypto";

const DEFAULT_SCREENSHOT_SERVICE_URL = "http://localhost:3202";
const DEFAULT_SCREENSHOT_PROXY_TIMEOUT_MS = 30000;

export function getScreenshotServiceUrl(): string {
  return (
    process.env.SCREENSHOT_SERVICE_URL ||
    process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL ||
    DEFAULT_SCREENSHOT_SERVICE_URL
  ).replace(/\/+$/, "");
}

export function createScreenshotServiceUnavailableResponse() {
  return Response.json(
    {
      success: false,
      error: {
        code: "SCREENSHOT_SERVICE_UNAVAILABLE",
        message: "截图服务不可达",
      },
    },
    { status: 503 },
  );
}

export function createScreenshotProxyTimeoutResponse() {
  return Response.json(
    {
      success: false,
      error: {
        code: "SCREENSHOT_PROXY_TIMEOUT",
        message: "截图服务请求超时",
      },
    },
    { status: 504 },
  );
}

export function getScreenshotRequestId(headers?: Headers): string {
  return headers?.get("x-request-id") || randomUUID();
}

export async function fetchScreenshotService(
  path: string,
  init: RequestInit & { requestId?: string } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = parseInt(
    process.env.SCREENSHOT_PROXY_TIMEOUT_MS ||
      String(DEFAULT_SCREENSHOT_PROXY_TIMEOUT_MS),
    10,
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  headers.set("x-request-id", init.requestId || randomUUID());

  try {
    return await fetch(`${getScreenshotServiceUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

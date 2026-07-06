import { lookup } from "node:dns/promises";
import { ReadableStream, TransformStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";

import type { NextRequest } from "next/server";

jest.mock("node:dns/promises", () => ({
  lookup: jest.fn(),
}));

jest.mock("@/lib/editor-diagnostics/store", () => ({
  appendEditorDiagnosticEvents: jest.fn(async () => ({
    written: 1,
    sqliteWritten: 1,
    editorSessionId: "editor-session-1",
    diagnostics: {
      sqliteUsed: true,
      jsonlFallbackUsed: false,
      dbUnavailable: false,
      eventGapDetected: false,
      warnings: [],
    },
  })),
}));

Object.assign(globalThis, {
  ReadableStream,
  TextDecoder,
  TextEncoder,
  TransformStream,
});

const undici = jest.requireActual<typeof import("undici")>("undici");

Object.assign(globalThis, {
  Headers: undici.Headers,
  Request: undici.Request,
  Response: undici.Response,
  fetch: undici.fetch,
});

const { GET, OPTIONS } = jest.requireActual<typeof import("./route")>("./route");
const { appendEditorDiagnosticEvents } = jest.requireMock(
  "@/lib/editor-diagnostics/store",
) as typeof import("@/lib/editor-diagnostics/store");
type LookupAll = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const lookupMock = lookup as unknown as jest.MockedFunction<LookupAll>;
const appendDiagnosticsMock = appendEditorDiagnosticEvents as jest.MockedFunction<
  typeof appendEditorDiagnosticEvents
>;
const originalFetch = global.fetch;
const originalAllowedHosts = process.env.OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS;
const originalCacheMaxAge = process.env.OPENPENCIL_IMAGE_PROXY_CACHE_MAX_AGE_SECONDS;
const originalRateLimit = process.env.OPENPENCIL_IMAGE_PROXY_RATE_LIMIT_PER_MINUTE;

function createRequest(url: string, headers?: HeadersInit): NextRequest {
  return { nextUrl: new URL(url), headers: new Headers(headers) } as NextRequest;
}

describe("OpenPencil image proxy route", () => {
  beforeEach(() => {
    lookupMock.mockImplementation(
      async () => [{ address: "93.184.216.34", family: 4 }],
    );
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAllowedHosts === undefined) {
      delete process.env.OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS;
    } else {
      process.env.OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS = originalAllowedHosts;
    }
    if (originalCacheMaxAge === undefined) {
      delete process.env.OPENPENCIL_IMAGE_PROXY_CACHE_MAX_AGE_SECONDS;
    } else {
      process.env.OPENPENCIL_IMAGE_PROXY_CACHE_MAX_AGE_SECONDS = originalCacheMaxAge;
    }
    if (originalRateLimit === undefined) {
      delete process.env.OPENPENCIL_IMAGE_PROXY_RATE_LIMIT_PER_MINUTE;
    } else {
      process.env.OPENPENCIL_IMAGE_PROXY_RATE_LIMIT_PER_MINUTE = originalRateLimit;
    }
    jest.clearAllMocks();
  });

  it("响应 CORS 预检", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("拒绝非 HTTP 图片 URL", async () => {
    const response = await GET(
      createRequest("http://localhost/api/openpencil/image-proxy?url=file:///tmp/a.png"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain("HTTP/HTTPS");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("拒绝本机和内网地址", async () => {
    const response = await GET(
      createRequest("http://localhost/api/openpencil/image-proxy?url=http://127.0.0.1/a.png"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.message).toContain("本机、内网或保留地址");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("代理公开图片响应并补 CORS 缓存头", async () => {
    process.env.OPENPENCIL_IMAGE_PROXY_CACHE_MAX_AGE_SECONDS = "3600";
    jest.mocked(global.fetch).mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": "4",
        },
      }),
    );

    const response = await GET(
      createRequest(
        "http://localhost/api/openpencil/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png",
      ),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(Array.from(bytes)).toEqual([137, 80, 78, 71]);
    expect(global.fetch).toHaveBeenCalledWith(
      new URL("https://example.com/image.png"),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("带诊断上下文时写入图片代理审计摘要", async () => {
    process.env.OPENPENCIL_IMAGE_PROXY_CACHE_MAX_AGE_SECONDS = "7200";
    jest.mocked(global.fetch).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          "Content-Type": "image/png; charset=binary",
          "Content-Length": "4",
        },
      }),
    );

    const response = await GET(
      createRequest(
        [
          "http://localhost/api/openpencil/image-proxy",
          "?url=https%3A%2F%2Fexample.com%2Fprivate%2Fimage.png%3Ftoken%3Dsecret",
          "&editorSessionId=editor-session-1",
          "&projectId=project-1",
          "&sessionId=session-1",
          "&workspaceId=workspace-1",
          "&pageId=page-sketch",
          "&traceId=trace-image-proxy",
        ].join(""),
      ),
    );

    expect(response.status).toBe(200);
    expect(appendDiagnosticsMock).toHaveBeenCalledTimes(1);
    expect(appendDiagnosticsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        editorSessionId: "editor-session-1",
        projectId: "project-1",
        sessionId: "session-1",
        workspaceId: "workspace-1",
        activePageId: "page-sketch",
        category: "page",
        name: "page.openpencil_image_proxy",
        traceId: "trace-image-proxy",
        level: "info",
        details: expect.objectContaining({
          status: "proxied",
          success: true,
          inputHost: "example.com",
          finalHost: "example.com",
          httpStatus: 200,
          contentType: "image/png",
          contentLength: 4,
          cacheMaxAgeSeconds: 7200,
        }),
      }),
    ]);
    const event = appendDiagnosticsMock.mock.calls[0]?.[0]?.[0];
    expect(JSON.stringify(event)).not.toContain("private/image.png");
    expect(JSON.stringify(event)).not.toContain("token");
  });

  it("配置允许域名后拒绝不在列表里的图片 URL", async () => {
    process.env.OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS = "assets.example.com,*.trusted.test";

    const response = await GET(
      createRequest(
        "http://localhost/api/openpencil/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.message).toContain("不在允许代理列表");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("允许显式域名和通配子域名", async () => {
    process.env.OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS = "assets.example.com,*.trusted.test";
    jest.mocked(global.fetch).mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": "3",
        },
      }),
    );

    const response = await GET(
      createRequest(
        "http://localhost/api/openpencil/image-proxy?url=https%3A%2F%2Fcdn.trusted.test%2Fimage.webp",
      ),
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      new URL("https://cdn.trusted.test/image.webp"),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("重定向到不允许域名时拒绝代理", async () => {
    process.env.OPENPENCIL_IMAGE_PROXY_ALLOWED_HOSTS = "assets.example.com";
    jest.mocked(global.fetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location: "https://evil.example.com/image.png",
        },
      }),
    );

    const response = await GET(
      createRequest(
        [
          "http://localhost/api/openpencil/image-proxy",
          "?url=https%3A%2F%2Fassets.example.com%2Fimage.png",
          "&editorSessionId=editor-session-1",
          "&projectId=project-1",
          "&pageId=page-sketch",
        ].join(""),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.message).toContain("不在允许代理列表");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(appendDiagnosticsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "page.openpencil_image_proxy",
        level: "warn",
        details: expect.objectContaining({
          status: "blocked",
          success: false,
          reason: "blocked_target",
          inputHost: "assets.example.com",
          finalHost: "evil.example.com",
        }),
      }),
    ]);
  });

  it("配置限流后按客户端 IP 拒绝超额请求", async () => {
    process.env.OPENPENCIL_IMAGE_PROXY_RATE_LIMIT_PER_MINUTE = "2";
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Length": "1",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([2]), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Length": "1",
          },
        }),
      );

    const requestUrl =
      "http://localhost/api/openpencil/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.png";
    const headers = { "x-forwarded-for": "203.0.113.9" };

    const first = await GET(createRequest(requestUrl, headers));
    const second = await GET(createRequest(requestUrl, headers));
    const third = await GET(createRequest(requestUrl, headers));
    const body = await third.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(body.error.message).toContain("请求过于频繁");
    expect(third.headers.get("Retry-After")).toBeTruthy();
    expect(third.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("拒绝非图片响应", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      }),
    );

    const response = await GET(
      createRequest(
        "http://localhost/api/openpencil/image-proxy?url=https%3A%2F%2Fexample.com%2Findex.html",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error.message).toContain("不是图片资源");
  });
});

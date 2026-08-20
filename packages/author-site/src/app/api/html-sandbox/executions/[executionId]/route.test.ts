import type { NextRequest } from "next/server";

const readHtmlSandboxExecution = jest.fn();
const buildHtmlSandboxExecutionDocument = jest.fn(() => "<!doctype html><html><body>wrapped</body></html>");
const getHtmlSandboxResponseHeaders = jest.fn(() => ({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors http://localhost:4200;",
  "Permissions-Policy": "camera=()",
  "Cache-Control": "no-store",
}));
const resolveHtmlSandboxFrameAncestors = jest.fn(() => ["http://localhost:4200"]);

jest.mock("@/lib/html-sandbox-execution", () => ({
  readHtmlSandboxExecution,
  buildHtmlSandboxExecutionDocument,
  getHtmlSandboxResponseHeaders,
  resolveHtmlSandboxFrameAncestors,
}));

function request(headers: Record<string, string> = {}): NextRequest {
  return new Request("http://127.0.0.1:4200/api/html-sandbox/executions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {
    headers,
  }) as unknown as NextRequest;
}

describe("HTML sandbox execution GET route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveHtmlSandboxFrameAncestors.mockReturnValue(["http://localhost:4200"]);
  });

  it("only serves execution documents to iframe fetches", async () => {
    const { GET } = await import("./route");
    const response = await GET(request(), {
      params: Promise.resolve({ executionId: "a".repeat(32) }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(readHtmlSandboxExecution).not.toHaveBeenCalled();
  });

  it("returns no-store 404 for missing or expired opaque tickets", async () => {
    readHtmlSandboxExecution.mockReturnValue(null);
    const { GET } = await import("./route");
    const response = await GET(request({ "sec-fetch-dest": "iframe" }), {
      params: Promise.resolve({ executionId: "b".repeat(32) }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "HTML_RUNTIME_FAILED" } });
  });

  it("wraps valid tickets with browser isolation headers", async () => {
    readHtmlSandboxExecution.mockReturnValue({
      executionId: "c".repeat(32),
      channelId: "d".repeat(32),
      html: "<button>safe</button>",
      createdAt: 1,
      expiresAt: Date.now() + 10_000,
      sandboxPolicyVersion: 1,
    });
    const { GET } = await import("./route");
    const response = await GET(request({ "sec-fetch-dest": "iframe" }), {
      params: Promise.resolve({ executionId: "c".repeat(32) }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("wrapped");
    expect(buildHtmlSandboxExecutionDocument).toHaveBeenCalled();
    expect(getHtmlSandboxResponseHeaders).toHaveBeenCalledWith(["http://localhost:4200"]);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed when production has no frame ancestor allowlist", async () => {
    readHtmlSandboxExecution.mockReturnValue({
      executionId: "e".repeat(32),
      channelId: "f".repeat(32),
      html: "<p>safe</p>",
      createdAt: 1,
      expiresAt: Date.now() + 10_000,
      sandboxPolicyVersion: 1,
    });
    resolveHtmlSandboxFrameAncestors.mockReturnValue([]);
    const { GET } = await import("./route");
    const response = await GET(request({ "sec-fetch-dest": "iframe" }), {
      params: Promise.resolve({ executionId: "e".repeat(32) }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "HTML_RUNTIME_FAILED" } });
    expect(buildHtmlSandboxExecutionDocument).not.toHaveBeenCalled();
  });
});

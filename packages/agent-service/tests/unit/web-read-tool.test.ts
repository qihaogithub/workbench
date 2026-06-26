import { lookup } from "node:dns/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch, Response } from "undici";
import { createWebReadTool } from "../../src/backends/pi-tools/web-read-tool";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: vi.fn(),
  };
});

const fetchMock = vi.mocked(fetch);
const lookupMock = vi.mocked(lookup);

describe("webRead tool", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      PI_AGENT_WEB_READ_TIMEOUT_MS: "10000",
      PI_AGENT_WEB_READ_MAX_BYTES: "1000000",
    };
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("拒绝 localhost URL", async () => {
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "http://localhost/admin",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("本机、内网或保留地址");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("拒绝解析到内网地址的域名", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.2", family: 4 }]);
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/page",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("解析到本机、内网或保留地址");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("成功读取 HTML 并提取正文", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        `<!doctype html>
        <html>
          <head>
            <title>Example &amp; Test</title>
            <meta name="description" content="A useful page">
            <link rel="canonical" href="https://example.com/canonical">
            <style>.hidden { display: none; }</style>
            <script>window.secret = true;</script>
          </head>
          <body>
            <main><h1>Hello</h1><p>Readable &lt;content&gt; here.</p></main>
          </body>
        </html>`,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
    );
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/page",
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Title: Example & Test");
    expect(result.content[0].text).toContain("Readable <content> here.");
    expect(result.content[0].text).not.toContain("window.secret");
    expect(result.details).toMatchObject({
      finalUrl: "https://example.com/page",
      title: "Example & Test",
      description: "A useful page",
      canonicalUrl: "https://example.com/canonical",
      truncated: false,
    });
  });

  it("拒绝跳转到内网地址", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    );
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/redirect",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("本机、内网或保留地址");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("拒绝非文本内容", async () => {
    fetchMock.mockResolvedValue(
      new Response("png", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/image.png",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("不是可读取的文本或 HTML 内容");
  });

  it("按 content-length 拒绝过大响应", async () => {
    process.env.PI_AGENT_WEB_READ_MAX_BYTES = "10";
    fetchMock.mockResolvedValue(
      new Response("too large", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "11",
        },
      }),
    );
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/large.txt",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("response_too_large");
  });

  it("按 maxCharacters 截断返回文本", async () => {
    fetchMock.mockResolvedValue(
      new Response("x".repeat(1200), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/long.txt",
      maxCharacters: 1000,
    });

    expect(result.isError).toBeFalsy();
    expect(result.details.truncated).toBe(true);
    expect(result.details.charactersReturned).toBe(1000);
    expect(result.content[0].text).toContain("内容已按 maxCharacters 截断");
  });

  it("网络错误返回稳定中文错误", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/down",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("socket hang up");
  });

  it("请求超时返回稳定中文错误", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);
    const tool = createWebReadTool();

    const result = await tool.execute("read-1", {
      url: "https://example.com/slow",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("网页读取超时");
  });
});

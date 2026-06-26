import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch, Response } from "undici";
import {
  clearWebSearchCache,
  createWebSearchTool,
} from "../../src/backends/pi-tools/web-search-tool";

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: vi.fn(),
  };
});

const fetchMock = vi.mocked(fetch);

describe("webSearch tool", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    clearWebSearchCache();
    process.env = {
      ...originalEnv,
      BRAVE_SEARCH_API_KEY: "test-brave-key",
      PI_AGENT_WEB_SEARCH_TIMEOUT_MS: "10000",
      PI_AGENT_WEB_SEARCH_CACHE_TTL_MS: "600000",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    clearWebSearchCache();
  });

  it("未配置 key 时返回配置错误", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const tool = createWebSearchTool();

    const result = await tool.execute("search-1", {
      query: "OpenCode Workbench",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("未配置 Brave Search API key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("成功解析 Brave web results", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "OpenCode Workbench",
                url: "https://example.com/workbench",
                description: "A workbench result",
                age: "2 days ago",
                page_age: "2026-06-24",
                profile: { name: "Example" },
                meta_url: { hostname: "example.com" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const tool = createWebSearchTool();

    const result = await tool.execute("search-1", {
      query: "OpenCode Workbench",
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("OpenCode Workbench");
    expect(result.content[0].text).toContain("https://example.com/workbench");
    expect(result.details.results).toEqual([
      {
        title: "OpenCode Workbench",
        url: "https://example.com/workbench",
        description: "A workbench result",
        source: "Example",
        age: "2 days ago",
        publishedAt: "2026-06-24",
      },
    ]);
  });

  it("count 使用默认值并限制最大值", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ web: { results: [] } }), { status: 200 }),
    );
    const tool = createWebSearchTool();

    await tool.execute("search-1", { query: "default count" });
    await tool.execute("search-2", { query: "max count", count: 99 });

    const defaultUrl = fetchMock.mock.calls[0]?.[0];
    const maxUrl = fetchMock.mock.calls[1]?.[0];
    expect(defaultUrl).toBeInstanceOf(URL);
    expect(maxUrl).toBeInstanceOf(URL);
    if (!(defaultUrl instanceof URL) || !(maxUrl instanceof URL)) {
      throw new Error("Expected webSearch to call fetch with URL objects");
    }
    expect(defaultUrl.searchParams.get("count")).toBe("5");
    expect(maxUrl.searchParams.get("count")).toBe("10");
  });

  it("429 返回免费额度或限流错误", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));
    const tool = createWebSearchTool();

    const result = await tool.execute("search-1", {
      query: "quota",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("免费额度或频率限制");
  });

  it("网络错误返回稳定中文错误", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const tool = createWebSearchTool();

    const result = await tool.execute("search-1", {
      query: "network",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("网络请求失败");
  });

  it("请求超时返回稳定中文错误", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);
    const tool = createWebSearchTool();

    const result = await tool.execute("search-1", {
      query: "timeout",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("请求超时");
  });

  it("缓存命中时不重复请求 Brave", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Cached",
                url: "https://example.com/cached",
                description: "Cached result",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const tool = createWebSearchTool();

    const first = await tool.execute("search-1", {
      query: "same query",
    });
    const second = await tool.execute("search-2", {
      query: "same query",
    });

    expect(first.isError).toBeFalsy();
    expect(second.isError).toBeFalsy();
    expect(second.details.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

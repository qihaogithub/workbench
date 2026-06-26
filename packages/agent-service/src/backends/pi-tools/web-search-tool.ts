import { Type, type Static } from "typebox";
import { fetch } from "undici";
import type { AgentTool } from "@earendil-works/pi-agent-core";

const BRAVE_WEB_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_COUNT = 5;
const MAX_RESULT_COUNT = 10;
const MAX_QUERY_LENGTH = 500;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TTL_MS = 600_000;
const MAX_CACHE_ENTRIES = 100;

interface SearchCacheEntry {
  expiresAt: number;
  results: WebSearchResult[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  source?: string;
  age?: string;
  publishedAt?: string;
}

interface BraveWebSearchItem {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  age?: unknown;
  page_age?: unknown;
  profile?: {
    name?: unknown;
  };
  meta_url?: {
    hostname?: unknown;
  };
}

interface BraveWebSearchResponse {
  web?: {
    results?: BraveWebSearchItem[];
  };
}

const cache = new Map<string, SearchCacheEntry>();

const WebSearchParams = Type.Object({
  query: Type.String({
    description: "Search query. Keep it concise and specific. Maximum 500 characters.",
  }),
  count: Type.Optional(
    Type.Number({
      description: "Number of search results to return. Defaults to 5, maximum 10.",
      minimum: 1,
      maximum: MAX_RESULT_COUNT,
    }),
  ),
});

type WebSearchParams = Static<typeof WebSearchParams>;

export function isWebSearchEnabled(): boolean {
  return process.env.PI_AGENT_WEB_SEARCH_ENABLED === "true";
}

export function clearWebSearchCache(): void {
  cache.clear();
}

export function createWebSearchTool(): AgentTool<typeof WebSearchParams> {
  return {
    name: "webSearch",
    label: "Web Search",
    description:
      "Search the public web through Brave Search. Returns result titles, URLs, snippets, sources, and time metadata. Does not fetch page bodies.",
    parameters: WebSearchParams,
    execute: async (_toolCallId: string, args: WebSearchParams) => {
      const query = args.query.trim();
      if (!query) {
        return errorResult("Error: 搜索关键词不能为空。", {
          error: "empty_query",
        });
      }
      if (query.length > MAX_QUERY_LENGTH) {
        return errorResult(`Error: 搜索关键词不能超过 ${MAX_QUERY_LENGTH} 个字符。`, {
          error: "query_too_long",
          maxLength: MAX_QUERY_LENGTH,
        });
      }

      const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
      if (!apiKey) {
        return errorResult(
          "Error: 未配置 Brave Search API key。请设置 BRAVE_SEARCH_API_KEY，并确认 PI_AGENT_WEB_SEARCH_ENABLED=true。",
          { error: "missing_api_key" },
        );
      }

      const count = normalizeCount(args.count);
      const cacheKey = `${count}:${query.toLowerCase()}`;
      const cached = getCachedResults(cacheKey);
      if (cached) {
        return successResult(query, cached, true);
      }

      const timeoutMs = readPositiveIntegerEnv(
        "PI_AGENT_WEB_SEARCH_TIMEOUT_MS",
        DEFAULT_TIMEOUT_MS,
      );
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      timeoutId.unref?.();

      try {
        const url = new URL(BRAVE_WEB_SEARCH_ENDPOINT);
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(count));
        url.searchParams.set("text_decorations", "false");
        url.searchParams.set("spellcheck", "true");

        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": apiKey,
          },
        });

        if (!response.ok) {
          return errorResult(statusMessage(response.status), {
            error: "http_error",
            status: response.status,
          });
        }

        const data = await response.json();
        const results = parseBraveResults(data);
        setCachedResults(cacheKey, results);

        return successResult(query, results, false);
      } catch (error) {
        const message =
          error instanceof Error && error.name === "AbortError"
            ? `Error: Brave Search 请求超时（${timeoutMs}ms）。`
            : "Error: Brave Search 网络请求失败，请稍后重试。";
        return errorResult(message, {
          error: error instanceof Error && error.name === "AbortError"
            ? "timeout"
            : "network_error",
        });
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

function normalizeCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_RESULT_COUNT;
  }
  return Math.min(MAX_RESULT_COUNT, Math.max(1, Math.floor(value)));
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getCacheTtlMs(): number {
  return readPositiveIntegerEnv(
    "PI_AGENT_WEB_SEARCH_CACHE_TTL_MS",
    DEFAULT_CACHE_TTL_MS,
  );
}

function getCachedResults(cacheKey: string): WebSearchResult[] | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  cache.delete(cacheKey);
  cache.set(cacheKey, entry);
  return entry.results;
}

function setCachedResults(cacheKey: string, results: WebSearchResult[]): void {
  cache.set(cacheKey, {
    expiresAt: Date.now() + getCacheTtlMs(),
    results,
  });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function parseBraveResults(data: unknown): WebSearchResult[] {
  if (!isRecord(data)) return [];
  const response = data as BraveWebSearchResponse;
  const items = response.web?.results;
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      title: stringValue(item.title),
      url: stringValue(item.url),
      description: stringValue(item.description),
      source:
        stringValue(item.profile?.name) ||
        stringValue(item.meta_url?.hostname) ||
        undefined,
      age: stringValue(item.age) || undefined,
      publishedAt: stringValue(item.page_age) || undefined,
    }))
    .filter((item) => item.title && item.url)
    .slice(0, MAX_RESULT_COUNT);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function successResult(
  query: string,
  results: WebSearchResult[],
  cached: boolean,
): {
  content: Array<{ type: "text"; text: string }>;
  details: {
    provider: "brave";
    query: string;
    cached: boolean;
    resultCount: number;
    results: WebSearchResult[];
  };
} {
  const text = formatResults(query, results, cached);
  return {
    content: [{ type: "text", text }],
    details: {
      provider: "brave",
      query,
      cached,
      resultCount: results.length,
      results,
    },
  };
}

function errorResult(
  text: string,
  details: Record<string, unknown>,
): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
  isError: true;
} {
  return {
    content: [{ type: "text", text }],
    details,
    isError: true,
  };
}

function formatResults(
  query: string,
  results: WebSearchResult[],
  cached: boolean,
): string {
  if (results.length === 0) {
    return `Brave Search results for "${query}"${cached ? " (cached)" : ""}:\n未找到搜索结果。`;
  }

  const lines = [`Brave Search results for "${query}"${cached ? " (cached)" : ""}:`];
  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);
    if (result.description) lines.push(`   Summary: ${result.description}`);
    if (result.source) lines.push(`   Source: ${result.source}`);
    if (result.age) lines.push(`   Time: ${result.age}`);
    if (result.publishedAt) lines.push(`   Published: ${result.publishedAt}`);
  }
  return lines.join("\n");
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Error: Brave Search API key 无效、未授权或权限不足。";
  }
  if (status === 429) {
    return "Error: Brave Search 免费额度或频率限制已触发，请稍后重试或检查额度。";
  }
  if (status >= 500) {
    return "Error: Brave Search 服务暂时不可用，请稍后重试。";
  }
  return `Error: Brave Search 请求失败（HTTP ${status}）。`;
}

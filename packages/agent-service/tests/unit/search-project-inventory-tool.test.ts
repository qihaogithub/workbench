import { afterEach, describe, expect, it, vi } from "vitest";
import { createSearchProjectInventoryTool } from "../../src/backends/pi-tools/search-project-inventory-tool";
import type { AgentConfig } from "../../src/core/types";

const config: AgentConfig = {
  sessionId: "session-1",
  projectId: "project-1",
  authorAuthorization: {
    userId: "user-1",
    projectId: "project-1",
    role: "editor",
    expiresAt: Date.now() + 60_000,
    source: "author-session",
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("searchProjectInventory", () => {
  it("sends only bounded query filters and preserves the read-only boundary", async () => {
    vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "internal");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {
      entries: [{ canonicalUri: "wb://page/project-1/home", targetAvailability: "available" }],
      freshness: "fresh", total: 1, nextCursor: null, truncated: false,
    } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const result = await createSearchProjectInventoryTool(config).execute("call", {
      query: "checkout",
      resourceTypes: ["page"],
      limit: 10,
    });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("项目清单");
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({ projectId: "project-1", sessionId: "session-1", query: "checkout", resourceTypes: ["page"], limit: 10 });
    expect(body).not.toHaveProperty("tags");
    expect(body).not.toHaveProperty("roles");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-internal-token": "internal", "x-agent-session-id": "session-1" });
  });

  it("fails closed without author authorization", async () => {
    const result = await createSearchProjectInventoryTool({ ...config, authorAuthorization: null }).execute("call", {});
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ status: "unavailable" });
  });
});

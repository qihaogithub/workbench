import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadProjectReferenceTool, describeMarkdownReferences, requestProjectReference } from "../../src/backends/pi-tools/markdown-reference-tool";
import type { AgentConfig } from "../../src/core/types";

const config: AgentConfig = { sessionId: "session", projectId: "source", authorAuthorization: {
  userId: "u", role: "editor", projectId: "source", expiresAt: Date.now() + 100_000, source: "author-session",
} };
function service(data: unknown, status = 200) {
  vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
  vi.stubEnv("INTERNAL_API_TOKEN", "test-token");
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: status === 200, data }), { status }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Markdown reference discovery and authorized reads", () => {
  it("deduplicates real links and skips code, without declaring contents read", () => {
    const result = describeMarkdownReferences('[品牌](wb://project/b) [重复](wb://project/b) ` [代码](wb://project/c) `');
    expect(result.match(/wb:\/\/project\/b/g)).toHaveLength(1);
    expect(result).not.toContain("wb://project/c");
    expect(result).toContain("尚未读取");
  });
  it("binds trusted source identity and does not change session to target", async () => {
    const fetcher = service({ uri: "wb://project/b", content: "目录", truncated: false });
    await requestProjectReference(config, { uri: "wb://project/b" });
    const init = fetcher.mock.calls[0][1];
    expect(JSON.parse(init.body)).toMatchObject({ ownerUserId: "u", sourceProjectId: "source", sessionId: "session", uri: "wb://project/b" });
    expect(init.redirect).toBe("error");
  });
  it.each([
    { ...config, authorAuthorization: null },
    { ...config, authorAuthorization: { ...config.authorAuthorization!, expiresAt: 0 } },
    { ...config, projectId: "other" },
    { ...config, toolMode: "viewer-readonly" as const },
  ])("fails closed before a request for unverified contexts", async invalid => {
    const fetcher = service({});
    await expect(requestProjectReference(invalid, { uri: "wb://project/b" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects malformed URI before network", async () => {
    const fetcher = service({});
    await expect(requestProjectReference(config, { uri: "file:///etc/passwd" })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns actual pixels with provenance but not pixels in details", async () => {
    service({ uri: "wb://project/b", assetId: "image", mimeType: "image/png", dataBase64: "aGVsbG8=" });
    const result = await createReadProjectReferenceTool(config).execute("id", { uri: "wb://project/b", assetId: "image" });
    expect(result.content).toContainEqual({ type: "image", mimeType: "image/png", data: "aGVsbG8=" });
    expect(JSON.stringify(result.details)).not.toContain("aGVsbG8=");
  });
  it("does not present a denied read as usable content or expose server errors", async () => {
    service({ content: "/private/secret" }, 403);
    const result = await createReadProjectReferenceTool(config).execute("id", { uri: "wb://project/b" });
    expect(result).toHaveProperty("isError", true);
    expect(JSON.stringify(result)).not.toContain("/private/secret");
  });
});

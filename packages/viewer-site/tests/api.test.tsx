import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectData, normalizePublishedDesignSpecDoc, resolveDataBase } from "../src/lib/api";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

describe("resolveDataBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the local author-site data endpoint during development", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDataBase({})).toBe("http://localhost:4200");
  });

  it("ignores development data endpoint when building the Docker viewer", () => {
    expect(
      resolveDataBase({
        NEXT_PUBLIC_DATA_BASE: "http://localhost:4200",
        NEXT_PUBLIC_VIEWER_DOCKER_MODE: "true",
      }),
    ).toBe("");
  });
});

describe("getProjectData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("仅在独立规则资产通过哈希与版本校验后注入规则", async () => {
    const content = JSON.stringify({ version: 1, rules: [] }, null, 2) + "\n";
    const sha256 = createHash("sha256").update(content).digest("hex");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/data/project-1/project.json")) {
        return jsonResponse({
          id: "project-1",
          name: "项目一",
          publishedVersion: "v1",
          publishedAt: 1,
          demoPages: [],
          demoFolders: [],
          visibilityRulesRef: { path: "visibility-rules.json", sha256, version: 1 },
        });
      }
      if (url.endsWith("/data/project-1/visibility-rules.json")) {
        return new Response(content);
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const project = await getProjectData("project-1");

    expect(project.visibilityRules).toEqual({ version: 1, rules: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("规则资产被篡改时拒绝加载发布快照", async () => {
    const content = JSON.stringify({ version: 1, rules: [] });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/project.json")) {
        return jsonResponse({
          id: "project-1",
          name: "项目一",
          publishedVersion: "v1",
          publishedAt: 1,
          demoPages: [],
          demoFolders: [],
          visibilityRulesRef: {
            path: "visibility-rules.json",
            sha256: "0".repeat(64),
            version: 1,
          },
        });
      }
      return new Response(content);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProjectData("project-1")).rejects.toThrow(
      "页面状态规则完整性校验失败",
    );
  });
});

describe("normalizePublishedDesignSpecDoc", () => {
  it("converts legacy refs into the current config target", () => {
    expect(normalizePublishedDesignSpecDoc({
      id: "spec-legacy",
      entries: [{
        id: "entry-1",
        title: "图片",
        refs: [
          { scope: "page", pageId: "page-1", fieldKey: "heroImage" },
          { scope: "page", pageId: "page-1", fieldKey: "heroImage" },
        ],
      }],
    }).entries[0]).toEqual({
      id: "entry-1",
      title: "图片",
      markdown: "",
      target: {
        type: "config",
        refs: [{ scope: "page", pageId: "page-1", fieldKey: "heroImage" }],
      },
    });
  });
});

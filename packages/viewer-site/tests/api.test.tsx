import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizePublishedDesignSpecDoc, resolveDataBase } from "../src/lib/api";

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

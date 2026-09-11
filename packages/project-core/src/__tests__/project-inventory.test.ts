import { describe, expect, it } from "vitest";
import {
  buildProjectInventory,
  validateInventoryOverrides,
} from "../project-inventory.js";
import { PROJECT_INVENTORY_GENERATOR_VERSION, PROJECT_INVENTORY_SCHEMA_VERSION, type InventoryGeneratedSemantic, type InventoryOverridesFile } from "@workbench/shared";
import { encodeMarkdownReferenceUri } from "@workbench/shared/markdown-reference";

describe("project inventory", () => {
  const pageId = "营销/入口 页面";
  const pageUri = encodeMarkdownReferenceUri({ kind: "page", projectId: "p1", pageId });

  function build(overrides?: unknown, generated?: ReadonlyMap<string, InventoryGeneratedSemantic>) {
    return buildProjectInventory({
      project: { id: "p1", name: "活动项目", description: "入口项目" },
      pages: [{
        id: pageId,
        name: "活动入口",
        routeKey: "campaign-entry",
        runtimeType: "high-fidelity-react",
        schema: JSON.stringify({
          properties: {
            cards: {
              type: "array",
              title: "卡片",
              items: { properties: { title: { type: "string", title: "标题" } } },
            },
          },
        }),
      }],
      documents: [{
        id: "doc-1",
        title: "投放说明",
        fileName: "投放说明.md",
        description: "说明",
      }],
      governanceDocuments: [{
        documentKind: "page-convention",
        id: pageId,
        pageId,
        title: "活动入口公约",
      }],
      externalDeclarations: [{
        source: { kind: "page-requirements", projectId: "p1", workspaceId: "w1", pageId },
        target: { kind: "page", projectId: "p2", pageId: "首页" },
        labelSnapshot: "外部首页",
        start: 0,
        end: 10,
        line: 1,
        column: 1,
        targetState: "active",
      }],
      workspaceRevision: 12,
      workspaceRootHash: "root-12",
      overrides: overrides as InventoryOverridesFile | undefined,
      generated,
    });
  }

  it("builds project/page/config/document/governance and referenced entries", () => {
    const result = build();
    const uris = result.snapshot.entries.map((entry) => entry.canonicalUri);
    expect(uris).toContain("wb://project/p1");
    expect(uris).toContain(pageUri);
    expect(uris.some((uri) => uri.includes("wb://config/p1/"))).toBe(true);
    expect(uris).toContain("wb://document/p1/doc-1");
    expect(uris.some((uri) => uri.includes("page-convention"))).toBe(true);
    expect(result.snapshot.entries.find((entry) => entry.scope === "referenced")?.declarations).toHaveLength(1);
    expect(result.generationRequests.map((request) => request.canonicalUri)).toEqual(
      expect.arrayContaining(["wb://project/p1", pageUri]),
    );
    const config = result.snapshot.entries.find((entry) => entry.resourceType === "config");
    expect(config?.native.metadata).not.toHaveProperty("default");
  });

  it("preserves field-level null fallback and empty-array clearing", () => {
    const result = build({
      schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
      entries: {
        [pageUri]: { summary: null },
      },
    });
    const entry = result.snapshot.entries.find((item) => item.canonicalUri === pageUri);
    expect(entry?.human.summary).toBeNull();
  });

  it("reuses only generated annotations with a matching source fingerprint", () => {
    const first = build();
    const request = first.generationRequests.find((item) => item.canonicalUri === pageUri)!;
    const generated = {
      summary: "活动导流入口",
      sourceFingerprint: request.sourceFingerprint,
      contentHash: "generated-hash",
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      generatedAt: "2026-09-11T00:00:00.000Z",
      evidenceRefs: request.evidenceRefs,
    };
    const second = build();
    const withGenerated = build(undefined, new Map([[pageUri, generated]]));
    expect(withGenerated.snapshot.entries.find((item) => item.canonicalUri === pageUri)?.generated).toEqual(generated);
    expect(second.snapshot.catalogFingerprint).toBe(first.snapshot.catalogFingerprint);
  });

  it("retains stale generated text while queueing a new source fingerprint", () => {
    const first = build();
    const request = first.generationRequests.find((item) => item.canonicalUri === pageUri)!;
    const stale = {
      summary: "上一版入口摘要",
      sourceFingerprint: request.sourceFingerprint,
      contentHash: "old-generated-hash",
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      generatedAt: "2026-09-11T00:00:00.000Z",
      evidenceRefs: request.evidenceRefs,
    } satisfies InventoryGeneratedSemantic;
    const rebuilt = build(undefined, new Map([[pageUri, stale]]));
    const page = rebuilt.snapshot.entries.find((item) => item.canonicalUri === pageUri);
    expect(page?.generated).toEqual(stale);
    expect(page?.generationState).toBe("ready");
    expect(rebuilt.generationRequests.filter((item) => item.canonicalUri === pageUri)).toEqual([]);

    const changed = build(undefined, new Map([[pageUri, { ...stale, sourceFingerprint: "changed-source" }]]));
    const changedPage = changed.snapshot.entries.find((item) => item.canonicalUri === pageUri);
    expect(changedPage?.generated).toEqual({ ...stale, sourceFingerprint: "changed-source" });
    expect(changedPage?.generationState).toBe("pending");
    expect(changed.generationRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalUri: pageUri }),
    ]));
  });

  it("keeps removed local resources as deleted entries when rebuilding from a prior snapshot", () => {
    const previous = build().snapshot;
    const rebuilt = buildProjectInventory({
      project: { id: "p1", name: "活动项目" },
      pages: [],
      previous: new Map(previous.entries.map((item) => [item.canonicalUri, item])),
    });
    const deleted = rebuilt.snapshot.entries.find((item) => item.canonicalUri === pageUri);
    expect(deleted?.sourceState).toBe("deleted");
    expect(deleted?.generationState).toBe("disabled");
  });

  it("rejects unknown overlay fields", () => {
    expect(() => validateInventoryOverrides({
      schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
      entries: { "wb://page/p1/a": { nope: true } },
    })).toThrow("INVENTORY_OVERRIDES_UNKNOWN_FIELD");
    expect(() => validateInventoryOverrides({
      schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
      entries: { "wb://page/p1/a": { displayName: "旧名称" } },
    })).toThrow("INVENTORY_OVERRIDES_UNKNOWN_FIELD");
    expect(() => validateInventoryOverrides({
      schemaVersion: 1,
      entries: { "wb://page/p1/a": { summary: "旧版本简介" } },
    })).toThrow("INVENTORY_OVERRIDES_INVALID");
  });
});

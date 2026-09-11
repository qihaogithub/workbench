import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT_INVENTORY_GENERATOR_VERSION, PROJECT_INVENTORY_SCHEMA_VERSION, type InventoryEntry, type InventorySnapshot } from "@workbench/shared";
import { SqliteInventoryCatalog } from "../inventory-catalog.js";
import { runInventoryGeneration } from "../inventory-generation.js";
import { normalizeInventoryHuman } from "../shared-runtime.js";

const openCatalogs: SqliteInventoryCatalog[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const catalog of openCatalogs.splice(0)) catalog.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function entry(overrides: Partial<InventoryEntry>): InventoryEntry {
  return {
    canonicalUri: "wb://page/p1/home",
    resourceType: "page",
    scope: "local",
    parentUri: "wb://project/p1",
    refreshMode: "auto",
    native: { name: "首页", aliases: ["home"], description: null, metadata: {} },
    generated: null,
    human: normalizeInventoryHuman(undefined),
    sourceState: "active",
    generationState: "pending",
    reviewState: "unreviewed",
    ...overrides,
  };
}

function snapshot(entries: InventoryEntry[]): InventorySnapshot {
  return {
    schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
    projectId: "p1",
    workspaceRevision: 3,
    workspaceRootHash: "root-3",
    catalogFingerprint: "catalog-3",
    overlayHash: "overlay-0",
    projectionFingerprint: "projection-3",
    generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
    builtAt: "2026-09-11T00:00:00.000Z",
    freshness: "fresh",
    entries,
  };
}

function catalog(): SqliteInventoryCatalog {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-catalog-"));
  tempDirs.push(dir);
  const value = new SqliteInventoryCatalog({ dataDir: dir });
  openCatalogs.push(value);
  return value;
}

describe("SqliteInventoryCatalog", () => {
  it("publishes an active generation and searches resolved semantic fields", () => {
    const value = catalog();
    value.publish(snapshot([
      entry({ canonicalUri: "wb://project/p1", resourceType: "project", parentUri: null, native: { name: "活动项目", aliases: [], description: null, metadata: {} }, generationState: "pending" }),
      entry({ canonicalUri: "wb://page/p1/home", native: { name: "活动入口", aliases: ["campaign-entry"], description: "用于投放的入口", metadata: {} } }),
      entry({ canonicalUri: "wb://config/p1/home/title", resourceType: "config", parentUri: "wb://page/p1/home", refreshMode: "manual", native: { name: "标题", aliases: ["title"], description: null, metadata: { type: "string" } }, generationState: "not_required", reviewState: "not_required" }),
    ]));
    const result = value.search({ projectId: "p1", query: "投放" });
    expect(result.freshness).toBe("fresh");
    expect(result.total).toBe(1);
    expect(result.entries[0]?.canonicalUri).toBe("wb://page/p1/home");
    expect(result.entries[0]?.targetAvailability).toBe("available");
    expect(result.entries[0]?.matchedBy.some((reason) => reason.field === "summary")).toBe(true);
    expect(value.search({ projectId: "p1", query: "page" }).entries[0]?.matchedBy.some((reason) => reason.field === "resourceType")).toBe(true);
    expect(value.search({ projectId: "p1", query: "local" }).total).toBe(3);
  });

  it("replaces active generations atomically and preserves only the newest snapshot", () => {
    const value = catalog();
    value.publish(snapshot([entry({})]));
    value.publish(snapshot([entry({ canonicalUri: "wb://page/p1/new", native: { name: "新页面", aliases: [], description: null, metadata: {} } })]));
    expect(value.activeSnapshot("p1")?.entries.map((item) => item.canonicalUri)).toEqual(["wb://page/p1/new"]);
    expect(value.stats().activeProjects).toBe(1);
  });

  it("rejects stale annotation results for a changed active source", () => {
    const value = catalog();
    value.publish(snapshot([entry({})]));
    expect(value.applyAnnotation({
      projectId: "p1",
      canonicalUri: "wb://page/p1/home",
      sourceFingerprint: "old-source",
      generated: {
        summary: "旧摘要",
        sourceFingerprint: "old-source",
        contentHash: "old-content",
        generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
        generatedAt: "2026-09-11T00:00:00.000Z",
        evidenceRefs: [],
      },
    })).toBe(true);
    expect(value.search({ projectId: "p1", query: "旧摘要" }).total).toBe(1);
    expect(value.applyAnnotation({
      projectId: "p1",
      canonicalUri: "wb://page/p1/home",
      sourceFingerprint: "new-source",
      generated: {
        summary: "不应覆盖",
        sourceFingerprint: "new-source",
        contentHash: "new-content",
        generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
        generatedAt: "2026-09-11T00:00:00.000Z",
        evidenceRefs: [],
      },
    })).toBe(false);
  });

  it("claims evidence-bounded jobs and writes fixed generated JSON", async () => {
    const value = catalog();
    const source = entry({
      generationState: "pending",
      native: { name: "入口", aliases: [], description: null, metadata: {} },
    });
    value.publish(snapshot([source]));
    value.createGenerationJobs("p1", [{ canonicalUri: source.canonicalUri, sourceFingerprint: "fp-1", evidenceRefs: [{ sourceUri: source.canonicalUri, sourceKind: "page-schema", contentHash: "hash", selector: "schema" }] }], PROJECT_INVENTORY_GENERATOR_VERSION);
    const result = await runInventoryGeneration(value, "p1", { read: async () => "不可信证据" }, {
      generate: async ({ evidence }) => {
        expect(evidence[0]?.content).toBe("不可信证据");
        return { summary: "可用于活动入口" };
      },
    });
    expect(result).toMatchObject({ claimed: 1, ready: 1, failed: 0 });
    expect(value.activeSnapshot("p1")?.entries[0]?.generated).toMatchObject({ summary: "可用于活动入口", sourceFingerprint: "fp-1", evidenceRefs: [{ selector: "schema" }] });
  });

  it("limits UTF-8 evidence by bytes before invoking the generator", async () => {
    const value = catalog();
    const source = entry({ generationState: "pending" });
    value.publish(snapshot([source]));
    value.createGenerationJobs("p1", [{ canonicalUri: source.canonicalUri, sourceFingerprint: "fp-bytes", evidenceRefs: [{ sourceUri: source.canonicalUri, sourceKind: "page-schema", contentHash: "hash", selector: "schema" }] }], PROJECT_INVENTORY_GENERATOR_VERSION);
    await runInventoryGeneration(value, "p1", { read: async () => "证据".repeat(10_000) }, {
      generate: async ({ evidence }) => {
        expect(Buffer.byteLength(evidence[0]?.content ?? "", "utf8")).toBeLessThanOrEqual(8 * 1024);
        return { summary: "摘要" };
      },
    });
    expect(value.activeSnapshot("p1")?.entries[0]?.generationState).toBe("ready");
  });
});

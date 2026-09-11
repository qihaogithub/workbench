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
    expect(value.generationActivity("p1")).toBe("idle");
    value.publish(snapshot([entry({ canonicalUri: "wb://page/p1/new", native: { name: "新页面", aliases: [], description: null, metadata: {} } })]));
    expect(value.activeSnapshot("p1")?.entries.map((item) => item.canonicalUri)).toEqual(["wb://page/p1/new"]);
    expect(value.stats().activeProjects).toBe(1);
  });

  it("rejects late annotation results after the active generation changes", () => {
    const value = catalog();
    const firstGeneration = value.publish(snapshot([entry({ generationState: "pending" })]));
    value.createGenerationJobs({
      projectId: "p1",
      workspaceId: "w1",
      generationId: firstGeneration,
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      requests: [{ canonicalUri: "wb://page/p1/home", sourceFingerprint: "old-source", evidenceRefs: [] }],
    });
    expect(value.generationActivity("p1")).toBe("active");
    const [oldJob] = value.claimGenerationJobs();
    expect(oldJob).toBeDefined();
    const secondGeneration = value.publish(snapshot([entry({ generationState: "pending" })]));
    value.createGenerationJobs({
      projectId: "p1",
      workspaceId: "w1",
      generationId: secondGeneration,
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      requests: [{ canonicalUri: "wb://page/p1/home", sourceFingerprint: "new-source", evidenceRefs: [] }],
    });
    expect(value.completeGenerationJob({ job: oldJob!, generated: {
      summary: "不应覆盖",
      sourceFingerprint: "new-source",
      contentHash: "new-content",
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      generatedAt: "2026-09-11T00:00:00.000Z",
      evidenceRefs: [],
    } })).toBe("stale");
  });

  it("claims evidence-bounded jobs and writes fixed generated JSON", async () => {
    const value = catalog();
    const source = entry({
      generationState: "pending",
      native: { name: "入口", aliases: [], description: null, metadata: {} },
    });
    const generationId = value.publish(snapshot([source]));
    value.createGenerationJobs({ projectId: "p1", workspaceId: "w1", generationId, requests: [{ canonicalUri: source.canonicalUri, sourceFingerprint: "fp-1", evidenceRefs: [{ sourceUri: source.canonicalUri, sourceKind: "page-schema", contentHash: "hash", selector: "schema" }] }], generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION });
    const result = await runInventoryGeneration(value, { read: async () => "不可信证据" }, {
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
    const generationId = value.publish(snapshot([source]));
    value.createGenerationJobs({ projectId: "p1", workspaceId: "w1", generationId, requests: [{ canonicalUri: source.canonicalUri, sourceFingerprint: "fp-bytes", evidenceRefs: [{ sourceUri: source.canonicalUri, sourceKind: "page-schema", contentHash: "hash", selector: "schema" }] }], generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION });
    await runInventoryGeneration(value, { read: async () => "证据".repeat(10_000) }, {
      generate: async ({ evidence }) => {
        expect(Buffer.byteLength(evidence[0]?.content ?? "", "utf8")).toBeLessThanOrEqual(8 * 1024);
        return { summary: "摘要" };
      },
    });
    expect(value.activeSnapshot("p1")?.entries[0]?.generationState).toBe("ready");
  });

  it("recovers expired leases, retries bounded failures, and marks terminal jobs failed", () => {
    const value = catalog();
    const source = entry({ generationState: "pending" });
    const generationId = value.publish(snapshot([source]));
    value.createGenerationJobs({
      projectId: "p1",
      workspaceId: "w1",
      generationId,
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      requests: [{ canonicalUri: source.canonicalUri, sourceFingerprint: "fp-retry", evidenceRefs: [] }],
    });

    const baseNow = Date.now();
    const first = value.claimGenerationJobs(1, { now: baseNow, leaseMs: 1_000, owner: "worker-a" })[0]!;
    expect(value.recoverExpiredGenerationJobs(baseNow + 1_000, 3)).toEqual({ recovered: 1, failed: 0 });
    const second = value.claimGenerationJobs(1, { now: baseNow + 1_000, leaseMs: 1_000, owner: "worker-b" })[0]!;
    expect(second.attempts).toBe(2);
    expect(value.failGenerationJob({ job: second, errorCode: "AGENT_UNAVAILABLE", error: "temporary", retryable: true, maxAttempts: 3, availableAt: baseNow + 1_001 })).toBe("retry_scheduled");
    const third = value.claimGenerationJobs(1, { now: baseNow + 1_001, leaseMs: 1_000, owner: "worker-c" })[0]!;
    expect(third.attempts).toBe(3);
    expect(value.failGenerationJob({ job: third, errorCode: "MODEL_UNAVAILABLE", error: "still unavailable", retryable: true, maxAttempts: 3 })).toBe("failed");
    expect(value.activeSnapshot("p1")?.entries[0]?.generationState).toBe("failed");
    expect(value.generationActivity("p1")).toBe("failed");
    expect(value.failGenerationJob({ job: first, errorCode: "TIMEOUT", error: "late", retryable: true })).toBe("duplicate");
  });

  it("treats repeated completion of the same leased job as a duplicate", () => {
    const value = catalog();
    const source = entry({ generationState: "pending" });
    const generationId = value.publish(snapshot([source]));
    value.createGenerationJobs({
      projectId: "p1",
      workspaceId: "w1",
      generationId,
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      requests: [{ canonicalUri: source.canonicalUri, sourceFingerprint: "fp-duplicate", evidenceRefs: [] }],
    });
    const job = value.claimGenerationJobs()[0]!;
    const generated = {
      summary: "摘要",
      sourceFingerprint: "fp-duplicate",
      contentHash: "content",
      generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
      generatedAt: "2026-09-11T00:00:00.000Z",
      evidenceRefs: [],
    };
    expect(value.completeGenerationJob({ job, generated })).toBe("applied");
    expect(value.completeGenerationJob({ job, generated })).toBe("duplicate");
  });
});

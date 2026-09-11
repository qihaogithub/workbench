import { encodeMarkdownReferenceUri, PROJECT_INVENTORY_GENERATOR_VERSION, PROJECT_INVENTORY_SCHEMA_VERSION, type InventoryEntry, type InventorySnapshot } from "@workbench/shared";
import { formatInventoryL3, queryProjectInventory, redactUnavailableInventoryEntry } from "../inventory-projection";

function entry(uri: string, name: string, type: InventoryEntry["resourceType"] = "page"): InventoryEntry {
  return {
    canonicalUri: uri,
    resourceType: type,
    scope: "local",
    parentUri: null,
    refreshMode: "auto",
    native: { name, aliases: [], description: `${name} description`, metadata: {} },
    generated: null,
    human: { summary: null, confirmedGeneratedHash: null, updatedAt: null },
    sourceState: "active",
    generationState: "not_required",
    reviewState: "not_required",
  };
}

function snapshot(entries: InventoryEntry[]): InventorySnapshot {
  return { schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION, projectId: "project-1", workspaceRevision: 1, workspaceRootHash: "root", catalogFingerprint: "catalog", overlayHash: "overlay", projectionFingerprint: "projection", generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION, builtAt: "2026-09-11T00:00:00.000Z", freshness: "fresh", entries };
}

describe("项目清单投影", () => {
  it("按 query 返回稳定匹配原因和过滤后的条目", () => {
    const result = queryProjectInventory(snapshot([
      entry("wb://page/project-1/home", "首页"),
      entry("wb://page/project-1/checkout", "结算页"),
    ]), { query: "结算", resourceTypes: ["page"] });
    expect(result.entries.map((item) => item.resolved.name)).toEqual(["结算页"]);
    expect(result.entries[0]?.matchedBy[0]?.field).toBe("name");
  });

  it("将当前项目和页面置于 L3 前部，并显式报告预算截断", () => {
    const entries = [
      entry(encodeMarkdownReferenceUri({ kind: "project", projectId: "project-1" }), "项目" , "project"),
      entry(encodeMarkdownReferenceUri({ kind: "page", projectId: "project-1", pageId: "current" }), "当前页"),
      ...Array.from({ length: 60 }, (_, index) => entry(`wb://page/project-1/page-${index}`, `页面 ${index}`)),
    ];
    const result = formatInventoryL3(queryProjectInventory(snapshot(entries)), "current");
    expect(result.text.indexOf("- 项目")).toBeLessThan(result.text.indexOf("- 当前页"));
    expect(result.text.length).toBeLessThanOrEqual(12_000);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("truncated: true");
  });

  it("对不可用外部目标清除语义、声明和匹配原因", () => {
    const external = {
      ...entry("wb://page/external-project/home", "外部入口"),
      scope: "referenced" as const,
      generated: {
        summary: "不应泄露的外部摘要",
        sourceFingerprint: "source",
        contentHash: "content",
        generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
        generatedAt: "2026-09-11T00:00:00.000Z",
        evidenceRefs: [],
      },
      declarations: [{ sourceLocator: "workspaceId=w1", targetUri: "wb://page/external-project/home", labelSnapshot: "外部入口" }],
      resolved: { name: "外部入口", summary: "不应泄露的外部摘要", aliases: [] },
      matchedBy: [{ field: "summary" as const, value: "不应泄露的外部摘要", score: 500 }],
      targetAvailability: "unknown" as const,
    };
    const redacted = redactUnavailableInventoryEntry(external);
    expect(redacted.generated).toBeNull();
    expect(redacted.declarations).toBeUndefined();
    expect(JSON.stringify(redacted)).not.toContain("不应泄露的外部摘要");
    expect(JSON.stringify(redacted)).not.toContain("secret");
  });
});

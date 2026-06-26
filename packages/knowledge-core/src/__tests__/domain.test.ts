import { describe, expect, it } from "vitest";

import {
  buildKnowledgeReport,
  buildReportCacheKey,
  canAccessKnowledgeItem,
  compareKnowledgeItemsByAuthority,
  filterKnowledgeItems,
  mapLegacyKnowledgeSource,
  type AccessContext,
  type KnowledgeItem,
} from "../index.js";

const authorAiContext: AccessContext = {
  principalType: "author-ai",
  principalId: "session-1",
  tenantScope: { projectId: "project-1" },
  surface: "agent-service",
  purpose: "edit-assist",
  capabilities: ["search", "readSummary", "readOriginal", "related", "report"],
};

const viewerContext: AccessContext = {
  principalType: "visitor",
  principalId: "visitor-1",
  tenantScope: { projectId: "project-1" },
  surface: "viewer",
  purpose: "readonly-qa",
  capabilities: ["search", "readSummary", "related", "report"],
};

const items: KnowledgeItem[] = [
  {
    id: "system-schema",
    sourceType: "system-rule",
    sourceId: "system",
    kind: "system-rule",
    title: "配置 Schema 约束",
    summary: "配置字段修改前必须确认 Schema。",
    tags: ["schema"],
    keywords: ["schema", "配置"],
    relations: [],
    trustLevel: "hard-constraint",
    visibility: ["system-internal", "project-agent"],
    permissions: { capabilities: ["search", "readSummary", "readOriginal", "report"] },
    version: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    readPath: "system/config-schema.md",
  },
  {
    id: "current-rule",
    sourceType: "current-project",
    sourceId: "project-1",
    kind: "business-rule",
    title: "当前项目开奖规则",
    summary: "当前项目使用三轮开奖。",
    tags: ["开奖"],
    keywords: ["开奖", "规则"],
    relations: [{ type: "explains", targetId: "page-home" }],
    trustLevel: "current-fact",
    visibility: ["author-private", "project-agent"],
    permissions: { capabilities: ["search", "readSummary", "readOriginal", "related", "report"] },
    version: 2,
    updatedAt: "2026-06-26T00:00:01.000Z",
    readPath: "knowledge/开奖规则.md",
  },
  {
    id: "published-help",
    sourceType: "current-project",
    sourceId: "project-1",
    kind: "knowledge-doc",
    title: "公开活动说明",
    summary: "访问者可阅读的活动说明。",
    tags: ["公开"],
    keywords: ["活动"],
    relations: [],
    trustLevel: "current-fact",
    visibility: ["published-viewer"],
    permissions: { capabilities: ["search", "readSummary", "related", "report"] },
    version: 1,
    updatedAt: "2026-06-26T00:00:02.000Z",
    readPath: "knowledge/活动说明.md",
  },
  {
    id: "template-sample",
    sourceType: "template-library",
    sourceId: "template-a",
    kind: "template-summary",
    title: "模板开奖示例",
    summary: "模板中的开奖字段示例。",
    tags: ["模板"],
    keywords: ["开奖"],
    relations: [{ type: "references", targetId: "current-rule" }],
    trustLevel: "reference-sample",
    visibility: ["template-library"],
    permissions: { capabilities: ["search", "readSummary", "related", "report"] },
    version: 1,
    updatedAt: "2026-06-26T00:00:03.000Z",
    readPath: "templates/template-a/read-map.json",
  },
];

describe("knowledge-core domain rules", () => {
  it("按访问上下文过滤搜索和原文读取权限", () => {
    expect(filterKnowledgeItems(items, authorAiContext, "search").map((item) => item.id)).toEqual([
      "system-schema",
      "current-rule",
      "published-help",
      "template-sample",
    ]);

    expect(filterKnowledgeItems(items, viewerContext, "search").map((item) => item.id)).toEqual([
      "published-help",
      "template-sample",
    ]);

    expect(canAccessKnowledgeItem(items[0], viewerContext, "readOriginal")).toMatchObject({
      allowed: false,
      reason: "capability-not-requested",
    });
  });

  it("按可信等级排序，当前事实优先于模板参考", () => {
    const sorted = [...items].sort(compareKnowledgeItemsByAuthority);
    expect(sorted.map((item) => item.id)).toEqual([
      "system-schema",
      "current-rule",
      "published-help",
      "template-sample",
    ]);
  });

  it("报告结构包含来源、可信等级、原文建议和未找到信息", () => {
    const report = buildKnowledgeReport({
      question: "开奖配置怎么改？",
      context: authorAiContext,
      items: [items[0], items[1], items[3]],
      missing: ["未找到使用端公开说明"],
      risks: ["涉及 Schema 时需要读取原文确认"],
      recommendedReadPaths: ["system/config-schema.md", "knowledge/开奖规则.md"],
    });

    expect(report.sections.summary).toContain("开奖配置怎么改");
    expect(report.sections.sources).toEqual([
      { path: "system/config-schema.md", trustLevel: "hard-constraint", sourceType: "system-rule" },
      { path: "knowledge/开奖规则.md", trustLevel: "current-fact", sourceType: "current-project" },
      { path: "templates/template-a/read-map.json", trustLevel: "reference-sample", sourceType: "template-library" },
    ]);
    expect(report.sections.missing).toEqual(["未找到使用端公开说明"]);
  });

  it("报告缓存键包含访问上下文，避免高权限报告复用给低权限主体", () => {
    expect(buildReportCacheKey("开奖配置", authorAiContext)).not.toEqual(
      buildReportCacheKey("开奖配置", viewerContext),
    );
  });

  it("兼容旧 system/user 来源映射", () => {
    expect(mapLegacyKnowledgeSource("system")).toEqual({
      sourceType: "system-rule",
      trustLevel: "hard-constraint",
      visibility: ["system-internal", "project-agent"],
    });
    expect(mapLegacyKnowledgeSource("user")).toEqual({
      sourceType: "current-project",
      trustLevel: "current-fact",
      visibility: ["author-private"],
    });
  });
});

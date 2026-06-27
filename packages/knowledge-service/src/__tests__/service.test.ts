import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AccessContext, KnowledgeItem } from "@opencode-workbench/knowledge-core";
import {
  BasicRetrievalBackend,
  KnowledgeFileStore,
  createTemplateIndexJob,
  enrichTemplateReadingMap,
  generateTemplateReadingMap,
  markTemplateKnowledgeStale,
  runBasicTemplateIndexJob,
} from "../index.js";

let tmpDir: string;

const authorContext: AccessContext = {
  principalType: "author-ai",
  principalId: "agent-1",
  tenantScope: { projectId: "project-1" },
  surface: "agent-service",
  purpose: "edit-assist",
  capabilities: ["search", "readSummary", "readOriginal", "related", "report"],
};

const viewerContext: AccessContext = {
  principalType: "viewer-ai",
  principalId: "viewer-1",
  tenantScope: { projectId: "project-1" },
  surface: "viewer",
  purpose: "readonly-qa",
  capabilities: ["search", "readSummary", "related", "report"],
};

function writeWorkspace(workspacePath: string): void {
  fs.mkdirSync(path.join(workspacePath, "knowledge"), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, "workspace-tree.json"),
    JSON.stringify({
      folders: [],
      pages: [
        { id: "home", name: "首页", order: 0, file: "pages/home.tsx" },
        { id: "rules", name: "规则页", order: 1, file: "pages/rules.tsx" },
      ],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "project.config.schema.json"),
    JSON.stringify({
      title: "活动配置",
      properties: {
        title: { type: "string", title: "活动标题" },
        lotteryMode: { type: "string", title: "开奖模式" },
      },
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "knowledge", "开奖规则.md"),
    "# 开奖规则\n\n当前项目采用三轮开奖，修改 lotteryMode 前需要确认页面文案。",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "knowledge", "manifest.json"),
    JSON.stringify({
      items: [
        {
          id: "rule-doc",
          title: "开奖规则",
          fileName: "开奖规则.md",
          description: "解释当前项目开奖配置。",
          addedAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:00:00.000Z",
        },
        {
          id: "path-doc",
          title: "Path Manifest Doc",
          path: "path-doc.md",
          description: "Uses the local project package path field.",
          tags: ["path-field"],
        },
      ],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workspacePath, "knowledge", "path-doc.md"),
    "# Path Manifest Doc\n\nThis document is registered with the path field.\n",
    "utf-8",
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-service-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("knowledge-service v1", () => {
  it("为模板创建 pending 索引任务并生成基础阅读地图", () => {
    const workspacePath = path.join(tmpDir, "templates", "tmpl_1", "workspace");
    writeWorkspace(workspacePath);
    const store = new KnowledgeFileStore({ dataDir: tmpDir });

    const job = createTemplateIndexJob(store, {
      templateId: "tmpl_1",
      templateName: "抽奖模板",
      templateDescription: "适用于活动抽奖",
      workspacePath,
    });

    expect(job.status).toBe("pending");

    const completed = runBasicTemplateIndexJob(store, job.id);
    expect(completed.status).toBe("ready");
    expect(completed.readingMapPath).toBe("knowledge/templates/tmpl_1/reading-map.json");

    const map = store.readTemplateReadingMap("tmpl_1");
    expect(map?.overview.knowledgeCount).toBe(2);
    expect(map?.structure.knowledgeDocuments.map((doc) => doc.path)).toContain("knowledge/path-doc.md");
    expect(map?.overview.title).toBe("抽奖模板");
    expect(map?.structure.pages.map((page) => page.title)).toEqual(["首页", "规则页"]);
    expect(map?.taskEntries.some((entry) => entry.taskType === "修改配置")).toBe(true);
  });

  it("Basic 检索按权限过滤，related 不泄露不可见条目", () => {
    const backend = new BasicRetrievalBackend([
      {
        id: "private-rule",
        sourceType: "current-project",
        sourceId: "project-1",
        kind: "business-rule",
        title: "私有开奖规则",
        summary: "作者侧可见的 lotteryMode 规则。",
        tags: ["开奖"],
        keywords: ["lotteryMode"],
        relations: [{ type: "references", targetId: "public-help" }],
        trustLevel: "current-fact",
        visibility: ["author-private", "project-agent"],
        permissions: { capabilities: ["search", "readSummary", "related", "report"] },
        version: 1,
        updatedAt: "2026-06-26T00:00:00.000Z",
        readPath: "knowledge/私有开奖规则.md",
      },
      {
        id: "public-help",
        sourceType: "current-project",
        sourceId: "project-1",
        kind: "knowledge-doc",
        title: "公开活动说明",
        summary: "使用端可见的公开活动说明。",
        tags: ["活动"],
        keywords: ["活动"],
        relations: [{ type: "references", targetId: "private-rule" }],
        trustLevel: "current-fact",
        visibility: ["published-viewer"],
        permissions: { capabilities: ["search", "readSummary", "related", "report"] },
        version: 1,
        updatedAt: "2026-06-26T00:00:00.000Z",
        readPath: "knowledge/公开活动说明.md",
      },
    ]);

    expect(backend.search({ query: "开奖 lotteryMode", context: authorContext }).map((item) => item.id)).toEqual([
      "private-rule",
    ]);
    expect(backend.search({ query: "开奖 lotteryMode", context: viewerContext })).toEqual([]);
    expect(backend.related({ itemId: "public-help", context: viewerContext }).map((item) => item.id)).toEqual([
      "public-help",
    ]);
  });

  it("报告只引用当前主体可见资料并记录不可确认信息", () => {
    const items: KnowledgeItem[] = [
      {
        id: "template-sample",
        sourceType: "template-library",
        sourceId: "tmpl_1",
        kind: "template-summary",
        title: "模板字段示例",
        summary: "模板提供 lotteryMode 字段参考。",
        tags: ["模板"],
        keywords: ["lotteryMode"],
        relations: [],
        trustLevel: "reference-sample",
        visibility: ["template-library"],
        permissions: { capabilities: ["search", "readSummary", "report"] },
        version: 1,
        updatedAt: "2026-06-26T00:00:00.000Z",
        readPath: "knowledge/templates/tmpl_1/reading-map.json",
      },
    ];
    const backend = new BasicRetrievalBackend(items);

    const report = backend.report({
      question: "怎么调整 lotteryMode？",
      context: viewerContext,
      missingHints: ["当前项目私有规则不可见，无法确认最终配置约束。"],
    });

    expect(report.sections.sources).toEqual([
      {
        path: "knowledge/templates/tmpl_1/reading-map.json",
        trustLevel: "reference-sample",
        sourceType: "template-library",
      },
    ]);
    expect(report.sections.missing).toContain("当前项目私有规则不可见，无法确认最终配置约束。");
  });

  it("模板更新后把 ready 任务标记为 stale", () => {
    const workspacePath = path.join(tmpDir, "templates", "tmpl_2", "workspace");
    writeWorkspace(workspacePath);
    const store = new KnowledgeFileStore({ dataDir: tmpDir });
    const job = createTemplateIndexJob(store, {
      templateId: "tmpl_2",
      templateName: "活动模板",
      templateDescription: "活动模板",
      workspacePath,
    });
    runBasicTemplateIndexJob(store, job.id);

    const stale = markTemplateKnowledgeStale(store, "tmpl_2", "模板元数据更新");
    expect(stale?.status).toBe("stale");
    expect(stale?.statusReason).toBe("模板元数据更新");
  });

  it("可直接生成阅读地图用于基础兜底", () => {
    const workspacePath = path.join(tmpDir, "workspace");
    writeWorkspace(workspacePath);
    const map = generateTemplateReadingMap({
      templateId: "tmpl_3",
      templateName: "基础模板",
      templateDescription: "基础说明",
      workspacePath,
      now: "2026-06-26T00:00:00.000Z",
    });

    expect(map.overview.scene).toBe("基础说明");
    expect(map.structure.knowledgeDocuments.map((doc) => doc.path)).toContain("knowledge/path-doc.md");
    expect(map.structure.knowledgeDocuments).toHaveLength(2);
    expect([
      {
        id: "rule-doc",
        title: "开奖规则",
        path: "knowledge/开奖规则.md",
        summary: "解释当前项目开奖配置。",
      },
    ]).toHaveLength(1);
    expect(map.originalEntries.map((entry) => entry.path)).toContain("project.config.schema.json");
  });

  it("可通过异步整理器增强阅读地图摘要", async () => {
    const workspacePath = path.join(tmpDir, "templates", "tmpl_4", "workspace");
    writeWorkspace(workspacePath);
    const store = new KnowledgeFileStore({ dataDir: tmpDir });
    const job = createTemplateIndexJob(store, {
      templateId: "tmpl_4",
      templateName: "增强模板",
      templateDescription: "用于异步整理",
      workspacePath,
    });
    runBasicTemplateIndexJob(store, job.id);

    const map = await enrichTemplateReadingMap(store, "tmpl_4", {
      summarize: async (entry) => ({
        summary: `AI 摘要：${entry.title}`,
        keywords: [entry.title],
        tags: ["ai-summary"],
      }),
    });

    expect(map?.localSummaries[0]?.summary).toMatch(/^AI 摘要：/);
    expect(store.readTemplateReadingMap("tmpl_4")?.localSummaries[0]?.summary).toMatch(
      /^AI 摘要：/,
    );
  });
});

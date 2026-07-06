import * as fs from "fs";
import * as path from "path";

import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  BasicRetrievalBackend,
} from "@workbench/knowledge-service";
import type {
  AccessContext,
  KnowledgeItem,
} from "@workbench/knowledge-core";

import type { AgentConfig } from "../../core/types";
import { getSystemKnowledgeSnapshot } from "../../config/system-knowledge";

const KnowledgeReportParams = Type.Object({
  question: Type.String({ description: "Question or task that needs a knowledge report" }),
});
type KnowledgeReportParams = Static<typeof KnowledgeReportParams>;

interface KnowledgeReportToolOptions {
  mode?: "workbench" | "viewer-readonly";
}

interface WorkspaceKnowledgeManifest {
  items?: Array<{
    id?: unknown;
    title?: unknown;
    description?: unknown;
    path?: unknown;
    fileName?: unknown;
    category?: unknown;
    tags?: unknown;
    updatedAt?: unknown;
  }>;
}

export function createKnowledgeReportTool(
  config: AgentConfig,
  options: KnowledgeReportToolOptions = {},
): AgentTool<typeof KnowledgeReportParams> {
  const mode = options.mode ?? config.toolMode ?? "workbench";
  return {
    name: "knowledgeReport",
    label: "Knowledge Report",
    description:
      "Searches readable project and system knowledge, then returns a structured report with sources and trust levels.",
    parameters: KnowledgeReportParams,
    execute: async (_toolCallId: string, args: KnowledgeReportParams) => {
      const workingDir = config.workingDir;
      if (!workingDir) {
        return {
          content: [{ type: "text", text: "Error: workingDir is required for knowledgeReport" }],
          details: { error: "missing workingDir" },
          isError: true,
        };
      }

      const context = createAccessContext(config, mode);
      const backend = new BasicRetrievalBackend([
        ...systemKnowledgeItems(),
        ...workspaceKnowledgeItems(workingDir, config.demoId ?? "current-project"),
      ]);
      const report = backend.report({
        question: args.question,
        context,
        riskHints: ["涉及配置、Schema、系统规则或业务规则时，主 AI 应继续读取原文确认。"],
      });

      return {
        content: [{ type: "text", text: formatReport(report) }],
        details: {
          reportId: report.id,
          sources: report.sections.sources,
          missing: report.sections.missing,
        },
      };
    },
  };
}

function createAccessContext(
  config: AgentConfig,
  mode: "workbench" | "viewer-readonly",
): AccessContext {
  if (mode === "viewer-readonly") {
    return {
      principalType: "viewer-ai",
      principalId: config.sessionId,
      tenantScope: { projectId: config.demoId },
      surface: "viewer",
      purpose: "readonly-qa",
      capabilities: ["search", "readSummary", "related", "report"],
    };
  }

  return {
    principalType: "author-ai",
    principalId: config.sessionId,
    tenantScope: { projectId: config.demoId },
    surface: "agent-service",
    purpose: "edit-assist",
    capabilities: ["search", "readSummary", "readOriginal", "related", "report"],
  };
}

function systemKnowledgeItems(): KnowledgeItem[] {
  return getSystemKnowledgeSnapshot().documents.map((document) => ({
    id: document.id,
    sourceType: "system-rule",
    sourceId: "system",
    kind: "system-rule",
    title: document.title,
    summary: document.aiSummary || document.description,
    tags: document.tags,
    keywords: document.aiKeywords.length > 0 ? document.aiKeywords : document.tags,
    relations: [],
    trustLevel: "hard-constraint",
    visibility: ["system-internal", "project-agent"],
    permissions: {
      capabilities: ["search", "readSummary", "readOriginal", "related", "report"],
    },
    version: document.version,
    updatedAt: document.updatedAt,
    readPath: `knowledge/${document.fileName}`,
    contentSnippet: document.content.slice(0, 300),
  }));
}

function workspaceKnowledgeItems(workingDir: string, projectId: string): KnowledgeItem[] {
  const knowledgeDir = path.join(workingDir, "knowledge");
  const manifest = readJson<WorkspaceKnowledgeManifest>(
    path.join(knowledgeDir, "manifest.json"),
  );
  const items = manifest?.items ?? [];
  return items
    .flatMap((item, index) => {
      const manifestPath =
        typeof item.path === "string"
          ? item.path
          : typeof item.fileName === "string"
            ? item.fileName
            : "";
      const fileName = safeKnowledgeRelativePath(manifestPath);
      if (!fileName) return [];
      const content = readText(path.join(knowledgeDir, fileName));
      const tags = Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
      return [{
        id: typeof item.id === "string" ? item.id : `workspace-knowledge-${index + 1}`,
        sourceType: "current-project",
        sourceId: projectId,
        kind: "knowledge-doc",
        title: typeof item.title === "string" ? item.title : fileName,
        summary:
          typeof item.description === "string" && item.description.trim()
            ? item.description
            : summarizeContent(content),
        tags,
        keywords: tags,
        relations: [],
        trustLevel: "current-fact",
        visibility: ["author-private", "project-agent"],
        permissions: {
          capabilities: ["search", "readSummary", "readOriginal", "related", "report"],
        },
        version: 1,
        updatedAt:
          typeof item.updatedAt === "string" ? item.updatedAt : new Date(0).toISOString(),
        readPath: `knowledge/${fileName}`,
        contentSnippet: content.slice(0, 300),
      } satisfies KnowledgeItem];
    });
}

function safeKnowledgeRelativePath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^knowledge\//, "");
  if (!normalized || path.isAbsolute(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.includes("..") || parts.some((part) => part.trim() === "")) return null;
  if (!normalized.endsWith(".md")) return null;
  return normalized;
}

function formatReport(report: ReturnType<BasicRetrievalBackend["report"]>): string {
  const lines = [
    `# 知识报告`,
    "",
    `## 结论摘要`,
    report.sections.summary,
    "",
    `## 相关资料`,
    ...report.sections.materials.map(
      (item) => `- ${item.title}（${item.sourceType} / ${item.trustLevel}）：${item.summary}`,
    ),
    "",
    `## 来源路径`,
    ...report.sections.sources.map(
      (source) => `- ${source.path}（${source.sourceType} / ${source.trustLevel}）`,
    ),
    "",
    `## 可信等级`,
    report.sections.trustLevels.length > 0
      ? report.sections.trustLevels.join(", ")
      : "无可用资料",
    "",
    `## 适用范围`,
    report.sections.scope,
    "",
    `## 建议主 AI 继续读取的原文`,
    ...(report.sections.recommendedOriginals.length > 0
      ? report.sections.recommendedOriginals.map((item) => `- ${item}`)
      : ["- 无"]),
    "",
    `## 未找到的信息`,
    ...(report.sections.missing.length > 0
      ? report.sections.missing.map((item) => `- ${item}`)
      : ["- 无"]),
    "",
    `## 风险提示`,
    ...(report.sections.risks.length > 0
      ? report.sections.risks.map((item) => `- ${item}`)
      : ["- 无"]),
  ];
  return lines.join("\n");
}

function summarizeContent(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

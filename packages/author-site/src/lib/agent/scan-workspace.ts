import * as fs from "fs";
import * as path from "path";
import { summarizeCanvasTextNodes } from "@workbench/demo-ui";
import type { SystemPromptContext } from "./system-prompt";
import { readCanvasStateFromWorkspace } from "../canvas-layout-file";
import { listDemoPages, resolvePageRuntimeType } from "../fs-utils";
import { readWorkspaceKnowledgeManifest } from "../knowledge/builtin-documents";
import { SKETCH_SCENE_AUTHORING_ENABLED } from "../authoring-feature-flags";

interface PageInfo {
  id: string;
  name: string;
  routeKey?: string;
  runtimeType: "prototype-html-css" | "high-fidelity-react" | "sketch-scene";
  sourcePaths: string[];
  schemaPath: string;
}

function formatPageList(pages: PageInfo[]): string {
  if (pages.length === 0) return "（暂无页面）";

  return pages
    .map((p) => {
      const lines = [
        `- ${p.name}`,
        `  - id: \`${p.id}\``,
        `  - routeKey: \`${p.routeKey ?? p.id}\``,
        `  - runtimeType: \`${p.runtimeType}\``,
        ...p.sourcePaths.map((sourcePath) => `  - 源码: \`${sourcePath}\``),
        `  - config.schema.json: \`${p.schemaPath}\``,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatCanvasTextSummary(workingDir: string): string {
  const state = readCanvasStateFromWorkspace(workingDir);
  if (!state) return "（暂无画布文本节点）";

  const summaries = summarizeCanvasTextNodes(state);
  if (summaries.length === 0) return "（暂无画布文本节点）";

  return summaries
    .map((node) => {
      const relatedPages =
        node.relatedPageIds.length > 0
          ? node.relatedPageIds.map((pageId) => `\`${pageId}\``).join(", ")
          : "无";
      const suffix = node.truncated ? "（已截断）" : "";
      return [
        `- ${node.title || "文字"}（id: \`${node.id}\`）${suffix}`,
        `  - text: ${node.text || "（空）"}`,
        `  - layout: x=${node.layout.x}, y=${node.layout.y}, w=${node.layout.width}, h=${node.layout.height}`,
        `  - relatedPageIds: ${relatedPages}`,
        `  - updatedAt: ${node.updatedAt}`,
      ].join("\n");
    })
    .join("\n");
}

export function scanWorkspaceContext(workingDir: string): SystemPromptContext {
  const pages: PageInfo[] = [];

  // 使用 listDemoPages 读取页面列表（自动处理 workspace-tree.json 迁移和磁盘发现）
  const demoPages = listDemoPages(workingDir);
  for (const p of demoPages) {
    const runtimeType = resolvePageRuntimeType(path.join(workingDir, "demos", p.id));
    if (runtimeType === "sketch-scene" && !SKETCH_SCENE_AUTHORING_ENABLED) {
      continue;
    }
    pages.push({
      id: p.id,
      name: p.name,
      routeKey: p.routeKey,
      runtimeType,
      sourcePaths:
        runtimeType === "prototype-html-css"
          ? [
              path.join("demos", p.id, "prototype.html"),
              path.join("demos", p.id, "prototype.css"),
            ]
          : runtimeType === "sketch-scene"
            ? [path.join("demos", p.id, "sketch.scene.json")]
            : [path.join("demos", p.id, "index.tsx")],
      schemaPath: path.join("demos", p.id, "config.schema.json"),
    });
  }

  // 仅暴露页面元数据（名称、类型、路径），源码由 Agent 通过 readFile 按需读取。
  // 历史上曾在页面数 ≤ 2 时嵌入完整源码，但 Agent 始终可用 readFile 按需读取，
  // 预嵌入是冗余且每轮重复发送，曾导致两页项目 L3 上下文达数十万字节引发溢出。

  const hasProjectConfig = fs.existsSync(
    path.join(workingDir, "project.config.schema.json"),
  );

  const pageList = formatPageList(pages);
  const canvasTextSummary = formatCanvasTextSummary(workingDir);

  const projectName = path.basename(workingDir);

  return {
    projectName,
    projectConfigStatus: hasProjectConfig ? "已设置" : "未设置",
    pageCount: pages.length,
    pageList,
    canvasTextSummary,
    workspacePath: workingDir,
  };
}

/**
 * 读取工作区根目录的 memory.md 内容
 * 容错：文件不存在或读取失败时返回 null
 */
export function readMemoryContent(workingDir: string): string | null {
  const memoryPath = path.join(workingDir, "memory.md");
  try {
    if (!fs.existsSync(memoryPath)) {
      return null;
    }
    const content = fs.readFileSync(memoryPath, "utf-8").trim();
    if (!content) {
      return null;
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * 扫描知识库索引（读取 knowledge/manifest.json 并格式化为索引文本）
 * 容错：manifest.json 不存在或解析失败时返回 null
 */
export function scanKnowledgeIndex(workingDir: string): string | null {
  try {
    const manifest = readWorkspaceKnowledgeManifest(workingDir);
    const userItems = manifest.items.filter((item) => item.source !== "system");
    if (userItems.length === 0) return null;

    const formatItem = (item: {
      title: string;
      description?: string;
      fileName: string;
      category?: string;
      tags?: string[];
      aiSummary?: string;
      aiKeywords?: string[];
      summaryStatus?: string;
      updatedAt?: string;
    }) => {
      const meta: string[] = [];
      if (item.category) meta.push(`分类：${item.category}`);
      if (Array.isArray(item.tags) && item.tags.length > 0) {
        meta.push(`标签：${item.tags.join(", ")}`);
      }
      if (Array.isArray(item.aiKeywords) && item.aiKeywords.length > 0) {
        meta.push(`关键词：${item.aiKeywords.join(", ")}`);
      }
      if (item.updatedAt) meta.push(`更新：${item.updatedAt}`);
      if (item.summaryStatus && item.summaryStatus !== "ready") {
        meta.push(`摘要状态：${item.summaryStatus}`);
      }
      const summary = item.aiSummary || item.description;
      const description = summary ? ` — ${summary}` : "";
      const metaSuffix = meta.length > 0 ? `；${meta.join("；")}` : "";
      return `  - ${item.title}${description}（knowledge/${item.fileName}${metaSuffix}）`;
    };

    const sections: string[] = [];
    if (userItems.length > 0) {
      const lines = userItems.map(formatItem);
      sections.push(`项目知识：\n${lines.join('\n')}`);
    }

    return [
      `项目知识库索引（共 ${userItems.length} 篇，仅含摘要，正文不在上下文中）：`,
      sections.join('\n'),
      '→ 需要查阅时，请根据标题/描述/分类/标签选择最相关文档，再用 readFile 读取 knowledge/{文件名}；不要一次性读取全部知识库。',
    ].join('\n');
  } catch {
    return null;
  }
}
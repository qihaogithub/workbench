import * as fs from "fs";
import * as path from "path";
import { summarizeCanvasTextNodes } from "@workbench/demo-ui";
import type { SystemPromptContext } from "./system-prompt";
import { readCanvasStateFromWorkspace } from "../canvas-layout-file";
import { listDemoPages } from "../fs-utils";
import { syncBuiltinKnowledge } from "../knowledge/builtin-documents";
import { SKETCH_SCENE_AUTHORING_ENABLED } from "../authoring-feature-flags";

const MAX_INLINE_PAGES = 2;

interface PageInfo {
  id: string;
  name: string;
  routeKey?: string;
  runtimeType: "prototype-html-css" | "high-fidelity-react" | "sketch-scene";
  sourcePaths: string[];
  schemaPath: string;
  sourceContents?: Array<{ path: string; content: string }>;
  schemaContent?: string;
}

function readPageFiles(workingDir: string, page: PageInfo): PageInfo {
  const sourceContents: Array<{ path: string; content: string }> = [];
  for (const sourcePath of page.sourcePaths) {
    try {
      sourceContents.push({
        path: sourcePath,
        content: fs.readFileSync(path.join(workingDir, sourcePath), "utf-8"),
      });
    } catch {
      /* 读取失败跳过该源码文件 */
    }
  }
  if (sourceContents.length > 0) page.sourceContents = sourceContents;

  try {
    page.schemaContent = fs.readFileSync(
      path.join(workingDir, page.schemaPath),
      "utf-8",
    );
  } catch {
    /* 读取失败保持 undefined */
  }
  return page;
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
      if (p.sourceContents !== undefined) {
        for (const source of p.sourceContents) {
          lines.push(`  - ${source.path} 内容：`);
          lines.push(
            source.content
              .split("\n")
              .map((l) => `    ${l}`)
              .join("\n"),
          );
        }
      }
      if (p.schemaContent !== undefined) {
        lines.push("  - 配置内容：");
        lines.push(
          p.schemaContent
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
        );
      }
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
    if (p.runtimeType === "sketch-scene" && !SKETCH_SCENE_AUTHORING_ENABLED) {
      continue;
    }
    const runtimeType =
      p.runtimeType === "prototype-html-css"
        ? "prototype-html-css"
        : p.runtimeType === "sketch-scene"
          ? "sketch-scene"
          : "high-fidelity-react";
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

  // 页面数 ≤ 2 时直接读文件内容嵌入 L3（> 2 时全部不嵌入，避免 L3 过大）
  if (pages.length > 0 && pages.length <= MAX_INLINE_PAGES) {
    for (const page of pages) {
      readPageFiles(workingDir, page);
    }
  }

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
  const manifestPath = path.join(workingDir, "knowledge", "manifest.json");
  try {
    const manifest = syncBuiltinKnowledge(workingDir);
    const userItems = fs.existsSync(manifestPath)
      ? (
          JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
            items?: Array<{
              title: string;
              source?: string;
              description?: string;
              fileName: string;
              category?: string;
              tags?: string[];
              updatedAt?: string;
            }>;
          }
        ).items?.filter((item) => item.source !== "system") || []
      : manifest.items.filter((item) => item.source !== "system");
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
      '→ 需要查阅时，请根据标题/描述/分类/标签选择最相关文档，再用 readFile 或 readFileWithLines 读取 knowledge/{文件名}；不要一次性读取全部知识库。',
    ].join('\n');
  } catch {
    return null;
  }
}

/**
 * 将旧项目的 references/ 目录迁移到 knowledge/ 目录
 * 仅在 references/ 存在且 knowledge/ 不存在时执行，迁移后删除旧目录
 */
export function migrateReferencesToKnowledge(workingDir: string): void {
  const referencesDir = path.join(workingDir, "references");
  const knowledgeDir = path.join(workingDir, "knowledge");

  // 仅在 references/ 存在且 knowledge/ 不存在时迁移
  if (!fs.existsSync(referencesDir) || fs.existsSync(knowledgeDir)) return;

  fs.mkdirSync(knowledgeDir, { recursive: true });

  // 读取 references/ 下所有 .md 文件
  const files = fs.readdirSync(referencesDir).filter(f => f.endsWith(".md"));
  const items = files.map((file, index) => {
    const title = file.replace(/\.md$/, "");
    // 复制文件到 knowledge/
    fs.copyFileSync(
      path.join(referencesDir, file),
      path.join(knowledgeDir, file)
    );
    return {
      id: `kb_user_${String(index + 1).padStart(3, "0")}`,
      title,
      source: "user",
      description: "从旧 references/ 迁移的项目知识文档",
      fileName: file,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // 写入 manifest.json
  if (items.length > 0) {
    fs.writeFileSync(
      path.join(knowledgeDir, "manifest.json"),
      JSON.stringify({ version: 1, items }, null, 2),
      "utf-8"
    );
  }

  // 删除旧 references/ 目录
  fs.rmSync(referencesDir, { recursive: true });
}

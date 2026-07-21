import * as fs from "fs";
import * as path from "path";
import type { DemoPageMeta, Project, WorkspaceTree } from "@workbench/shared/contracts";
import { getSystemKnowledgeSnapshot } from "../config/system-knowledge";

const MAX_TEXT_CHARS = 12000;
const MAX_INLINE_PAGES = 2;

export interface ViewerAiContextInput {
  project: Project;
  activePageId?: string;
  activeConfig?: Record<string, unknown>;
}

function readTextIfExists(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function truncateText(content: string, max = MAX_TEXT_CHARS): string {
  if (content.length <= max) return content;
  return `${content.slice(0, max)}\n\n[系统：以上内容已截断，原文较长。]`;
}

function readWorkspaceTree(workspacePath: string): WorkspaceTree {
  const treePath = path.join(workspacePath, "workspace-tree.json");
  const raw = readTextIfExists(treePath);
  if (!raw) return { folders: [], pages: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceTree>;
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    };
  } catch {
    return { folders: [], pages: [] };
  }
}

function listWorkspacePages(project: Project): DemoPageMeta[] {
  const tree = readWorkspaceTree(project.workspacePath);
  const pages = tree.pages.length > 0 ? tree.pages : project.demoPages;
  return [...pages].sort((a, b) => a.order - b.order);
}

function formatPageList(pages: DemoPageMeta[]): string {
  if (pages.length === 0) return "（暂无页面）";
  return pages
    .map((page) => `- ${page.name}（id: ${page.id}，排序: ${page.order}）`)
    .join("\n");
}

function formatPageDetail(workspacePath: string, page: DemoPageMeta): string {
  const pageDir = path.join(workspacePath, "demos", page.id);
  const code = readTextIfExists(path.join(pageDir, "index.tsx"));
  const schema = readTextIfExists(path.join(pageDir, "config.schema.json"));
  const parts = [
    `### ${page.name}`,
    `- id: ${page.id}`,
  ];

  if (code) {
    parts.push("页面内容：");
    parts.push(truncateText(code));
  }
  if (schema) {
    parts.push("页面配置项：");
    parts.push(truncateText(schema));
  }
  if (!code && !schema) {
    parts.push("（未读取到页面内容或配置项文件）");
  }

  return parts.join("\n");
}

function formatKnowledgeIndex(workspacePath: string): string {
  const manifestRaw = readTextIfExists(path.join(workspacePath, "knowledge", "manifest.json"));
  const sections: string[] = [];

  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw) as {
        items?: Array<{
          title?: string;
          description?: string;
          fileName?: string;
          category?: string;
          tags?: string[];
        }>;
      };
      const items = Array.isArray(manifest.items) ? manifest.items : [];
      if (items.length > 0) {
        sections.push(
          [
            `项目知识库索引（共 ${items.length} 篇）：`,
            ...items.map((item) => {
              const meta = [
                item.fileName ? `knowledge/${item.fileName}` : undefined,
                item.category ? `分类：${item.category}` : undefined,
                Array.isArray(item.tags) && item.tags.length > 0 ? `标签：${item.tags.join(", ")}` : undefined,
              ].filter(Boolean).join("；");
              const description = item.description ? ` — ${item.description}` : "";
              return `- ${item.title || "未命名文档"}${description}${meta ? `（${meta}）` : ""}`;
            }),
          ].join("\n"),
        );
      }
    } catch {
      sections.push("项目知识库索引读取失败。");
    }
  }

  const systemSnapshot = getSystemKnowledgeSnapshot();
  if (systemSnapshot.documents.length > 0) {
    sections.push(
      [
        `系统内置知识索引（共 ${systemSnapshot.documents.length} 篇）：`,
        ...systemSnapshot.documents.map((doc) => {
          const tags = doc.tags.length > 0 ? `；标签：${doc.tags.join(", ")}` : "";
          const summary = doc.aiSummary ? ` — ${doc.aiSummary}` : ` — ${doc.description}`;
          return `- ${doc.title}${summary}（knowledge/${doc.fileName}；分类：${doc.category}${tags}）`;
        }),
      ].join("\n"),
    );
  }

  return sections.join("\n\n") || "（暂无知识库索引）";
}

export function buildViewerAiPromptContext(input: ViewerAiContextInput): string {
  const { project, activePageId, activeConfig } = input;
  const pages = listWorkspacePages(project);
  const activePage = pages.find((page) => page.id === activePageId) || pages[0];
  const projectConfigSchema = readTextIfExists(path.join(project.workspacePath, "project.config.schema.json"));
  const memory = readTextIfExists(path.join(project.workspacePath, "memory.md"));

  const detailPages = new Map<string, DemoPageMeta>();
  if (activePage) detailPages.set(activePage.id, activePage);
  if (pages.length <= MAX_INLINE_PAGES) {
    for (const page of pages) detailPages.set(page.id, page);
  }

  return [
    "[系统自动注入：以下是当前使用端只读问答上下文。]",
    "",
    "## 项目概况",
    `- 项目名称：${project.name}`,
    project.description ? `- 项目说明：${project.description}` : "- 项目说明：（未填写）",
    `- 页面数量：${pages.length}`,
    activePage ? `- 当前页面：${activePage.name}（${activePage.id}）` : "- 当前页面：（暂无）",
    "",
    "## 页面列表",
    formatPageList(pages),
    "",
    "## 当前配置值",
    activeConfig && Object.keys(activeConfig).length > 0
      ? truncateText(JSON.stringify(activeConfig, null, 2), 8000)
      : "（当前没有配置值或未传入配置值）",
    "",
    "## 项目级配置项",
    projectConfigSchema ? truncateText(projectConfigSchema) : "（无项目级配置项）",
    "",
    "## 页面内容与页面配置",
    detailPages.size > 0
      ? Array.from(detailPages.values()).map((page) => formatPageDetail(project.workspacePath, page)).join("\n\n")
      : "（暂无页面内容）",
    "",
    "## 项目记忆",
    memory ? truncateText(memory) : "（暂无项目记忆）",
    "",
    "## 知识库索引",
    formatKnowledgeIndex(project.workspacePath),
    "",
    "[系统上下文结束]",
  ].join("\n");
}

export function buildViewerAiSystemPrompt(): string {
  return `# 使用端只读 AI 助手

你在 Workbench 的使用端中回答问题。你的回答对象是只读、非技术用户。

## 回答风格

- 用自然、清楚、面向使用者的中文回答。
- 优先解释这个项目或页面“是什么、能做什么、怎样理解、怎样使用”。
- 除非用户明确要求，不要优先输出代码、文件路径、实现细节或内部术语。
- 信息不足时直接说明无法从当前项目资料判断，并给出用户可以查看的位置或可以向创作者确认的问题。

## 只读边界

- 使用端只能查看和问答，不能修改、删除、保存、发布或执行命令。
- 如果用户要求你修改内容、删除页面、保存配置、生成文件或执行其他写操作，请明确说明：使用端 AI 只能解答和建议，不能替用户执行改动。
- 不要声称你已经完成任何项目改动。

## 上下文使用

- 只能基于系统注入的项目上下文、知识库索引、项目记忆、当前配置和只读读取工具回答。
- 不要编造当前项目中不存在的页面、配置项或能力。`;
}

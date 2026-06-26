import fs from "fs";
import path from "path";

import CONFIG_SYSTEM_REFERENCE_CONTENT from "./builtin/配置系统参考.md";

type KnowledgeSource = "system" | "user";

export interface WorkspaceKnowledgeItem {
  id: string;
  title: string;
  source: KnowledgeSource;
  description: string;
  fileName: string;
  addedAt: string;
  updatedAt: string;
  sizeBytes?: number;
  category?: string;
  tags?: string[];
}

export interface WorkspaceKnowledgeManifest {
  version: number;
  items: WorkspaceKnowledgeItem[];
}

export interface BuiltinKnowledgeDocument {
  id: string;
  title: string;
  description: string;
  fileName: string;
  category: string;
  tags: string[];
  content: string;
}

export const BUILTIN_KNOWLEDGE_DOCUMENTS: BuiltinKnowledgeDocument[] = [
  {
    id: "kb_sys_001",
    title: "配置系统参考",
    description: "配置系统支持的控件类型、扩展字段和完整示例",
    fileName: "配置系统参考.md",
    category: "配置与预览",
    tags: ["config.schema.json", "配置项", "表单控件", "图片上传"],
    content: CONFIG_SYSTEM_REFERENCE_CONTENT,
  },
];

function readKnowledgeManifest(knowledgeDir: string): WorkspaceKnowledgeManifest {
  const manifestPath = path.join(knowledgeDir, "manifest.json");
  try {
    if (!fs.existsSync(manifestPath)) {
      return { version: 1, items: [] };
    }
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf-8"),
    ) as Partial<WorkspaceKnowledgeManifest>;
    if (!Array.isArray(manifest.items)) {
      return { version: 1, items: [] };
    }
    return {
      version: typeof manifest.version === "number" ? manifest.version : 1,
      items: manifest.items,
    };
  } catch {
    return { version: 1, items: [] };
  }
}

function writeKnowledgeManifest(knowledgeDir: string, manifest: WorkspaceKnowledgeManifest): void {
  fs.writeFileSync(
    path.join(knowledgeDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

/**
 * 确保工作空间知识库目录可用。
 *
 * 历史版本会把系统内置文档复制到 workspace/knowledge。现在系统内置知识改为
 * SQLite 全局配置 + agent-service 虚拟读取，因此 workspace manifest 只保留用户文档。
 */
export function syncBuiltinKnowledge(workspacePath: string): WorkspaceKnowledgeManifest {
  const knowledgeDir = path.join(workspacePath, "knowledge");
  fs.mkdirSync(knowledgeDir, { recursive: true });

  const manifest = readKnowledgeManifest(knowledgeDir);
  const userManifest = {
    ...manifest,
    items: manifest.items.filter((item) => item.source !== "system"),
  };

  writeKnowledgeManifest(knowledgeDir, userManifest);
  return userManifest;
}

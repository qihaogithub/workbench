import fs from "fs";
import path from "path";

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

export function readWorkspaceKnowledgeManifest(workspacePath: string): WorkspaceKnowledgeManifest {
  return readKnowledgeManifest(path.join(workspacePath, "knowledge"));
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
 * 历史版本会把系统内置文档复制到 workspace/knowledge，当前创作端不再提供
 * 内置知识库配置，因此这里仅保留用户文档并清理旧的 system 条目。
 */
export function syncBuiltinKnowledge(workspacePath: string): WorkspaceKnowledgeManifest {
  const knowledgeDir = path.join(workspacePath, "knowledge");
  fs.mkdirSync(knowledgeDir, { recursive: true });

  const manifest = readKnowledgeManifest(knowledgeDir);
  const legacySystemItems = manifest.items.filter((item) => item.source === "system");
  for (const item of legacySystemItems) {
    if (path.basename(item.fileName) !== item.fileName) continue;
    const filePath = path.join(knowledgeDir, item.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  const userManifest = {
    ...manifest,
    items: manifest.items.filter((item) => item.source !== "system"),
  };

  writeKnowledgeManifest(knowledgeDir, userManifest);
  return userManifest;
}

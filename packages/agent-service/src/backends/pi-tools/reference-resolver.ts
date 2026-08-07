import * as fs from "fs";
import * as path from "path";

import type { KnowledgeItem } from "@workbench/knowledge-core";

/**
 * 引用项目（跨项目读取）解析器。
 *
 * 设计原则：
 * - 知识库只含模板项目，普通项目引用绝不写入持久 catalog。
 * - 模板引用：走 catalog / 阅读地图（已存在）。
 * - 普通项目引用：即时生成阅读地图（发现层，毫秒级，只读元数据）+ 按需单文件受控读取。
 *
 * sourceRef 约定（readKnowledgeSource 按前缀分发）：
 * - `knowledge://chunk_...`      → knowledge-service catalog（模板，已存在）
 * - `ref://project/{projectId}/{相对路径}` → 受控 per-file 读取（普通项目引用）
 */

export interface ReferencedProjectRef {
  projectId: string;
  label?: string;
}

export interface ResolvedReference {
  projectId: string;
  label: string;
  kind: "template" | "project";
  /** 普通项目工作区根目录；模板为空（走 catalog） */
  workspacePath: string | null;
  /** 阅读地图条目（发现层） */
  entries: ReferenceEntry[];
}

export interface ReferenceEntry {
  id: string;
  title: string;
  /** 相对工作区根目录的路径（普通项目）或 catalog sourceRef（模板） */
  path: string;
  /** 可传给 readKnowledgeSource 的 sourceRef */
  sourceRef: string;
  summary: string;
  kind: "page" | "config" | "knowledge-doc";
}

const REF_SCHEME = "ref://project/";

export function isReferenceSourceRef(sourceRef: string): boolean {
  return sourceRef.startsWith(REF_SCHEME);
}

export function parseReferenceSourceRef(sourceRef: string): {
  projectId: string;
  relativePath: string;
} | null {
  if (!sourceRef.startsWith(REF_SCHEME)) return null;
  const rest = sourceRef.slice(REF_SCHEME.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex <= 0) return null;
  return {
    projectId: rest.slice(0, slashIndex),
    relativePath: rest.slice(slashIndex + 1),
  };
}

export function buildReferenceSourceRef(
  projectId: string,
  relativePath: string,
): string {
  return `${REF_SCHEME}${projectId}/${relativePath}`;
}

/**
 * 解析 agent-service 的 data/ 根目录（与其它工具一致：DATA_DIR 优先，否则找仓库根 data）。
 */
export function resolveDataDir(cwd: string = process.cwd()): string {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  return path.join(findProjectRoot(cwd), "data");
}

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

/**
 * 受控 per-file 读取：仅允许读取被引用项目工作区内的文件。
 * 返回 null 表示无权 / 越界。
 */
export function readReferencedProjectFile(
  dataDir: string,
  projectId: string,
  relativePath: string,
): string | null {
  const workspacePath = path.join(dataDir, "projects", projectId, "workspace");
  if (!fs.existsSync(workspacePath)) return null;

  const resolved = path.resolve(workspacePath, relativePath);
  const workspaceResolved = path.resolve(workspacePath);
  if (!resolved.startsWith(workspaceResolved + path.sep)) {
    return null;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return null;
  }
  try {
    return fs.readFileSync(resolved, "utf-8");
  } catch {
    return null;
  }
}

/**
 * 解析被引用项目。dataDir 指 data/ 根目录。
 */
export function resolveReferencedProject(
  dataDir: string,
  ref: ReferencedProjectRef,
): ResolvedReference {
  const label = ref.label?.trim() || ref.projectId;
  const projectsDir = path.join(dataDir, "projects");
  const workspacePath = path.join(projectsDir, ref.projectId, "workspace");

  // 统一从工作区读取（模板与普通项目都有 data/projects/{id}/workspace）：
  // 引用读取不依赖 catalog 索引，按需 per-file 受控读取，知识库仍只含模板项目。
  if (fs.existsSync(workspacePath)) {
    const projectType = readProjectType(projectsDir, ref.projectId);
    return {
      projectId: ref.projectId,
      label,
      kind: projectType === "template" ? "template" : "project",
      workspacePath,
      entries: readWorkspaceEntries(ref.projectId, workspacePath),
    };
  }

  // 兜底：工作区不存在 → 尝试 catalog 阅读地图
  const catalogRefs = readTemplateCatalogEntries(dataDir, ref.projectId);
  if (catalogRefs.length > 0) {
    return {
      projectId: ref.projectId,
      label,
      kind: "template",
      workspacePath: null,
      entries: catalogRefs,
    };
  }

  return {
    projectId: ref.projectId,
    label,
    kind: "project",
    workspacePath,
    entries: [],
  };
}

export function referenceEntriesToKnowledgeItems(
  resolved: ResolvedReference,
): KnowledgeItem[] {
  return resolved.entries.map((entry, index) => {
    const isTemplate = resolved.kind === "template";
    const sourceId = isTemplate ? resolved.projectId : resolved.projectId;
    return {
      id: `ref-${resolved.projectId}-${index}`,
      sourceType: "linked-template",
      sourceId,
      kind:
        entry.kind === "page"
          ? "page"
          : entry.kind === "config"
            ? "config"
            : "knowledge-doc",
      title: entry.title,
      summary: entry.summary,
      tags: [],
      keywords: [],
      relations: [],
      trustLevel: "default-reference",
      visibility: ["project-agent"],
      permissions: {
        capabilities: ["search", "readSummary", "readOriginal", "related", "report"],
      },
      version: 1,
      updatedAt: new Date(0).toISOString(),
      readPath: entry.path,
      contentSnippet: entry.summary.slice(0, 300),
    };
  });
}

function readProjectType(
  projectsDir: string,
  projectId: string,
): string | null {
  const projectJson = path.join(projectsDir, projectId, "project.json");
  if (!fs.existsSync(projectJson)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(projectJson, "utf-8")) as {
      projectType?: unknown;
    };
    return typeof parsed.projectType === "string" ? parsed.projectType : null;
  } catch {
    return null;
  }
}

function readWorkspaceEntries(
  projectId: string,
  workspacePath: string,
): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  const demosDir = path.join(workspacePath, "demos");
  if (fs.existsSync(demosDir)) {
    const pageDirs = fs
      .readdirSync(demosDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of pageDirs) {
      const indexTsx = path.join(demosDir, dir.name, "index.tsx");
      const configSchema = path.join(demosDir, dir.name, "config.schema.json");
      if (fs.existsSync(indexTsx)) {
        entries.push({
          id: `page:${dir.name}`,
          title: dir.name,
          path: `demos/${dir.name}/index.tsx`,
          sourceRef: buildReferenceSourceRef(
            projectId,
            `demos/${dir.name}/index.tsx`,
          ),
          summary: `页面：${dir.name}`,
          kind: "page",
        });
      }
      if (fs.existsSync(configSchema)) {
        entries.push({
          id: `config:${dir.name}`,
          title: `${dir.name} 配置`,
          path: `demos/${dir.name}/config.schema.json`,
          sourceRef: buildReferenceSourceRef(
            projectId,
            `demos/${dir.name}/config.schema.json`,
          ),
          summary: `页面配置：${dir.name}`,
          kind: "config",
        });
      }
    }
  }

  const configsDir = path.join(workspacePath, "project.config.schema.json");
  if (fs.existsSync(configsDir)) {
    entries.push({
      id: "project-config-schema",
      title: "项目配置",
      path: "project.config.schema.json",
      sourceRef: buildReferenceSourceRef(projectId, "project.config.schema.json"),
      summary: "项目级共享配置 Schema",
      kind: "config",
    });
  }

  const knowledgeDir = path.join(workspacePath, "knowledge");
  if (fs.existsSync(knowledgeDir)) {
    const docs = readKnowledgeDocs(knowledgeDir);
    for (const doc of docs) {
      entries.push({ ...doc, sourceRef: buildReferenceSourceRef(projectId, doc.path) });
    }
  }

  return entries;
}

function readKnowledgeDocs(knowledgeDir: string): Array<
  Omit<ReferenceEntry, "sourceRef">
> {
  const docs: Array<Omit<ReferenceEntry, "sourceRef">> = [];
  const manifestPath = path.join(knowledgeDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        items?: Array<{ path?: unknown; fileName?: unknown; title?: unknown; description?: unknown }>;
      };
      for (const item of manifest?.items ?? []) {
        const rawPath =
          typeof item.path === "string"
            ? item.path
            : typeof item.fileName === "string"
              ? item.fileName
              : "";
        const fileName = rawPath.replace(/\\/g, "/").replace(/^knowledge\//, "");
        if (!fileName || path.isAbsolute(fileName)) continue;
        if (!fileName.endsWith(".md")) continue;
        docs.push({
          id: `knowledge:${fileName}`,
          title:
            typeof item.title === "string" && item.title.trim()
              ? item.title
              : fileName,
          path: `knowledge/${fileName}`,
          summary:
            typeof item.description === "string" && item.description.trim()
              ? item.description
              : `知识文档：${fileName}`,
          kind: "knowledge-doc",
        });
      }
    } catch {
      // ignore manifest parse errors
    }
  }
  return docs;
}

function readTemplateCatalogEntries(
  dataDir: string,
  projectId: string,
): ReferenceEntry[] {
  const readingMapPath = path.join(
    dataDir,
    "knowledge",
    "templates",
    projectId,
    "reading-map.json",
  );
  if (!fs.existsSync(readingMapPath)) return [];
  try {
    const map = JSON.parse(fs.readFileSync(readingMapPath, "utf-8")) as {
      originalEntries?: Array<{
        id?: unknown;
        title?: unknown;
        path?: unknown;
        summary?: unknown;
      }>;
    };
    return (map.originalEntries ?? [])
      .map((entry) => {
        const rawPath =
          typeof entry.path === "string" ? entry.path : "";
        if (!rawPath) return null;
        const kind = rawPath.endsWith(".json")
          ? ("config" as const)
          : rawPath.endsWith(".md")
            ? ("knowledge-doc" as const)
            : ("page" as const);
        return {
          id: typeof entry.id === "string" ? entry.id : rawPath,
          title: typeof entry.title === "string" ? entry.title : rawPath,
          path: rawPath,
          sourceRef: buildReferenceSourceRef(projectId, rawPath),
          summary: typeof entry.summary === "string" ? entry.summary : "",
          kind,
        };
      })
      .filter((entry): entry is ReferenceEntry => Boolean(entry));
  } catch {
    return [];
  }
}
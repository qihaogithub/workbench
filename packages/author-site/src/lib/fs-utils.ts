import path from "path";
import fs from "fs";
import {
  KnowledgeFileStore,
  indexTemplateSnapshot,
} from "@workbench/knowledge-service";
import {
  DemoMeta,
  DemoFiles,
  PrototypePageMeta,
  ProjectTemplateMeta,
  SessionMeta,
  ErrorCodeType,
  ERROR_MESSAGES,
  createDefaultSketchScene,
} from "@workbench/shared";
import type {
  Project,
  VersionInfo,
  VersionHistoryEntryType,
  DemoPageMeta,
  DemoFolderMeta,
  MultiDemoFiles,
  WorkspaceTree,
  AppGraph,
  AppGraphAction,
  AppGraphValidationIssue,
  AppGraphValidationResult,
} from "@workbench/shared";
import { MAX_VERSIONS_KEEP } from "@workbench/shared";
import { syncBuiltinKnowledge } from "./knowledge/builtin-documents";

export function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

const DATA_DIR =
  process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
const PROJECTS_DIR =
  process.env.PROJECTS_DIR || path.join(DATA_DIR, "projects");
const TEMPLATES_DIR =
  process.env.TEMPLATES_DIR || path.join(DATA_DIR, "templates");
const SESSIONS_DIR =
  process.env.SESSIONS_DIR || path.join(DATA_DIR, "sessions");
const WORKSPACES_DIR =
  process.env.WORKSPACES_DIR || path.join(DATA_DIR, "workspaces");
const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || path.join(DATA_DIR, "snapshots");
const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

export function getDataDir(): string {
  return DATA_DIR;
}

export function getProjectsDir(): string {
  return PROJECTS_DIR;
}

export function getTemplatesDir(): string {
  return TEMPLATES_DIR;
}

export function getSnapshotsDir(): string {
  return SNAPSHOTS_DIR;
}

export function getSessionsDir(): string {
  return SESSIONS_DIR;
}

export function getWorkspacesDir(): string {
  return WORKSPACES_DIR;
}

export function ensureDirsExist(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

export function getProjectPath(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}

export function getTemplatePath(templateId: string): string {
  return path.join(TEMPLATES_DIR, templateId);
}

export function getSnapshotPath(projectId: string, versionId: string): string {
  return path.join(SNAPSHOTS_DIR, projectId, versionId);
}

export function getSessionPath(sessionId: string, projectId?: string): string {
  if (projectId) {
    // 先尝试旧结构路径（兼容）
    const directPath = path.join(SESSIONS_DIR, projectId, sessionId);
    if (fs.existsSync(directPath)) {
      return directPath;
    }
    // 否则使用 findSessionPath 搜索（支持新结构 sessions/{userId}/{projectId}/{sessionId}/）
    const foundPath = findSessionPath(sessionId);
    if (foundPath) return foundPath;
    // fallback
    return directPath;
  }
  const foundPath = findSessionPath(sessionId);
  return foundPath || path.join(SESSIONS_DIR, sessionId);
}

export function findSessionPath(sessionId: string): string | null {
  console.log(`[findSessionPath] 查找 session: ${sessionId}`);

  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`[findSessionPath] SESSIONS_DIR 不存在: ${SESSIONS_DIR}`);
    return null;
  }

  console.log(`[findSessionPath] SESSIONS_DIR: ${SESSIONS_DIR}`);

  // 先尝试新结构: {userId}/{projectId}/{sessionId}/
  const level1Entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  console.log(`[findSessionPath] level1 目录数: ${level1Entries.length}`);

  for (const level1 of level1Entries) {
    if (!level1.isDirectory()) continue;

    const level1Path = path.join(SESSIONS_DIR, level1.name);

    // 直接检查是否为目标 session（兼容旧结构）
    const directPath = path.join(level1Path, sessionId);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
      console.log(`[findSessionPath] 找到 session (旧结构): ${directPath}`);
      return directPath;
    }

    // 检查第二层（新结构: {userId}/{projectId}/{sessionId}/）
    const level2Entries = fs.readdirSync(level1Path, { withFileTypes: true });
    for (const level2 of level2Entries) {
      if (!level2.isDirectory()) continue;

      const level2Path = path.join(level1Path, level2.name);

      // 先检查目录名是否匹配
      const sessionPathByName = path.join(level2Path, sessionId);
      if (
        fs.existsSync(sessionPathByName) &&
        fs.statSync(sessionPathByName).isDirectory()
      ) {
        console.log(
          `[findSessionPath] 找到 session (新结构-目录名): ${sessionPathByName}`,
        );
        return sessionPathByName;
      }

      // 遍历第三层，检查 .session.json 中的 sessionId 字段
      const level3Entries = fs.readdirSync(level2Path, { withFileTypes: true });
      for (const level3 of level3Entries) {
        if (!level3.isDirectory()) continue;

        const level3Path = path.join(level2Path, level3.name);
        const metaPath = path.join(level3Path, ".session.json");

        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            if (meta.sessionId === sessionId) {
              console.log(
                `[findSessionPath] 找到 session (新结构-meta): ${level3Path}`,
              );
              return level3Path;
            }
          } catch {
            // 忽略解析错误的文件
          }
        }
      }
    }
  }

  console.error(`[findSessionPath] 未找到 session: ${sessionId}`);
  return null;
}

export function projectExists(projectId: string): boolean {
  const projectPath = getProjectPath(projectId);
  return fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory();
}

export function sessionExists(sessionId: string, projectId?: string): boolean {
  if (projectId) {
    const sessionPath = getSessionPath(sessionId, projectId);
    return fs.existsSync(sessionPath) && fs.statSync(sessionPath).isDirectory();
  }
  return findSessionPath(sessionId) !== null;
}

export function listProjects(): DemoMeta[] {
  ensureDirsExist();

  const projects: DemoMeta[] = [];
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectPath = path.join(PROJECTS_DIR, entry.name);
    const stats = fs.statSync(projectPath);

    const project = readProjectMeta(entry.name);

    projects.push({
      id: entry.name,
      name: project?.name || entry.name,
      createdAt: stats.birthtimeMs,
      updatedAt: stats.mtimeMs,
      thumbnail: project?.thumbnail,
      demoCount: project?.demoPages?.length ?? 1,
      demoPages: project?.demoPages ?? undefined,
    });
  }

  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

function generateTemplateId(): string {
  return `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readTemplateMeta(templateId: string): ProjectTemplateMeta | null {
  const templateJsonPath = path.join(getTemplatePath(templateId), "template.json");
  if (!fs.existsSync(templateJsonPath)) return null;

  try {
    const parsed = JSON.parse(
      fs.readFileSync(templateJsonPath, "utf-8"),
    ) as Partial<ProjectTemplateMeta>;
    if (
      !parsed.id ||
      !parsed.sourceProjectId ||
      !parsed.category ||
      !parsed.name ||
      !parsed.description ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      sourceProjectId: parsed.sourceProjectId,
      category: parsed.category,
      name: parsed.name,
      description: parsed.description,
      thumbnail: parsed.thumbnail,
      scope: parsed.scope,
      official: parsed.official,
      demoCount: parsed.demoCount ?? parsed.demoPages?.length ?? 0,
      demoPages: parsed.demoPages,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt ?? parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function listProjectTemplates(): ProjectTemplateMeta[] {
  ensureDirsExist();

  const templates: ProjectTemplateMeta[] = [];
  const entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readTemplateMeta(entry.name);
    if (meta) templates.push(meta);
  }

  return templates.sort((a, b) => b.updatedAt - a.updatedAt);
}

function resolveProjectWorkspacePath(projectId: string, workspacePath?: string): string | null {
  const candidates = [
    workspacePath,
    path.join(getProjectPath(projectId), "workspace"),
    workspacePath ? findWorkspacePath(workspacePath) : null,
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

function shouldCopyWorkspaceEntry(sourceRoot: string, sourcePath: string): boolean {
  const relative = path.relative(sourceRoot, sourcePath);
  if (!relative) return true;

  const segments = relative.split(path.sep);
  return !segments.some((segment) =>
    segment === "node_modules" ||
    segment === ".next" ||
    segment === ".workbench" ||
    segment === ".git"
  );
}

function copyWorkspaceSnapshot(sourcePath: string, targetPath: string): void {
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    filter: (source) => shouldCopyWorkspaceEntry(sourcePath, source),
  });
}

export function saveProjectAsTemplate(
  projectId: string,
  input: { category: string; name: string; description: string },
): ProjectTemplateMeta {
  ensureDirsExist();

  const project = readProjectMeta(projectId);
  if (!project || !projectExists(projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const category = input.category.trim();
  const name = input.name.trim();
  const description = input.description.trim();
  if (!category || !name || !description) {
    throw new Error("INVALID_REQUEST");
  }

  const sourceWorkspacePath = resolveProjectWorkspacePath(
    projectId,
    project.workspacePath,
  );
  if (!sourceWorkspacePath) {
    throw new Error("FILE_READ_ERROR");
  }

  const templateId = generateTemplateId();
  const templatePath = getTemplatePath(templateId);
  const templateWorkspacePath = path.join(templatePath, "workspace");
  fs.mkdirSync(templatePath, { recursive: true });
  copyWorkspaceSnapshot(sourceWorkspacePath, templateWorkspacePath);

  const now = Date.now();
  const demoPages = listDemoPages(templateWorkspacePath);
  const template: ProjectTemplateMeta = {
    id: templateId,
    sourceProjectId: projectId,
    category,
    name,
    description,
    thumbnail: project.thumbnail,
    demoCount: demoPages.length,
    demoPages,
    createdAt: now,
    updatedAt: now,
  };

  fs.writeFileSync(
    path.join(templatePath, "template.json"),
    JSON.stringify(template, null, 2),
    "utf-8",
  );
  indexTemplateSnapshot(new KnowledgeFileStore({ dataDir: DATA_DIR }), {
    templateId,
    templateName: template.name,
    templateDescription: template.description,
    workspacePath: templateWorkspacePath,
  });

  return template;
}

const DEFAULT_DEMO_CODE = `import React from 'react';

interface DemoProps {
  title: string;
  description: string;
}

export default function Demo({ title, description }: DemoProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
`;

const DEFAULT_DEMO_SCHEMA = JSON.stringify(
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Demo 配置",
    type: "object",
    properties: {
      title: {
        type: "string",
        title: "标题",
        default: "Hello World",
      },
      description: {
        type: "string",
        title: "描述",
        default: "This is a demo",
      },
    },
    required: ["title"],
  },
  null,
  2,
);

// ============================================================
// Demo 页面 ID 与目录工具函数（多页面架构）
// ============================================================

/**
 * 将页面名称转为文件系统安全的 slug。
 * - ASCII 字母数字保留，空格/特殊字符 → `-`，全小写
 * - 非 ASCII 字符（中文等）直接丢弃
 * - 合并连续 `-`，去除首尾 `-`
 * - 截断到 20 字符
 * - 空结果回退 `page`
 *
 * @example
 *   generatePageSlug("Landing Page")    // → "landing-page"
 *   generatePageSlug("Product Detail")  // → "product-detail"
 *   generatePageSlug("首页")            // → "page"（中文被丢弃，回退默认）
 *   generatePageSlug("首页 Home")       // → "home"
 *   generatePageSlug("")                // → "page"
 */
export function generatePageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    // 保留 ASCII 字母数字和空格/连字符，丢弃其他字符（含中文）
    .replace(/[^a-z0-9\s-]/g, "")
    // 空格替换为 `-`
    .replace(/\s+/g, "-")
    // 合并连续 `-`
    .replace(/-{2,}/g, "-")
    // 去除首尾 `-`
    .replace(/^-|-$/g, "")
    // 截断到 20 字符
    .slice(0, 20)
    // 截断后可能产生尾部 `-`
    .replace(/-$/, "");

  return slug || "page";
}

export function isValidRouteKey(routeKey: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(routeKey);
}

function makeUniqueRouteKey(base: string, used: Set<string>): string {
  const normalizedBase = isValidRouteKey(base) ? base : generatePageSlug(base);
  let candidate = normalizedBase || "page";
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${normalizedBase || "page"}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function generateRouteKey(
  name: string,
  existingRouteKeys: string[] = [],
): string {
  return makeUniqueRouteKey(generatePageSlug(name), new Set(existingRouteKeys));
}

function normalizeWorkspacePagesRouteKeys(
  pages: DemoPageMeta[],
): { pages: DemoPageMeta[]; changed: boolean } {
  const used = new Set<string>();
  let changed = false;
  const normalizedPages = pages.map((page) => {
    const current = typeof page.routeKey === "string" ? page.routeKey.trim() : "";
    if (current && isValidRouteKey(current) && !used.has(current)) {
      used.add(current);
      return page;
    }

    changed = true;
    return {
      ...page,
      routeKey: makeUniqueRouteKey(current || page.name || page.id, used),
    };
  });
  return { pages: normalizedPages, changed };
}

/**
 * 生成 Demo 页面 ID。
 * 格式 `{slug}_{4位随机}`，如 `product-detail_a3f2`。
 * slug 由 `generatePageSlug(name)` 生成，保证目录名有语义。
 */
export function generateDemoPageId(name?: string): string {
  const slug = generatePageSlug(name || "Default Page");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}_${rand}`;
}

/**
 * 获取页面目录的绝对路径
 */
export function getDemoDirPath(workspacePath: string, demoId: string): string {
  return path.join(workspacePath, "demos", demoId);
}

// ============================================================
// Workspace 统一清单（workspace-tree.json）— 取代 .demo.json + .folders.json
// ============================================================

const WORKSPACE_TREE_FILENAME = "workspace-tree.json";
const APP_GRAPH_FILENAME = "app.graph.json";
const MEMORY_FILENAME = "memory.md";

function getWorkspaceTreePath(workspacePath: string): string {
  return path.join(workspacePath, WORKSPACE_TREE_FILENAME);
}

export function getAppGraphPath(workspacePath: string): string {
  return path.join(workspacePath, APP_GRAPH_FILENAME);
}

function buildInitialMemoryContent(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `# 项目记忆

> AI 自动维护 · 最后更新：${today}

## 我的偏好

- （等待用户表达偏好后自动记录）

## 关键决策

- （等待用户做出决策后自动记录）
`;
}

/**
 * 从旧格式（.folders.json + demos/{id}/.demo.json）迁移到 workspace-tree.json。
 * 仅在 workspace-tree.json 不存在时自动执行，写入后即持久化为新格式。
 */
function migrateLegacyToTree(workspacePath: string): WorkspaceTree {
  let folders: DemoFolderMeta[] = [];
  const legacyFoldersPath = path.join(workspacePath, ".folders.json");
  if (fs.existsSync(legacyFoldersPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyFoldersPath, "utf-8"));
      if (Array.isArray(parsed?.folders)) {
        folders = parsed.folders.map((f: Record<string, unknown>) => ({
          id: f.id as string,
          name: f.name as string,
          order: f.order as number,
          parentId: (f.parentId ?? null) as string | null,
        }));
      }
    } catch {
      /* ignore */
    }
  }

  const pages: DemoPageMeta[] = [];
  const demosDir = path.join(workspacePath, "demos");
  if (fs.existsSync(demosDir)) {
    for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const legacyMetaPath = path.join(demosDir, entry.name, ".demo.json");
      if (fs.existsSync(legacyMetaPath)) {
        try {
          const m = JSON.parse(fs.readFileSync(legacyMetaPath, "utf-8"));
          pages.push({
            id: (m.id as string) || entry.name,
            name: (m.name as string) || entry.name,
            order: typeof m.order === "number" ? m.order : pages.length,
            parentId: (m.parentId ?? null) as string | null,
          });
        } catch {
          /* ignore */
        }
      } else {
        // 目录存在但无 .demo.json：用目录名兜底
        const dir = path.join(demosDir, entry.name);
        if (
          fs.existsSync(path.join(dir, "index.tsx")) &&
          fs.existsSync(path.join(dir, "config.schema.json"))
        ) {
          pages.push({
            id: entry.name,
            name: entry.name.split("_")[0].replace(/-/g, " "),
            order: pages.length,
            parentId: null,
          });
        }
      }
    }
  }

  const tree: WorkspaceTree = {
    folders,
    pages: normalizeWorkspacePagesRouteKeys(pages).pages,
  };
  writeWorkspaceTree(workspacePath, tree);
  return tree;
}

/**
 * 读取 Workspace 统一清单（workspace-tree.json）。
 * 文件不存在时自动从旧格式迁移。
 */
function readWorkspaceTree(workspacePath: string): WorkspaceTree {
  const treePath = getWorkspaceTreePath(workspacePath);
  if (fs.existsSync(treePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(treePath, "utf-8"));
      const tree = {
        folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
        pages: Array.isArray(parsed?.pages) ? parsed.pages : [],
      };
      const normalized = normalizeWorkspacePagesRouteKeys(tree.pages);
      if (normalized.changed) {
        writeWorkspaceTree(workspacePath, {
          folders: tree.folders,
          pages: normalized.pages,
        });
      }
      return {
        folders: tree.folders,
        pages: normalized.pages,
      };
    } catch {
      /* fall through to migration */
    }
  }
  return migrateLegacyToTree(workspacePath);
}

/**
 * 将统一清单写回 workspace-tree.json。
 * workspacePath 目录不存在时自动创建。
 */
function writeWorkspaceTree(workspacePath: string, tree: WorkspaceTree): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  fs.writeFileSync(
    getWorkspaceTreePath(workspacePath),
    JSON.stringify(tree, null, 2),
    "utf-8",
  );
}

/**
 * 读取页面元数据（从 workspace-tree.json 的 pages 数组）。
 * 页面不存在于清单中时返回 null。
 */
export function readDemoPageMeta(
  workspacePath: string,
  demoId: string,
): DemoPageMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  return tree.pages.find((p) => p.id === demoId) ?? null;
}

/**
 * 写入或合并页面元数据到 workspace-tree.json 的 pages 数组。
 * 不再维护 createdAt / updatedAt 字段。
 */
export function writeDemoPageMeta(
  workspacePath: string,
  demoId: string,
  patch: Partial<DemoPageMeta>,
): DemoPageMeta {
  const tree = readWorkspaceTree(workspacePath);
  const existingIdx = tree.pages.findIndex((p) => p.id === demoId);
  const existing = existingIdx !== -1 ? tree.pages[existingIdx] : null;
  const usedRouteKeys = new Set(
    tree.pages
      .filter((page) => page.id !== demoId && page.routeKey)
      .map((page) => page.routeKey as string),
  );
  const requestedRouteKey =
    typeof patch.routeKey === "string" ? patch.routeKey.trim() : undefined;
  const nextRouteKey =
    requestedRouteKey !== undefined
      ? makeUniqueRouteKey(requestedRouteKey, usedRouteKeys)
      : existing?.routeKey && isValidRouteKey(existing.routeKey)
        ? makeUniqueRouteKey(existing.routeKey, usedRouteKeys)
        : makeUniqueRouteKey(patch.name ?? existing?.name ?? demoId, usedRouteKeys);
  const merged: DemoPageMeta = {
    id: existing?.id ?? demoId,
    name: patch.name ?? existing?.name ?? demoId,
    routeKey: nextRouteKey,
    runtimeType:
      patch.runtimeType !== undefined
        ? patch.runtimeType
        : existing?.runtimeType,
    order: patch.order ?? existing?.order ?? 0,
    parentId:
      patch.parentId !== undefined
        ? patch.parentId
        : (existing?.parentId ?? null),
  };
  if (existingIdx !== -1) {
    tree.pages[existingIdx] = merged;
  } else {
    tree.pages.push(merged);
  }
  writeWorkspaceTree(workspacePath, tree);
  return merged;
}

/**
 * 列出 workspace 内所有有效的 Demo 页面（按 order/id 升序）。
 * 真值来源是文件系统 `demos/` 目录；元数据由 workspace-tree.json 提供。
 */
export function listDemoPages(workspacePath: string): DemoPageMeta[] {
  const demosDir = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosDir)) return [];

  const tree = readWorkspaceTree(workspacePath);
  const result: DemoPageMeta[] = [];

  for (const page of tree.pages) {
    const dir = path.join(demosDir, page.id);
    const runtimeType =
      page.runtimeType === "prototype-html-css"
        ? "prototype-html-css"
        : page.runtimeType === "sketch-scene"
          ? "sketch-scene"
          : "high-fidelity-react";
    if (
      fs.existsSync(path.join(dir, "config.schema.json")) &&
      (runtimeType === "prototype-html-css"
        ? fs.existsSync(path.join(dir, "prototype.html"))
        : runtimeType === "sketch-scene"
          ? fs.existsSync(path.join(dir, "sketch.scene.json"))
          : fs.existsSync(path.join(dir, "index.tsx")))
    ) {
      result.push(page);
    }
  }

  // 同时发现磁盘上有但 tree 中缺失的页面（如 AI Agent 创建后未更新 tree）
  const routeKeys = new Set(result.map((page) => page.routeKey).filter(Boolean) as string[]);
  for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (result.some((p) => p.id === entry.name)) continue;
    const dir = path.join(demosDir, entry.name);
    const hasSchema = fs.existsSync(path.join(dir, "config.schema.json"));
    const hasReactCode = fs.existsSync(path.join(dir, "index.tsx"));
    const hasPrototype = fs.existsSync(path.join(dir, "prototype.html"));
    const hasSketchScene = fs.existsSync(path.join(dir, "sketch.scene.json"));
    if (
      hasSchema &&
      (hasReactCode || hasPrototype || hasSketchScene)
    ) {
      const runtimeType =
        !hasReactCode && hasSketchScene
          ? "sketch-scene"
          : !hasReactCode && hasPrototype
            ? "prototype-html-css"
            : undefined;
      result.push({
        id: entry.name,
        name: entry.name.split("_")[0].replace(/-/g, " "),
        routeKey: makeUniqueRouteKey(entry.name, routeKeys),
        runtimeType,
        order: result.length,
        parentId: null,
      });
    }
  }

  return result.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAppGraphAction(value: unknown): AppGraphAction | null {
  if (!isRecord(value)) return null;
  if (typeof value.from !== "string" || typeof value.event !== "string") {
    return null;
  }
  const action: AppGraphAction = {
    from: value.from,
    event: value.event,
  };
  if (typeof value.to === "string" && value.to.trim()) {
    action.to = value.to;
  }
  if (Array.isArray(value.params)) {
    action.params = value.params.filter((param): param is string => typeof param === "string");
  }
  if (isRecord(value.setState)) {
    action.setState = Object.fromEntries(
      Object.entries(value.setState).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  if (typeof value.condition === "string" && value.condition.trim()) {
    action.condition = value.condition;
  }
  if (typeof value.fallback === "string" && value.fallback.trim()) {
    action.fallback = value.fallback;
  }
  return action;
}

function normalizeAppGraph(
  workspacePath: string,
  input?: Partial<AppGraph> | null,
): AppGraph {
  const pages = listDemoPages(workspacePath);
  const graphPages: AppGraph["pages"] = {};
  for (const page of pages) {
    if (!page.routeKey) continue;
    graphPages[page.routeKey] = {
      pageId: page.id,
      title: page.name,
    };
  }

  const routeKeys = new Set(Object.keys(graphPages));
  const rawEntry = typeof input?.entry === "string" ? input.entry : "";
  const firstRouteKey = pages.find((page) => page.routeKey)?.routeKey ?? "";
  const entry = routeKeys.has(rawEntry) ? rawEntry : firstRouteKey;

  const actions = Array.isArray(input?.actions)
    ? input.actions
        .map((action) => normalizeAppGraphAction(action))
        .filter((action): action is AppGraphAction => action !== null)
    : [];

  return {
    version: 1,
    entry,
    pages: graphPages,
    actions,
    state: isRecord(input?.state) ? input.state : {},
  };
}

export function readAppGraph(workspacePath: string): AppGraph {
  const graphPath = getAppGraphPath(workspacePath);
  let parsed: Partial<AppGraph> | null = null;
  if (fs.existsSync(graphPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as Partial<AppGraph>;
    } catch {
      parsed = null;
    }
  }
  return normalizeAppGraph(workspacePath, parsed);
}

export function writeAppGraph(
  workspacePath: string,
  graph: Partial<AppGraph>,
): AppGraph {
  const normalized = normalizeAppGraph(workspacePath, graph);
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  fs.writeFileSync(
    getAppGraphPath(workspacePath),
    JSON.stringify(normalized, null, 2),
    "utf-8",
  );
  return normalized;
}

export function ensureAppGraph(workspacePath: string): AppGraph {
  return writeAppGraph(workspacePath, readAppGraph(workspacePath));
}

export function validateAppGraph(graph: AppGraph): AppGraphValidationResult {
  const issues: AppGraphValidationIssue[] = [];
  const pageRouteKeys = new Set(Object.keys(graph.pages));

  if (graph.entry && !pageRouteKeys.has(graph.entry)) {
    issues.push({
      code: "ENTRY_MISSING",
      message: `入口页面不存在: ${graph.entry}`,
      severity: "error",
      routeKey: graph.entry,
    });
  }

  for (const [routeKey, node] of Object.entries(graph.pages)) {
    if (!isValidRouteKey(routeKey)) {
      issues.push({
        code: "PAGE_ROUTE_KEY_INVALID",
        message: `页面 routeKey 不合法: ${routeKey}`,
        severity: "error",
        routeKey,
      });
    }
    if (!node.pageId) {
      issues.push({
        code: "PAGE_TARGET_MISSING",
        message: `页面节点缺少 pageId: ${routeKey}`,
        severity: "error",
        routeKey,
      });
    }
  }

  const actionKeys = new Set<string>();
  for (const action of graph.actions) {
    if (!pageRouteKeys.has(action.from)) {
      issues.push({
        code: "ACTION_FROM_MISSING",
        message: `动作来源页面不存在: ${action.from}`,
        severity: "error",
        routeKey: action.from,
        event: action.event,
      });
    }
    if (action.to && !pageRouteKeys.has(action.to)) {
      issues.push({
        code: "ACTION_TO_MISSING",
        message: `动作目标页面不存在: ${action.to}`,
        severity: "error",
        routeKey: action.to,
        event: action.event,
      });
    }
    if (action.fallback && !pageRouteKeys.has(action.fallback)) {
      issues.push({
        code: "ACTION_FALLBACK_MISSING",
        message: `动作兜底页面不存在: ${action.fallback}`,
        severity: "error",
        routeKey: action.fallback,
        event: action.event,
      });
    }

    const key = `${action.from}:${action.event}`;
    if (actionKeys.has(key)) {
      issues.push({
        code: "ACTION_DUPLICATE",
        message: `重复动作: ${key}`,
        severity: "error",
        routeKey: action.from,
        event: action.event,
      });
    }
    actionKeys.add(key);
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

function removePageFromAppGraph(workspacePath: string, demoId: string): void {
  const graph = readAppGraph(workspacePath);
  const routeKey = Object.entries(graph.pages).find(
    ([, node]) => node.pageId === demoId,
  )?.[0];
  if (!routeKey) return;

  const nextActions = graph.actions.filter(
    (action) =>
      action.from !== routeKey &&
      action.to !== routeKey &&
      action.fallback !== routeKey,
  );
  const nextEntry =
    graph.entry === routeKey
      ? Object.entries(graph.pages).find(([, node]) => node.pageId !== demoId)?.[0] ?? ""
      : graph.entry;
  writeAppGraph(workspacePath, {
    ...graph,
    entry: nextEntry,
    actions: nextActions,
  });
}

export function ensureWorkspaceFiles(workspacePath: string): {
  demoIds: string[];
  defaultDemoMeta?: DemoPageMeta;
} {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const demosDir = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosDir)) {
    fs.mkdirSync(demosDir, { recursive: true });
  }

  // 确保知识库目录存在并清理历史 system 条目
  ensureKnowledgeDir(workspacePath);
  ensureMemoryFile(workspacePath);

  const existing: string[] = [];
  for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(demosDir, entry.name);
    if (
      fs.existsSync(path.join(dir, "index.tsx")) &&
      fs.existsSync(path.join(dir, "config.schema.json"))
    ) {
      existing.push(entry.name);
    }
  }

  if (existing.length > 0) {
    // 确保 workspace-tree.json 存在且与磁盘一致（修复 Docker 部署后页面丢失问题）
    readWorkspaceTree(workspacePath);
    ensureAppGraph(workspacePath);
    return { demoIds: existing };
  }

  // 空项目只初始化目录与清单，不再自动创建默认页面。
  readWorkspaceTree(workspacePath);
  ensureAppGraph(workspacePath);

  return { demoIds: [] };
}

/** 确保知识库目录存在，并清理历史 system 条目。 */
function ensureKnowledgeDir(workspacePath: string): void {
  syncBuiltinKnowledge(workspacePath);
}

export function ensureMemoryFile(workspacePath: string): void {
  const memoryPath = path.join(workspacePath, MEMORY_FILENAME);
  if (fs.existsSync(memoryPath)) return;

  fs.writeFileSync(memoryPath, buildInitialMemoryContent(), "utf-8");
}

function createProjectFromTemplate(name: string, templateId: string): DemoMeta {
  ensureDirsExist();

  const template = readTemplateMeta(templateId);
  const templatePath = getTemplatePath(templateId);
  const templateWorkspacePath = path.join(templatePath, "workspace");
  if (!template || !fs.existsSync(templateWorkspacePath)) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }

  const projectId = `proj_${Date.now()}`;
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");
  fs.mkdirSync(projectPath, { recursive: true });
  copyWorkspaceSnapshot(templateWorkspacePath, workspacePath);

  ensureWorkspaceFiles(workspacePath);

  const now = Date.now();
  const demoPages = listDemoPages(workspacePath);
  const project: Project = {
    id: projectId,
    name: name || template.name || projectId,
    description: template.description,
    workspacePath,
    demoPages,
    demoFolders: readWorkspaceTree(workspacePath).folders,
    versions: [],
    createdAt: now,
    updatedAt: now,
    thumbnail: template.thumbnail,
  };

  fs.writeFileSync(
    path.join(projectPath, "project.json"),
    JSON.stringify(project, null, 2),
    "utf-8",
  );

  const stats = fs.statSync(projectPath);

  return {
    id: projectId,
    name: project.name,
    createdAt: stats.birthtimeMs,
    updatedAt: stats.mtimeMs,
    thumbnail: project.thumbnail,
    demoCount: demoPages.length,
    demoPages,
  };
}

export function createProject(name: string, templateId?: string): DemoMeta {
  if (templateId) {
    return createProjectFromTemplate(name, templateId);
  }

  ensureDirsExist();

  const projectId = `proj_${Date.now()}`;
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");

  const { demoIds, defaultDemoMeta } = ensureWorkspaceFiles(workspacePath);

  // 多页面架构：项目元数据需记录所有 demo 页面的 meta
  const now = Date.now();
  const demoPages: DemoPageMeta[] = demoIds.map((demoId, index) => {
    if (defaultDemoMeta && demoId === defaultDemoMeta.id) {
      return defaultDemoMeta;
    }
    const meta = readDemoPageMeta(workspacePath, demoId);
    return (
      meta ?? {
        id: demoId,
        name: demoId,
        order: index,
        parentId: null,
      }
    );
  });

  const project: Project = {
    id: projectId,
    name: name || projectId,
    workspacePath,
    demoPages,
    demoFolders: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };

  fs.writeFileSync(
    path.join(projectPath, "project.json"),
    JSON.stringify(project, null, 2),
    "utf-8",
  );

  const stats = fs.statSync(projectPath);

  return {
    id: projectId,
    name: name || projectId,
    createdAt: stats.birthtimeMs,
    updatedAt: stats.mtimeMs,
  };
}

export function deleteProject(projectId: string): boolean {
  if (!projectExists(projectId)) {
    return false;
  }

  const projectPath = getProjectPath(projectId);
  fs.rmSync(projectPath, { recursive: true, force: true });

  return true;
}

export function createSession(projectId: string): SessionMeta {
  ensureDirsExist();

  if (!projectExists(projectId)) {
    throw new Error(ERROR_MESSAGES.DEMO_NOT_FOUND);
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const sessionDir = path.join(SESSIONS_DIR, projectId);
  const sessionPath = path.join(sessionDir, sessionId);
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");

  ensureWorkspaceFiles(workspacePath);

  fs.mkdirSync(sessionDir, { recursive: true });
  fs.cpSync(workspacePath, sessionPath, { recursive: true });

  const now = Date.now();
  const sessionMeta: SessionMeta = {
    sessionId,
    demoId: projectId,
    createdAt: now,
    expiresAt: now + SESSION_EXPIRY_MS,
  };

  fs.writeFileSync(
    path.join(sessionPath, ".session.json"),
    JSON.stringify(sessionMeta, null, 2),
    "utf-8",
  );

  return sessionMeta;
}

export function getSessionMeta(sessionId: string): SessionMeta | null {
  console.log(`[getSessionMeta] 获取 session 元数据: ${sessionId}`);

  if (!sessionExists(sessionId)) {
    console.error(`[getSessionMeta] session 不存在: ${sessionId}`);
    return null;
  }

  const sessionPath = getSessionPath(sessionId);
  console.log(`[getSessionMeta] sessionPath: ${sessionPath}`);

  const metaPath = path.join(sessionPath, ".session.json");
  console.log(`[getSessionMeta] metaPath: ${metaPath}`);

  if (!fs.existsSync(metaPath)) {
    console.error(`[getSessionMeta] .session.json 文件不存在: ${metaPath}`);
    return null;
  }

  const content = fs.readFileSync(metaPath, "utf-8");
  console.log(`[getSessionMeta] .session.json 内容: ${content}`);

  const meta = JSON.parse(content) as SessionMeta;
  console.log(`[getSessionMeta] 解析后的元数据:`, meta);

  return meta;
}

export function deleteSession(sessionId: string): boolean {
  if (!sessionExists(sessionId)) {
    return false;
  }

  const sessionPath = getSessionPath(sessionId);

  try {
      const metaPath = path.join(sessionPath, ".session.json");
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (meta.workspaceId) {
          const wsPath = findWorkspacePath(meta.workspaceId);
          if (wsPath && fs.existsSync(wsPath)) {
            const wsMetaPath = path.join(wsPath, ".workspace.json");
            const wsMeta = fs.existsSync(wsMetaPath)
              ? JSON.parse(fs.readFileSync(wsMetaPath, "utf-8"))
              : null;
            if (wsMeta?.scope !== "live") {
              fs.rmSync(wsPath, { recursive: true, force: true });
            }
          }
        }
      }
  } catch {
    // 元数据读取失败不影响 session 删除
  }

  fs.rmSync(sessionPath, { recursive: true, force: true });

  return true;
}

export function isSessionExpired(sessionMeta: SessionMeta): boolean {
  return Date.now() > sessionMeta.expiresAt;
}

export function createApiError(
  code: ErrorCodeType,
  message?: string,
  details?: unknown,
) {
  return {
    success: false as const,
    error: {
      code,
      message: message || ERROR_MESSAGES[code],
      details,
    },
  };
}

export function createApiSuccess<T>(data: T) {
  return {
    success: true as const,
    data,
  };
}

// ========================================
// 项目元数据操作
// ========================================

export function readProjectMeta(projectId: string): Project | null {
  const projectPath = getProjectPath(projectId);
  const projectJsonPath = path.join(projectPath, "project.json");

  if (!fs.existsSync(projectJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(projectJsonPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<Project>;
    // 防御性兜底：旧版 project.json 可能缺少 demoPages / versions / demoFolders
    const demoPages = Array.isArray(parsed.demoPages)
      ? parsed.demoPages.map((p) => ({ ...p, parentId: p.parentId ?? null }))
      : [];
    return {
      ...parsed,
      id: parsed.id ?? projectId,
      name: parsed.name ?? projectId,
      workspacePath:
        parsed.workspacePath ?? path.join(projectPath, "workspace"),
      demoPages,
      demoFolders: Array.isArray(parsed.demoFolders) ? parsed.demoFolders : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      createdAt: parsed.createdAt ?? Date.now(),
      updatedAt: parsed.updatedAt ?? Date.now(),
      activeWorkspaceId:
        typeof parsed.activeWorkspaceId === "string"
          ? parsed.activeWorkspaceId
          : undefined,
      activeWorkspaceUpdatedAt:
        typeof parsed.activeWorkspaceUpdatedAt === "number"
          ? parsed.activeWorkspaceUpdatedAt
          : undefined,
      canonicalSyncedWorkspaceId:
        typeof parsed.canonicalSyncedWorkspaceId === "string"
          ? parsed.canonicalSyncedWorkspaceId
          : undefined,
      canonicalSyncedAt:
        typeof parsed.canonicalSyncedAt === "number"
          ? parsed.canonicalSyncedAt
          : undefined,
    } as Project;
  } catch {
    return null;
  }
}

export function writeProjectMeta(projectId: string, project: Project): void {
  const projectPath = getProjectPath(projectId);
  const projectJsonPath = path.join(projectPath, "project.json");
  fs.writeFileSync(projectJsonPath, JSON.stringify(project, null, 2), "utf-8");
}

// ========================================
// 版本管理工具函数
// ========================================

export function countFiles(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }

  return count;
}

export function generateVersionId(project: Project): string {
  const maxVersion = project.versions.reduce(
    (max, version) => {
      const match = /^v(\d+)$/.exec(version.versionId);
      return match ? Math.max(max, Number(match[1])) : max;
    },
    0,
  );
  return `v${maxVersion + 1}`;
}

export function cleanupOldVersions(project: Project): void {
  if (project.versions.length <= MAX_VERSIONS_KEEP) return;

  const removeCount = project.versions.length - MAX_VERSIONS_KEEP;
  const removable = project.versions
    .map((version, index) => ({ version, index }))
    .filter(({ version }) => version.type === "auto_checkpoint");
  const fallback = project.versions.map((version, index) => ({ version, index }));
  const toDeleteEntries = [...removable, ...fallback]
    .filter(
      (entry, index, all) =>
        all.findIndex((item) => item.index === entry.index) === index,
    )
    .slice(0, removeCount);
  const deleteIndexes = new Set(toDeleteEntries.map((entry) => entry.index));

  for (const { version } of toDeleteEntries) {
    if (fs.existsSync(version.snapshotPath)) {
      fs.rmSync(version.snapshotPath, { recursive: true, force: true });
    }
  }

  project.versions = project.versions.filter((_, index) => !deleteIndexes.has(index));
}

export function createProjectVersionSnapshot(
  projectId: string,
  username: string,
  options?: {
    sessionId?: string;
    note?: string;
    type?: VersionHistoryEntryType;
    sourceWorkspacePath?: string;
    advanceWorkspaceId?: string | null;
  },
): { success: boolean; version?: VersionInfo; error?: string } {
  const project = readProjectMeta(projectId);
  if (!project) {
    return { success: false, error: "项目不存在" };
  }

  const workspacePath = path.join(getProjectPath(projectId), "workspace");
  const sourceWorkspacePath = options?.sourceWorkspacePath || workspacePath;
  if (!fs.existsSync(sourceWorkspacePath)) {
    return { success: false, error: "工作空间不存在" };
  }
  const workspaceToAdvance =
    options?.advanceWorkspaceId ??
    inferSyncedActiveWorkspaceForVersion(projectId, project, sourceWorkspacePath);
  if (workspaceToAdvance && !canAdvanceWorkspaceBase(projectId, workspaceToAdvance)) {
    return { success: false, error: "Workspace 版本基线不可更新" };
  }

  const versionId = generateVersionId(project);
  const snapshotPath = getSnapshotPath(projectId, versionId);

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.rmSync(snapshotPath, { recursive: true, force: true });
  fs.cpSync(sourceWorkspacePath, snapshotPath, {
    recursive: true,
    filter: (src: string) => {
      const basename = path.basename(src);
      return (
        !src.includes("node_modules") &&
        basename !== ".session.json" &&
        basename !== ".workspace.json"
      );
    },
  });

  const versionInfo: VersionInfo = {
    versionId,
    type: options?.type ?? "named_version",
    savedAt: Date.now(),
    savedBy: username,
    sessionId: options?.sessionId ?? `snapshot-${versionId}`,
    snapshotPath,
    fileCount: countFiles(sourceWorkspacePath),
    note: options?.note,
  };

  project.versions.push(versionInfo);
  project.updatedAt = versionInfo.savedAt;
  cleanupOldVersions(project);
  writeProjectMeta(projectId, project);
  if (workspaceToAdvance && !markWorkspaceBasedOnVersion(workspaceToAdvance, versionId)) {
    return { success: false, error: "更新 Workspace 版本基线失败" };
  }

  return { success: true, version: versionInfo };
}

function canAdvanceWorkspaceBase(projectId: string, workspaceId: string): boolean {
  const project = readProjectMeta(projectId);
  const meta = getWorkspaceMeta(workspaceId);
  return Boolean(
    project?.activeWorkspaceId === workspaceId &&
      meta &&
      meta.projectId === projectId &&
      meta.status !== "archived",
  );
}

function inferSyncedActiveWorkspaceForVersion(
  projectId: string,
  project: Project,
  sourceWorkspacePath: string,
): string | null {
  if (!project.activeWorkspaceId) return null;
  if (project.canonicalSyncedWorkspaceId !== project.activeWorkspaceId) return null;

  const projectWorkspacePath = path.join(getProjectPath(projectId), "workspace");
  if (path.resolve(sourceWorkspacePath) !== path.resolve(projectWorkspacePath)) {
    return null;
  }

  const workspaceMeta = getWorkspaceMeta(project.activeWorkspaceId);
  if (!workspaceMeta || workspaceMeta.projectId !== projectId || workspaceMeta.status === "archived") {
    return null;
  }
  const activeUpdatedAt =
    workspaceMeta.updatedAt ?? project.activeWorkspaceUpdatedAt ?? 0;
  if (activeUpdatedAt > (project.canonicalSyncedAt ?? 0)) return null;

  return project.activeWorkspaceId;
}

// ========================================
// 版本历史查询
// ========================================

export function getVersionHistory(projectId: string): VersionInfo[] {
  const project = readProjectMeta(projectId);
  if (!project) return [];
  return [...project.versions].reverse();
}

export function getLatestVersion(projectId: string): VersionInfo | null {
  const project = readProjectMeta(projectId);
  if (!project || project.versions.length === 0) return null;
  return project.versions[project.versions.length - 1];
}

// ========================================
// 版本恢复
// ========================================

export function restoreVersion(
  projectId: string,
  versionId: string,
  username?: string,
): { success: boolean; newVersionId?: string; error?: string } {
  const project = readProjectMeta(projectId);
  if (!project) {
    return { success: false, error: "项目不存在" };
  }

  const targetVersion = project.versions.find((v) => v.versionId === versionId);
  if (!targetVersion) {
    return { success: false, error: `版本 ${versionId} 不存在` };
  }

  if (!fs.existsSync(targetVersion.snapshotPath)) {
    return { success: false, error: `版本快照已丢失: ${versionId}` };
  }

  const workspacePath = path.join(getProjectPath(projectId), "workspace");

  // 1. 备份当前 workspace
  const backupVersionId = generateVersionId(project);
  const backupSnapshotPath = getSnapshotPath(projectId, backupVersionId);
  fs.mkdirSync(path.dirname(backupSnapshotPath), { recursive: true });
  fs.cpSync(workspacePath, backupSnapshotPath, { recursive: true });

  const backupVersion: VersionInfo = {
    versionId: backupVersionId,
    type: "auto_checkpoint",
    savedAt: Date.now(),
    savedBy: username || "system",
    sessionId: `restore-from-${versionId}`,
    snapshotPath: backupSnapshotPath,
    fileCount: countFiles(workspacePath),
    note: `恢复版本前的自动备份 (基于 ${versionId})`,
  };
  project.versions.push(backupVersion);

  // 2. 用目标版本快照覆盖 workspace
  fs.rmSync(workspacePath, { recursive: true, force: true });
  fs.cpSync(targetVersion.snapshotPath, workspacePath, { recursive: true });
  if (project.activeWorkspaceId) {
    const activeWorkspacePath = findWorkspacePath(project.activeWorkspaceId);
    if (activeWorkspacePath) {
      const activeMetaPath = path.join(activeWorkspacePath, ".workspace.json");
      const activeMeta = fs.existsSync(activeMetaPath)
        ? JSON.parse(fs.readFileSync(activeMetaPath, "utf-8"))
        : {
            workspaceId: project.activeWorkspaceId,
            demoId: projectId,
            projectId,
            scope: "live",
            status: "active",
            createdAt: Date.now(),
          };
      fs.rmSync(activeWorkspacePath, { recursive: true, force: true });
      fs.cpSync(targetVersion.snapshotPath, activeWorkspacePath, { recursive: true });
      fs.writeFileSync(
        path.join(activeWorkspacePath, ".workspace.json"),
        JSON.stringify(
          {
            ...activeMeta,
            demoId: projectId,
            projectId,
            scope: activeMeta.scope ?? "live",
            status: activeMeta.status ?? "active",
            updatedAt: Date.now(),
          },
          null,
          2,
        ),
        "utf-8",
      );
      project.activeWorkspaceUpdatedAt = Date.now();
      project.canonicalSyncedWorkspaceId = project.activeWorkspaceId;
      project.canonicalSyncedAt = Date.now();
    }
  }

  // 3. 记录恢复操作作为新版本
  const restoreVersionId = generateVersionId(project);
  const restoreSnapshotPath = getSnapshotPath(projectId, restoreVersionId);
  fs.cpSync(workspacePath, restoreSnapshotPath, { recursive: true });

  const restoreVersionInfo: VersionInfo = {
    versionId: restoreVersionId,
    type: "restore_snapshot",
    savedAt: Date.now(),
    savedBy: username || "system",
    sessionId: `restore-${versionId}`,
    snapshotPath: restoreSnapshotPath,
    fileCount: countFiles(workspacePath),
    note: `恢复到版本 ${versionId}`,
  };
  project.versions.push(restoreVersionInfo);
  project.updatedAt = Date.now();
  if (project.activeWorkspaceId) {
    markWorkspaceBasedOnVersion(project.activeWorkspaceId, restoreVersionId);
  }

  // 4. 清理旧版本
  cleanupOldVersions(project);

  // 5. 保存项目元数据
  writeProjectMeta(projectId, project);

  return { success: true, newVersionId: restoreVersionId };
}

// ========================================
// Session Assets 工具函数
// ========================================

export function getSessionAssetsPath(sessionId: string): string | null {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath) return null;
  return path.join(sessionPath, "assets", "images");
}

export function ensureSessionAssetsDir(sessionId: string): string | null {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath) return null;
  if (!fs.existsSync(assetsPath)) {
    fs.mkdirSync(assetsPath, { recursive: true });
  }
  return assetsPath;
}

export function generateAssetFilename(originalName: string): string {
  const ext = path.extname(originalName) || ".bin";
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `img_${timestamp}_${random}${ext}`;
}

export function saveSessionAsset(
  sessionId: string,
  filename: string,
  data: Buffer,
): { success: boolean; url?: string; error?: string } {
  try {
    const assetsPath = ensureSessionAssetsDir(sessionId);
    if (!assetsPath) {
      return { success: false, error: "Session 不存在" };
    }

    const filePath = path.join(assetsPath, filename);
    fs.writeFileSync(filePath, data);

    const url = `/api/sessions/${sessionId}/assets/${filename}`;
    return { success: true, url };
  } catch (error) {
    return { success: false, error: `保存文件失败: ${error}` };
  }
}

export function getSessionAssetPath(
  sessionId: string,
  filename: string,
): string | null {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath) return null;

  const filePath = path.join(assetsPath, filename);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

export function deleteSessionAsset(
  sessionId: string,
  filename: string,
): boolean {
  const filePath = getSessionAssetPath(sessionId, filename);
  if (!filePath) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function listSessionAssets(sessionId: string): string[] {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath || !fs.existsSync(assetsPath)) return [];

  try {
    return fs.readdirSync(assetsPath).filter((name) => {
      const stat = fs.statSync(path.join(assetsPath, name));
      return stat.isFile();
    });
  } catch {
    return [];
  }
}

// ========================================
// 工作空间路径工具函数
// ========================================

export function getWorkspacePath(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId);
}

export function findWorkspacePath(workspaceId: string): string | null {
  const directPath = path.join(WORKSPACES_DIR, workspaceId);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
    return directPath;
  }

  if (!fs.existsSync(WORKSPACES_DIR)) return null;

  const userDirs = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const projectDirs = fs.readdirSync(
      path.join(WORKSPACES_DIR, userDir.name),
      { withFileTypes: true },
    );
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const wsPath = path.join(
        WORKSPACES_DIR,
        userDir.name,
        projectDir.name,
        workspaceId,
      );
      if (fs.existsSync(wsPath) && fs.statSync(wsPath).isDirectory()) {
        return wsPath;
      }
    }
  }

  return null;
}

export function getWorkspaceDir(userId: string, projectId: string): string {
  return path.join(WORKSPACES_DIR, userId, projectId);
}

export function workspaceExists(workspaceId: string): boolean {
  return findWorkspacePath(workspaceId) !== null;
}

export interface WorkspaceMeta {
  workspaceId: string;
  demoId: string;
  projectId?: string;
  userId?: string;
  ownerUserId?: string;
  scope?: "live" | "branch" | "snapshot-source" | "legacy";
  baseVersion?: string;
  status?: "active" | "archived" | "committed" | "expired";
  createdAt: number;
  updatedAt: number;
}

export function getWorkspaceMeta(workspaceId: string): WorkspaceMeta | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const metaPath = path.join(wsPath, ".workspace.json");
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as WorkspaceMeta;
  } catch {
    return null;
  }
}

export function writeWorkspaceMeta(
  workspaceId: string,
  meta: WorkspaceMeta,
): void {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return;

  fs.writeFileSync(
    path.join(wsPath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
}

export function markWorkspaceBasedOnVersion(
  workspaceId: string,
  baseVersion: string,
): boolean {
  const meta = getWorkspaceMeta(workspaceId);
  if (!meta) return false;

  writeWorkspaceMeta(workspaceId, {
    ...meta,
    baseVersion,
    updatedAt: Date.now(),
  });
  return true;
}

export function getWorkspaceFiles(workspaceId: string): DemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const codePath = path.join(wsPath, "index.tsx");
  const schemaPath = path.join(wsPath, "config.schema.json");

  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) return null;

  return {
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
  };
}

export function updateWorkspaceFiles(
  workspaceId: string,
  files: DemoFiles,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  fs.writeFileSync(path.join(wsPath, "index.tsx"), files.code, "utf-8");
  fs.writeFileSync(
    path.join(wsPath, "config.schema.json"),
    files.schema,
    "utf-8",
  );
  return true;
}

export function getSessionWorkspacePath(sessionId: string): string | null {
  const meta = getSessionMeta(sessionId);
  if (!meta || !meta.workspaceId) return null;
  return findWorkspacePath(meta.workspaceId);
}

// ========================================
// Demo 相关函数（兼容性别名）
// ========================================

export function getDemosDir(): string {
  return PROJECTS_DIR;
}

export function getDemoPath(demoId: string): string {
  return getProjectPath(demoId);
}

export function demoExists(demoId: string): boolean {
  return projectExists(demoId);
}

export function listDemos(): DemoMeta[] {
  return listProjects();
}

export function createDemo(name: string): DemoMeta {
  return createProject(name);
}

export function deleteDemo(demoId: string): boolean {
  return deleteProject(demoId);
}

// ============================================================
// 多页面 Workspace CRUD（基于 workspaceId）
// ============================================================

/**
 * 读取 Workspace 内所有 Demo 页面的代码 + Schema，并附带项目级配置 Schema。
 * 取代旧的 `getWorkspaceFiles()` 单页面读取。
 */
export function getWorkspaceMultiDemoFiles(
  workspaceId: string,
): MultiDemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath || !fs.existsSync(wsPath)) return null;

  const demosDir = path.join(wsPath, "demos");
  const demos: Record<string, DemoFiles> = {};

  if (fs.existsSync(demosDir)) {
    for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(demosDir, entry.name);
      const schemaPath = path.join(dir, "config.schema.json");
      const codePath = path.join(dir, "index.tsx");
      const prototypeHtmlPath = path.join(dir, "prototype.html");
      const prototypeCssPath = path.join(dir, "prototype.css");
      const prototypeMetaPath = path.join(dir, "prototype.meta.json");
      const sketchScenePath = path.join(dir, "sketch.scene.json");
      const sketchMetaPath = path.join(dir, "sketch.meta.json");
      if (fs.existsSync(schemaPath) && (fs.existsSync(codePath) || fs.existsSync(prototypeHtmlPath) || fs.existsSync(sketchScenePath))) {
        demos[entry.name] = {
          code: fs.existsSync(codePath) ? fs.readFileSync(codePath, "utf-8") : "",
          schema: fs.readFileSync(schemaPath, "utf-8"),
          prototypeHtml: fs.existsSync(prototypeHtmlPath)
            ? fs.readFileSync(prototypeHtmlPath, "utf-8")
            : undefined,
          prototypeCss: fs.existsSync(prototypeCssPath)
            ? fs.readFileSync(prototypeCssPath, "utf-8")
            : undefined,
          prototypeMeta: fs.existsSync(prototypeMetaPath)
            ? JSON.parse(fs.readFileSync(prototypeMetaPath, "utf-8")) as PrototypePageMeta
            : undefined,
          sketchScene: fs.existsSync(sketchScenePath)
            ? fs.readFileSync(sketchScenePath, "utf-8")
            : undefined,
          sketchMeta: fs.existsSync(sketchMetaPath)
            ? JSON.parse(fs.readFileSync(sketchMetaPath, "utf-8")) as Record<string, unknown>
            : undefined,
        };
      }
    }
  }

  const projectConfigSchema = getProjectConfigSchema(wsPath);
  return { demos, projectConfigSchema };
}

/**
 * 读取 Workspace 内单个 Demo 页面的文件，便于代码编辑 Tab 切换。
 */
export function getWorkspaceDemoPageFiles(
  workspaceId: string,
  demoId: string,
): DemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const demoDir = getDemoDirPath(wsPath, demoId);
  const codePath = path.join(demoDir, "index.tsx");
  const schemaPath = path.join(demoDir, "config.schema.json");
  const prototypeHtmlPath = path.join(demoDir, "prototype.html");
  const prototypeCssPath = path.join(demoDir, "prototype.css");
  const prototypeMetaPath = path.join(demoDir, "prototype.meta.json");
  const sketchScenePath = path.join(demoDir, "sketch.scene.json");
  const sketchMetaPath = path.join(demoDir, "sketch.meta.json");

  if (!fs.existsSync(schemaPath) || (!fs.existsSync(codePath) && !fs.existsSync(prototypeHtmlPath) && !fs.existsSync(sketchScenePath))) return null;
  return {
    code: fs.existsSync(codePath) ? fs.readFileSync(codePath, "utf-8") : "",
    schema: fs.readFileSync(schemaPath, "utf-8"),
    prototypeHtml: fs.existsSync(prototypeHtmlPath)
      ? fs.readFileSync(prototypeHtmlPath, "utf-8")
      : undefined,
    prototypeCss: fs.existsSync(prototypeCssPath)
      ? fs.readFileSync(prototypeCssPath, "utf-8")
      : undefined,
    prototypeMeta: fs.existsSync(prototypeMetaPath)
      ? JSON.parse(fs.readFileSync(prototypeMetaPath, "utf-8")) as PrototypePageMeta
      : undefined,
    sketchScene: fs.existsSync(sketchScenePath)
      ? fs.readFileSync(sketchScenePath, "utf-8")
      : undefined,
    sketchMeta: fs.existsSync(sketchMetaPath)
      ? JSON.parse(fs.readFileSync(sketchMetaPath, "utf-8")) as Record<string, unknown>
      : undefined,
  };
}

/**
 * 写入 Workspace 内某 Demo 页面的代码 / Schema，可选地合并 `.demo.json` 元数据。
 */
export function updateWorkspaceDemoFiles(
  workspaceId: string,
  demoId: string,
  files: Partial<DemoFiles>,
  meta?: Partial<DemoPageMeta>,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  const demoDir = getDemoDirPath(wsPath, demoId);
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  if (typeof files.code === "string") {
    fs.writeFileSync(path.join(demoDir, "index.tsx"), files.code, "utf-8");
  }
  if (typeof files.schema === "string") {
    fs.writeFileSync(
      path.join(demoDir, "config.schema.json"),
      files.schema,
      "utf-8",
    );
  }
  if (typeof files.prototypeHtml === "string") {
    fs.writeFileSync(path.join(demoDir, "prototype.html"), files.prototypeHtml, "utf-8");
  }
  if (typeof files.prototypeCss === "string") {
    fs.writeFileSync(path.join(demoDir, "prototype.css"), files.prototypeCss, "utf-8");
  }
  if (files.prototypeMeta) {
    fs.writeFileSync(
      path.join(demoDir, "prototype.meta.json"),
      JSON.stringify(files.prototypeMeta, null, 2),
      "utf-8",
    );
  }
  if (typeof files.sketchScene === "string") {
    fs.writeFileSync(path.join(demoDir, "sketch.scene.json"), files.sketchScene, "utf-8");
  }
  if (files.sketchMeta) {
    fs.writeFileSync(
      path.join(demoDir, "sketch.meta.json"),
      JSON.stringify(files.sketchMeta, null, 2),
      "utf-8",
    );
  }
  if (meta) {
    writeDemoPageMeta(wsPath, demoId, meta);
  }
  const workspaceMetaPath = path.join(wsPath, ".workspace.json");
  if (fs.existsSync(workspaceMetaPath)) {
    try {
      const workspaceMeta = JSON.parse(fs.readFileSync(workspaceMetaPath, "utf-8"));
      workspaceMeta.updatedAt = Date.now();
      fs.writeFileSync(
        workspaceMetaPath,
        JSON.stringify(workspaceMeta, null, 2),
        "utf-8",
      );
    } catch {
      // 文件内容已写入，损坏的 workspace 元数据不阻断页面恢复。
    }
  }

  return true;
}

/**
 * 创建一个新的 Demo 页面，写入默认 `index.tsx`、`config.schema.json` 并注册到 workspace-tree.json。
 * `order` 取当前最大 order + 1。
 */
export function createWorkspaceDemoPage(
  workspaceId: string,
  name: string,
  parentId?: string | null,
  runtimeType?: DemoPageMeta["runtimeType"],
): DemoPageMeta | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const existing = listDemoPages(wsPath);
  const sameParent = existing.filter(
    (d) => (d.parentId ?? null) === (parentId ?? null),
  );
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((d) => d.order)) + 1 : 0;

  const demoId = generateDemoPageId(name);
  const demoDir = getDemoDirPath(wsPath, demoId);
  fs.mkdirSync(demoDir, { recursive: true });
  const resolvedRuntimeType =
    runtimeType === "prototype-html-css" || runtimeType === "sketch-scene"
      ? runtimeType
      : undefined;
  if (resolvedRuntimeType === "sketch-scene") {
    fs.writeFileSync(
      path.join(demoDir, "sketch.scene.json"),
      JSON.stringify(createDefaultSketchScene(), null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(demoDir, "sketch.meta.json"),
      JSON.stringify({ generatedBy: "author-site", updatedAt: Date.now() }, null, 2),
      "utf-8",
    );
  } else if (resolvedRuntimeType === "prototype-html-css") {
    fs.writeFileSync(path.join(demoDir, "prototype.html"), "<main></main>", "utf-8");
    fs.writeFileSync(path.join(demoDir, "prototype.css"), "", "utf-8");
  } else {
    fs.writeFileSync(path.join(demoDir, "index.tsx"), DEFAULT_DEMO_CODE, "utf-8");
  }
  fs.writeFileSync(
    path.join(demoDir, "config.schema.json"),
    DEFAULT_DEMO_SCHEMA,
    "utf-8",
  );

  const meta: DemoPageMeta = {
    id: demoId,
    name: name?.trim() || "新建页面",
    routeKey: generateRouteKey(
      name?.trim() || "新建页面",
      existing.map((page) => page.routeKey).filter(Boolean) as string[],
    ),
    runtimeType: resolvedRuntimeType,
    order: nextOrder,
    parentId: parentId ?? null,
  };

  writeDemoPageMeta(wsPath, demoId, meta);
  ensureAppGraph(wsPath);
  return meta;
}

/**
 * 复制 Workspace 内某 Demo 页面（含目录及所有文件），返回新页面元数据。
 */
export function copyWorkspaceDemoPage(
  workspaceId: string,
  sourceDemoId: string,
  name: string,
): DemoPageMeta | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const sourceDir = getDemoDirPath(wsPath, sourceDemoId);
  if (!fs.existsSync(sourceDir)) return null;

  const sourceMeta = readDemoPageMeta(wsPath, sourceDemoId);
  const existing = listDemoPages(wsPath);
  const sameParent = existing.filter(
    (d) => (d.parentId ?? null) === (sourceMeta?.parentId ?? null),
  );
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((d) => d.order)) + 1 : 0;

  const demoId = generateDemoPageId(name);
  const demoDir = getDemoDirPath(wsPath, demoId);
  fs.cpSync(sourceDir, demoDir, { recursive: true });

  const meta: DemoPageMeta = {
    id: demoId,
    name: name?.trim() || "复制的页面",
    routeKey: generateRouteKey(
      name?.trim() || "复制的页面",
      existing.map((page) => page.routeKey).filter(Boolean) as string[],
    ),
    order: nextOrder,
    parentId: sourceMeta?.parentId ?? null,
  };

  writeDemoPageMeta(wsPath, demoId, meta);
  ensureAppGraph(wsPath);
  return meta;
}

export interface DeletedWorkspaceDemoPageSnapshot {
  snapshotId: string;
  page: DemoPageMeta;
}

export type RestoreDeletedWorkspaceDemoPageSnapshotResult =
  | { success: true; page: DemoPageMeta }
  | {
      success: false;
      reason:
        | "WORKSPACE_NOT_FOUND"
        | "SNAPSHOT_NOT_FOUND"
        | "SNAPSHOT_INVALID"
        | "PAGE_EXISTS"
        | "PARENT_FOLDER_NOT_FOUND"
        | "FILE_WRITE_ERROR";
    };

function getDeletedDemoPageSnapshotRoot(wsPath: string): string {
  return path.join(wsPath, ".workbench", "undo", "deleted-pages");
}

function getDeletedDemoPageSnapshotPath(
  wsPath: string,
  snapshotId: string,
): string {
  return path.join(getDeletedDemoPageSnapshotRoot(wsPath), snapshotId);
}

function readDeletedDemoPageSnapshotMeta(
  snapshotPath: string,
): DemoPageMeta | null {
  try {
    const raw = fs.readFileSync(path.join(snapshotPath, "page.json"), "utf-8");
    const parsed = JSON.parse(raw) as Partial<DemoPageMeta>;
    if (!parsed.id || !parsed.name) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      routeKey: parsed.routeKey,
      runtimeType: parsed.runtimeType,
      order: parsed.order ?? 0,
      parentId: parsed.parentId ?? null,
    };
  } catch {
    return null;
  }
}

export function createDeletedWorkspaceDemoPageSnapshot(
  workspaceId: string,
  demoId: string,
): DeletedWorkspaceDemoPageSnapshot | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const demoDir = getDemoDirPath(wsPath, demoId);
  if (!fs.existsSync(demoDir)) return null;

  const page = readDemoPageMeta(wsPath, demoId);
  if (!page) return null;

  const snapshotId = `page-delete-${demoId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const snapshotPath = getDeletedDemoPageSnapshotPath(wsPath, snapshotId);
  fs.mkdirSync(snapshotPath, { recursive: true });
  fs.writeFileSync(
    path.join(snapshotPath, "page.json"),
    JSON.stringify(page, null, 2),
    "utf-8",
  );
  fs.cpSync(demoDir, path.join(snapshotPath, "demos", demoId), {
    recursive: true,
  });

  return { snapshotId, page };
}

export function restoreDeletedWorkspaceDemoPageSnapshot(
  workspaceId: string,
  demoId: string,
  snapshotId: string,
): RestoreDeletedWorkspaceDemoPageSnapshotResult {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return { success: false, reason: "WORKSPACE_NOT_FOUND" };

  const snapshotPath = getDeletedDemoPageSnapshotPath(wsPath, snapshotId);
  const snapshotDemoDir = path.join(snapshotPath, "demos", demoId);
  if (!fs.existsSync(snapshotPath) || !fs.existsSync(snapshotDemoDir)) {
    return { success: false, reason: "SNAPSHOT_NOT_FOUND" };
  }

  const page = readDeletedDemoPageSnapshotMeta(snapshotPath);
  if (!page || page.id !== demoId) {
    return { success: false, reason: "SNAPSHOT_INVALID" };
  }

  const targetDemoDir = getDemoDirPath(wsPath, demoId);
  if (fs.existsSync(targetDemoDir) || readDemoPageMeta(wsPath, demoId)) {
    return { success: false, reason: "PAGE_EXISTS" };
  }

  if (page.parentId) {
    const folders = readFoldersMeta(wsPath);
    if (!folders.some((folder) => folder.id === page.parentId)) {
      return { success: false, reason: "PARENT_FOLDER_NOT_FOUND" };
    }
  }

  try {
    fs.mkdirSync(path.dirname(targetDemoDir), { recursive: true });
    fs.cpSync(snapshotDemoDir, targetDemoDir, { recursive: true });
    const restored = writeDemoPageMeta(wsPath, demoId, page);
    ensureAppGraph(wsPath);
    fs.rmSync(snapshotPath, { recursive: true, force: true });
    return { success: true, page: restored };
  } catch {
    return { success: false, reason: "FILE_WRITE_ERROR" };
  }
}

/**
 * 删除 Workspace 内某 Demo 页面（含目录及所有文件）。
 */
export function deleteWorkspaceDemoPage(
  workspaceId: string,
  demoId: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  const demoDir = getDemoDirPath(wsPath, demoId);
  if (!fs.existsSync(demoDir)) return false;
  removePageFromAppGraph(wsPath, demoId);
  fs.rmSync(demoDir, { recursive: true, force: true });
  // 同步更新 workspace-tree.json，移除已删除页面的记录
  const tree = readWorkspaceTree(wsPath);
  const originalLength = tree.pages.length;
  tree.pages = tree.pages.filter((p) => p.id !== demoId);
  if (tree.pages.length !== originalLength) {
    writeWorkspaceTree(wsPath, tree);
  }
  ensureAppGraph(wsPath);
  return true;
}

/**
 * 列出 Workspace 中所有 Demo 页面的元数据（按 order 升序）
 */
export function listWorkspaceDemoPages(workspaceId: string): DemoPageMeta[] {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return [];
  return listDemoPages(wsPath);
}

// ============================================================
// 项目级共享配置（workspace/project.config.schema.json）
// 是否存在由文件存在性实时判定，不在 project.json 中持久化任何标记字段。
// ============================================================

const PROJECT_CONFIG_FILENAME = "project.config.schema.json";

export function getProjectConfigPath(workspacePath: string): string {
  return path.join(workspacePath, PROJECT_CONFIG_FILENAME);
}

/**
 * 读取项目级配置 Schema 内容（不存在时返回 undefined）
 */
export function getProjectConfigSchema(
  workspacePath: string,
): string | undefined {
  const filePath = getProjectConfigPath(workspacePath);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * 写入项目级配置 Schema（创建或覆盖）
 */
export function saveProjectConfigSchema(
  workspacePath: string,
  schema: string,
): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  fs.writeFileSync(getProjectConfigPath(workspacePath), schema, "utf-8");
}

/**
 * 删除项目级配置 Schema 文件（无项目级配置）
 */
export function deleteProjectConfigSchema(workspacePath: string): boolean {
  const filePath = getProjectConfigPath(workspacePath);
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

/**
 * 通过 workspaceId 读取项目级配置 Schema
 */
export function getWorkspaceProjectConfigSchema(
  workspaceId: string,
): string | undefined {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return undefined;
  return getProjectConfigSchema(wsPath);
}

/**
 * 通过 workspaceId 写入项目级配置 Schema
 */
export function saveWorkspaceProjectConfigSchema(
  workspaceId: string,
  schema: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  saveProjectConfigSchema(wsPath, schema);
  return true;
}

/**
 * 通过 workspaceId 删除项目级配置 Schema
 */
export function deleteWorkspaceProjectConfigSchema(
  workspaceId: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  return deleteProjectConfigSchema(wsPath);
}

/**
 * 保存流程使用：通过 workspace 当前 demos 目录回写 project.json 的 demoPages 数组。
 * 真值来源是 workspace 文件系统；调用方需要传入持久化路径所属的 workspacePath。
 */
export function syncProjectDemoPagesFromWorkspace(
  projectId: string,
  workspacePath: string,
): DemoPageMeta[] {
  const project = readProjectMeta(projectId);
  if (!project) return [];
  const fresh = listDemoPages(workspacePath);
  project.demoPages = fresh;
  project.demoFolders = readWorkspaceTree(workspacePath).folders;
  project.updatedAt = Date.now();
  writeProjectMeta(projectId, project);
  return fresh;
}

// ============================================================
// 虚拟文件夹管理（workspace-tree.json 的 folders 数组）
// ============================================================

/**
 * 读取虚拟文件夹元数据（从 workspace-tree.json 的 folders 数组）。
 * 保留此函数兼容外部调用，内部委托给 readWorkspaceTree。
 */
export function readFoldersMeta(workspacePath: string): DemoFolderMeta[] {
  return readWorkspaceTree(workspacePath).folders;
}

export function generateFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getFolderDepth(
  folderId: string,
  folders: DemoFolderMeta[],
): number {
  let depth = 0;
  let current = folders.find((f) => f.id === folderId);
  while (current?.parentId) {
    depth++;
    current = folders.find((f) => f.id === current!.parentId);
  }
  return depth;
}

export function isDescendant(
  folderId: string,
  targetParentId: string,
  folders: DemoFolderMeta[],
): boolean {
  let current = folders.find((f) => f.id === targetParentId);
  while (current) {
    if (current.id === folderId) return true;
    current = folders.find((f) => f.id === current!.parentId);
  }
  return false;
}

export function createDemoFolder(
  workspacePath: string,
  name: string,
  parentId?: string | null,
): DemoFolderMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  const folders = tree.folders;

  if (parentId) {
    const parent = folders.find((f) => f.id === parentId);
    if (!parent) return null;
    if (getFolderDepth(parentId, folders) >= 3) return null;
  }

  const sameParent = folders.filter(
    (f) => (f.parentId ?? null) === (parentId ?? null),
  );
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((f) => f.order)) + 1 : 0;

  const folder: DemoFolderMeta = {
    id: generateFolderId(),
    name: name.trim() || "新建文件夹",
    parentId: parentId ?? null,
    order: nextOrder,
  };

  tree.folders.push(folder);
  writeWorkspaceTree(workspacePath, tree);
  return folder;
}

export function updateDemoFolder(
  workspacePath: string,
  folderId: string,
  patch: { name?: string; parentId?: string | null; order?: number },
): DemoFolderMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  const index = tree.folders.findIndex((f) => f.id === folderId);
  if (index === -1) return null;

  if (patch.parentId !== undefined && patch.parentId !== null) {
    const targetParent = tree.folders.find((f) => f.id === patch.parentId);
    if (!targetParent) return null;
    if (isDescendant(folderId, patch.parentId, tree.folders)) return null;
    if (getFolderDepth(folderId, tree.folders) + 1 > 3) return null;
  }

  const existing = tree.folders[index];
  tree.folders[index] = {
    ...existing,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.parentId !== undefined && { parentId: patch.parentId }),
    ...(patch.order !== undefined && { order: patch.order }),
  };

  writeWorkspaceTree(workspacePath, tree);
  return tree.folders[index];
}

export function deleteDemoFolder(
  workspacePath: string,
  folderId: string,
  deleteContents: boolean = false,
): { success: boolean; deletedPageIds?: string[] } {
  const tree = readWorkspaceTree(workspacePath);
  const index = tree.folders.findIndex((f) => f.id === folderId);
  if (index === -1) return { success: false };

  const deletedPageIds: string[] = [];

  if (deleteContents) {
    const descendantFolderIds = new Set<string>();
    const collectDescendants = (parentId: string) => {
      for (const f of tree.folders) {
        if (f.parentId === parentId) {
          descendantFolderIds.add(f.id);
          collectDescendants(f.id);
        }
      }
    };
    collectDescendants(folderId);
    descendantFolderIds.add(folderId);

    const pages = tree.pages;
    for (const page of pages) {
      if (page.parentId && descendantFolderIds.has(page.parentId)) {
        const wsId = path.basename(workspacePath);
        deleteWorkspaceDemoPage(wsId, page.id);
        deletedPageIds.push(page.id);
      }
    }

    tree.folders = tree.folders.filter((f) => !descendantFolderIds.has(f.id));
    tree.pages = tree.pages.filter((p) => !deletedPageIds.includes(p.id));
    writeWorkspaceTree(workspacePath, tree);
  } else {
    tree.folders = tree.folders.filter((f) => f.id !== folderId);
    for (const f of tree.folders) {
      if (f.parentId === folderId) {
        f.parentId =
          tree.folders.find((fo) => fo.id === folderId)?.parentId ?? null;
      }
    }

    let changed = false;
    for (const p of tree.pages) {
      if (p.parentId === folderId) {
        p.parentId =
          tree.folders.find((fo) => fo.id === folderId)?.parentId ?? null;
        changed = true;
      }
    }

    writeWorkspaceTree(workspacePath, tree);
  }

  return { success: true, deletedPageIds };
}

export function reorderDemoPages(
  workspacePath: string,
  pageUpdates: Array<{ id: string; order: number; parentId: string | null }>,
  folderUpdates?: Array<{ id: string; order: number; parentId: string | null }>,
): boolean {
  const tree = readWorkspaceTree(workspacePath);

  for (const u of pageUpdates) {
    const idx = tree.pages.findIndex((p) => p.id === u.id);
    if (idx !== -1) {
      tree.pages[idx] = {
        ...tree.pages[idx],
        order: u.order,
        parentId: u.parentId,
      };
    }
  }

  if (folderUpdates && folderUpdates.length > 0) {
    for (const u of folderUpdates) {
      const idx = tree.folders.findIndex((f) => f.id === u.id);
      if (idx !== -1) {
        tree.folders[idx] = {
          ...tree.folders[idx],
          order: u.order,
          parentId: u.parentId,
        };
      }
    }
  }

  writeWorkspaceTree(workspacePath, tree);
  return true;
}

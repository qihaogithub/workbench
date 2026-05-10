import path from "path";
import fs from "fs";
import {
  DemoMeta,
  DemoFiles,
  SessionMeta,
  ErrorCodeType,
  ERROR_MESSAGES,
} from "@opencode-workbench/shared";
import type {
  Project,
  VersionInfo,
  DemoPageMeta,
  DemoFolderMeta,
  MultiDemoFiles,
} from "@opencode-workbench/shared";
import { MAX_VERSIONS_KEEP } from "@opencode-workbench/shared";

export function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

const DATA_DIR = process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
const PROJECTS_DIR =
  process.env.PROJECTS_DIR || path.join(DATA_DIR, "projects");
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
        console.log(`[findSessionPath] 找到 session (新结构-目录名): ${sessionPathByName}`);
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
              console.log(`[findSessionPath] 找到 session (新结构-meta): ${level3Path}`);
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
    });
  }

  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
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
 * 生成 Demo 页面 ID。
 * 格式 `demo_${Date.now()}_${random6}` 与现有 workspaceId 风格一致，
 * 防止快速 AI 操作中毫秒级时间戳碰撞。
 */
export function generateDemoPageId(): string {
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 获取页面目录的绝对路径
 */
export function getDemoDirPath(workspacePath: string, demoId: string): string {
  return path.join(workspacePath, "demos", demoId);
}

/**
 * 读取页面元数据 `.demo.json`
 * 文件缺失或损坏时返回 null（容错），让上层根据目录列表兜底
 */
export function readDemoPageMeta(
  workspacePath: string,
  demoId: string,
): DemoPageMeta | null {
  const metaPath = path.join(getDemoDirPath(workspacePath, demoId), ".demo.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    if (
      typeof parsed?.id === "string" &&
      typeof parsed?.name === "string" &&
      typeof parsed?.order === "number" &&
      typeof parsed?.createdAt === "number" &&
      typeof parsed?.updatedAt === "number"
    ) {
      return {
        ...parsed,
        parentId: parsed.parentId ?? null,
      } as DemoPageMeta;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 写入或合并页面元数据 `.demo.json`
 * 自动维护 `updatedAt` 字段
 */
export function writeDemoPageMeta(
  workspacePath: string,
  demoId: string,
  patch: Partial<DemoPageMeta>,
): DemoPageMeta {
  const demoDir = getDemoDirPath(workspacePath, demoId);
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }
  const existing = readDemoPageMeta(workspacePath, demoId);
  const now = Date.now();
  const merged: DemoPageMeta = {
    id: existing?.id ?? demoId,
    name: patch.name ?? existing?.name ?? demoId,
    order: patch.order ?? existing?.order ?? 0,
    parentId: patch.parentId !== undefined ? patch.parentId : (existing?.parentId ?? null),
    createdAt: existing?.createdAt ?? patch.createdAt ?? now,
    updatedAt: now,
  };
  fs.writeFileSync(
    path.join(demoDir, ".demo.json"),
    JSON.stringify(merged, null, 2),
    "utf-8",
  );
  return merged;
}

/**
 * 列出 workspace 内所有有效的 Demo 页面（按 order/createdAt 升序）。
 * 真值来源是文件系统 `demos/` 目录；元数据由 `.demo.json` 提供，缺失时用 id 兜底。
 */
export function listDemoPages(workspacePath: string): DemoPageMeta[] {
  const demosDir = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosDir)) return [];

  const result: DemoPageMeta[] = [];
  for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(demosDir, entry.name);
    if (
      !fs.existsSync(path.join(dir, "index.tsx")) ||
      !fs.existsSync(path.join(dir, "config.schema.json"))
    ) {
      continue;
    }
    const meta = readDemoPageMeta(workspacePath, entry.name);
    if (meta) {
      result.push(meta);
    } else {
      // .demo.json 缺失 / 损坏时使用目录 mtime 与 id 兜底
      const stat = fs.statSync(dir);
      result.push({
        id: entry.name,
        name: entry.name,
        order: result.length,
        parentId: null,
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
      });
    }
  }

  return result.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
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
    return { demoIds: existing };
  }

  // 仓库为空：创建默认页面
  const demoId = generateDemoPageId();
  const demoDir = path.join(demosDir, demoId);
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(path.join(demoDir, "index.tsx"), DEFAULT_DEMO_CODE, "utf-8");
  fs.writeFileSync(
    path.join(demoDir, "config.schema.json"),
    DEFAULT_DEMO_SCHEMA,
    "utf-8",
  );

  const now = Date.now();
  const meta: DemoPageMeta = {
    id: demoId,
    name: "默认页面",
    order: 0,
    parentId: null,
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(
    path.join(demoDir, ".demo.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );

  return { demoIds: [demoId], defaultDemoMeta: meta };
}

export function createProject(name: string): DemoMeta {
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
        createdAt: now,
        updatedAt: now,
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
          fs.rmSync(wsPath, { recursive: true, force: true });
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
      ? parsed.demoPages.map(p => ({ ...p, parentId: p.parentId ?? null }))
      : [];
    return {
      ...parsed,
      id: parsed.id ?? projectId,
      name: parsed.name ?? projectId,
      workspacePath: parsed.workspacePath ?? path.join(projectPath, "workspace"),
      demoPages,
      demoFolders: Array.isArray(parsed.demoFolders) ? parsed.demoFolders : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      createdAt: parsed.createdAt ?? Date.now(),
      updatedAt: parsed.updatedAt ?? Date.now(),
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
  return `v${project.versions.length + 1}`;
}

export function cleanupOldVersions(project: Project): void {
  if (project.versions.length <= MAX_VERSIONS_KEEP) return;

  const toDelete = project.versions.slice(
    0,
    project.versions.length - MAX_VERSIONS_KEEP,
  );

  for (const version of toDelete) {
    if (fs.existsSync(version.snapshotPath)) {
      fs.rmSync(version.snapshotPath, { recursive: true, force: true });
    }
  }

  project.versions = project.versions.slice(-MAX_VERSIONS_KEEP);
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
  userId?: string,
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
    savedAt: Date.now(),
    savedBy: userId || "system",
    sessionId: `restore-from-${versionId}`,
    snapshotPath: backupSnapshotPath,
    fileCount: countFiles(workspacePath),
    note: `恢复版本前的自动备份 (基于 ${versionId})`,
  };
  project.versions.push(backupVersion);

  // 2. 用目标版本快照覆盖 workspace
  fs.rmSync(workspacePath, { recursive: true, force: true });
  fs.cpSync(targetVersion.snapshotPath, workspacePath, { recursive: true });

  // 3. 记录恢复操作作为新版本
  const restoreVersionId = generateVersionId(project);
  const restoreSnapshotPath = getSnapshotPath(projectId, restoreVersionId);
  fs.cpSync(workspacePath, restoreSnapshotPath, { recursive: true });

  const restoreVersionInfo: VersionInfo = {
    versionId: restoreVersionId,
    savedAt: Date.now(),
    savedBy: userId || "system",
    sessionId: `restore-${versionId}`,
    snapshotPath: restoreSnapshotPath,
    fileCount: countFiles(workspacePath),
    note: `恢复到版本 ${versionId}`,
  };
  project.versions.push(restoreVersionInfo);
  project.updatedAt = Date.now();

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
    const projectDirs = fs.readdirSync(path.join(WORKSPACES_DIR, userDir.name), { withFileTypes: true });
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const wsPath = path.join(WORKSPACES_DIR, userDir.name, projectDir.name, workspaceId);
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
  userId?: string;
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

export function writeWorkspaceMeta(workspaceId: string, meta: WorkspaceMeta): void {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return;

  fs.writeFileSync(
    path.join(wsPath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
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

export function updateWorkspaceFiles(workspaceId: string, files: DemoFiles): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  fs.writeFileSync(path.join(wsPath, "index.tsx"), files.code, "utf-8");
  fs.writeFileSync(path.join(wsPath, "config.schema.json"), files.schema, "utf-8");
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
      const codePath = path.join(dir, "index.tsx");
      const schemaPath = path.join(dir, "config.schema.json");
      if (fs.existsSync(codePath) && fs.existsSync(schemaPath)) {
        demos[entry.name] = {
          code: fs.readFileSync(codePath, "utf-8"),
          schema: fs.readFileSync(schemaPath, "utf-8"),
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

  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) return null;
  return {
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
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
  if (meta) {
    writeDemoPageMeta(wsPath, demoId, meta);
  } else {
    // 即使无显式 meta，也维护一次 updatedAt
    writeDemoPageMeta(wsPath, demoId, {});
  }

  return true;
}

/**
 * 创建一个新的 Demo 页面，写入默认 `index.tsx`、`config.schema.json` 与 `.demo.json` 元数据。
 * `order` 取当前最大 order + 1。
 */
export function createWorkspaceDemoPage(
  workspaceId: string,
  name: string,
  parentId?: string | null,
): DemoPageMeta | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const existing = listDemoPages(wsPath);
  const sameParent = existing.filter(d => (d.parentId ?? null) === (parentId ?? null));
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((d) => d.order)) + 1 : 0;

  const demoId = generateDemoPageId();
  const demoDir = getDemoDirPath(wsPath, demoId);
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(path.join(demoDir, "index.tsx"), DEFAULT_DEMO_CODE, "utf-8");
  fs.writeFileSync(
    path.join(demoDir, "config.schema.json"),
    DEFAULT_DEMO_SCHEMA,
    "utf-8",
  );

  const now = Date.now();
  const meta: DemoPageMeta = {
    id: demoId,
    name: name?.trim() || "新建页面",
    order: nextOrder,
    parentId: parentId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(
    path.join(demoDir, ".demo.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
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
  const sameParent = existing.filter(d => (d.parentId ?? null) === (sourceMeta?.parentId ?? null));
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((d) => d.order)) + 1 : 0;

  const demoId = generateDemoPageId();
  const demoDir = getDemoDirPath(wsPath, demoId);
  fs.cpSync(sourceDir, demoDir, { recursive: true });

  const now = Date.now();
  const meta: DemoPageMeta = {
    id: demoId,
    name: name?.trim() || "复制的页面",
    order: nextOrder,
    parentId: sourceMeta?.parentId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(
    path.join(demoDir, ".demo.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
  return meta;
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
  fs.rmSync(demoDir, { recursive: true, force: true });
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
  project.demoFolders = readFoldersMeta(workspacePath);
  project.updatedAt = Date.now();
  writeProjectMeta(projectId, project);
  return fresh;
}

// ============================================================
// 虚拟文件夹管理（.folders.json）
// ============================================================

const FOLDERS_META_FILENAME = ".folders.json";

function getFoldersMetaPath(workspacePath: string): string {
  return path.join(workspacePath, FOLDERS_META_FILENAME);
}

export function readFoldersMeta(workspacePath: string): DemoFolderMeta[] {
  const metaPath = getFoldersMetaPath(workspacePath);
  if (!fs.existsSync(metaPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    if (Array.isArray(parsed?.folders)) {
      return parsed.folders as DemoFolderMeta[];
    }
    return [];
  } catch {
    return [];
  }
}

function writeFoldersMeta(workspacePath: string, folders: DemoFolderMeta[]): void {
  const metaPath = getFoldersMetaPath(workspacePath);
  fs.writeFileSync(metaPath, JSON.stringify({ folders }, null, 2), "utf-8");
}

export function generateFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getFolderDepth(folderId: string, folders: DemoFolderMeta[]): number {
  let depth = 0;
  let current = folders.find(f => f.id === folderId);
  while (current?.parentId) {
    depth++;
    current = folders.find(f => f.id === current!.parentId);
  }
  return depth;
}

export function isDescendant(folderId: string, targetParentId: string, folders: DemoFolderMeta[]): boolean {
  let current = folders.find(f => f.id === targetParentId);
  while (current) {
    if (current.id === folderId) return true;
    current = folders.find(f => f.id === current!.parentId);
  }
  return false;
}

export function createDemoFolder(
  workspacePath: string,
  name: string,
  parentId?: string | null,
): DemoFolderMeta | null {
  const folders = readFoldersMeta(workspacePath);

  if (parentId) {
    const parent = folders.find(f => f.id === parentId);
    if (!parent) return null;
    if (getFolderDepth(parentId, folders) >= 3) return null;
  }

  const sameParent = folders.filter(f => (f.parentId ?? null) === (parentId ?? null));
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map(f => f.order)) + 1 : 0;

  const now = Date.now();
  const folder: DemoFolderMeta = {
    id: generateFolderId(),
    name: name.trim() || "新建文件夹",
    parentId: parentId ?? null,
    order: nextOrder,
    createdAt: now,
    updatedAt: now,
  };

  folders.push(folder);
  writeFoldersMeta(workspacePath, folders);
  return folder;
}

export function updateDemoFolder(
  workspacePath: string,
  folderId: string,
  patch: { name?: string; parentId?: string | null; order?: number },
): DemoFolderMeta | null {
  const folders = readFoldersMeta(workspacePath);
  const index = folders.findIndex(f => f.id === folderId);
  if (index === -1) return null;

  if (patch.parentId !== undefined && patch.parentId !== null) {
    const targetParent = folders.find(f => f.id === patch.parentId);
    if (!targetParent) return null;
    if (isDescendant(folderId, patch.parentId, folders)) return null;
    if (getFolderDepth(folderId, folders) + 1 > 3) return null;
  }

  const existing = folders[index];
  folders[index] = {
    ...existing,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.parentId !== undefined && { parentId: patch.parentId }),
    ...(patch.order !== undefined && { order: patch.order }),
    updatedAt: Date.now(),
  };

  writeFoldersMeta(workspacePath, folders);
  return folders[index];
}

export function deleteDemoFolder(
  workspacePath: string,
  folderId: string,
  deleteContents: boolean = false,
): { success: boolean; deletedPageIds?: string[] } {
  const folders = readFoldersMeta(workspacePath);
  const index = folders.findIndex(f => f.id === folderId);
  if (index === -1) return { success: false };

  const deletedPageIds: string[] = [];

  if (deleteContents) {
    const descendantFolderIds = new Set<string>();
    const collectDescendants = (parentId: string) => {
      for (const f of folders) {
        if (f.parentId === parentId) {
          descendantFolderIds.add(f.id);
          collectDescendants(f.id);
        }
      }
    };
    collectDescendants(folderId);
    descendantFolderIds.add(folderId);

    const pages = listDemoPages(workspacePath);
    for (const page of pages) {
      if (page.parentId && descendantFolderIds.has(page.parentId)) {
        const wsId = path.basename(workspacePath);
        deleteWorkspaceDemoPage(wsId, page.id);
        deletedPageIds.push(page.id);
      }
    }

    const remaining = folders.filter(f => !descendantFolderIds.has(f.id));
    writeFoldersMeta(workspacePath, remaining);
  } else {
    const remaining = folders.filter(f => f.id !== folderId);
    for (const f of remaining) {
      if (f.parentId === folderId) {
        f.parentId = folders.find(fo => fo.id === folderId)?.parentId ?? null;
      }
    }
    writeFoldersMeta(workspacePath, remaining);

    const pages = listDemoPages(workspacePath);
    let changed = false;
    for (const page of pages) {
      if (page.parentId === folderId) {
        writeDemoPageMeta(workspacePath, page.id, {
          parentId: folders.find(fo => fo.id === folderId)?.parentId ?? null,
        });
        changed = true;
      }
    }
  }

  return { success: true, deletedPageIds };
}

export function reorderDemoPages(
  workspacePath: string,
  pageUpdates: Array<{ id: string; order: number; parentId: string | null }>,
  folderUpdates?: Array<{ id: string; order: number; parentId: string | null }>,
): boolean {
  for (const u of pageUpdates) {
    writeDemoPageMeta(workspacePath, u.id, { order: u.order, parentId: u.parentId });
  }

  if (folderUpdates && folderUpdates.length > 0) {
    const folders = readFoldersMeta(workspacePath);
    for (const u of folderUpdates) {
      const idx = folders.findIndex(f => f.id === u.id);
      if (idx !== -1) {
        folders[idx] = { ...folders[idx], order: u.order, parentId: u.parentId, updatedAt: Date.now() };
      }
    }
    writeFoldersMeta(workspacePath, folders);
  }

  return true;
}

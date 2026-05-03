import path from "path";
import fs from "fs";
import {
  DemoMeta,
  DemoFiles,
  SessionMeta,
  ErrorCodeType,
  ERROR_MESSAGES,
} from "@opencode-workbench/shared";
import type { Project, VersionInfo } from "@opencode-workbench/shared";
import { MAX_VERSIONS_KEEP } from "@opencode-workbench/shared";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
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

export function ensureWorkspaceFiles(workspacePath: string): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const codePath = path.join(workspacePath, "index.tsx");
  const schemaPath = path.join(workspacePath, "config.schema.json");

  if (!fs.existsSync(codePath)) {
    fs.writeFileSync(codePath, DEFAULT_DEMO_CODE, "utf-8");
  }
  if (!fs.existsSync(schemaPath)) {
    fs.writeFileSync(schemaPath, DEFAULT_DEMO_SCHEMA, "utf-8");
  }
}

export function createProject(name: string): DemoMeta {
  ensureDirsExist();

  const projectId = `proj_${Date.now()}`;
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");

  ensureWorkspaceFiles(workspacePath);

  const projectJson = JSON.stringify(
    {
      id: projectId,
      name: name || projectId,
      workspacePath: workspacePath,
      versions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    null,
    2,
  );

  fs.writeFileSync(
    path.join(projectPath, "project.json"),
    projectJson,
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

export function getSessionFiles(sessionId: string): DemoFiles | null {
  if (!sessionExists(sessionId)) {
    return null;
  }

  const sessionPath = getSessionPath(sessionId);
  const codePath = path.join(sessionPath, "index.tsx");
  const schemaPath = path.join(sessionPath, "config.schema.json");

  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) {
    return null;
  }

  return {
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
  };
}

export function updateSessionFiles(
  sessionId: string,
  files: DemoFiles,
): boolean {
  if (!sessionExists(sessionId)) {
    return false;
  }

  const sessionPath = getSessionPath(sessionId);

  fs.writeFileSync(path.join(sessionPath, "index.tsx"), files.code, "utf-8");
  fs.writeFileSync(
    path.join(sessionPath, "config.schema.json"),
    files.schema,
    "utf-8",
  );

  return true;
}

export function deleteSession(sessionId: string): boolean {
  if (!sessionExists(sessionId)) {
    return false;
  }

  const sessionPath = getSessionPath(sessionId);
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
    return JSON.parse(content) as Project;
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

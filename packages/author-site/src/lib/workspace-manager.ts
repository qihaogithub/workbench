import path from "path";
import fs from "fs";
import {
  getWorkspacesDir,
  getWorkspaceDir,
  getProjectPath,
  getSessionsDir,
  projectExists,
  ensureWorkspaceFiles,
  findWorkspacePath,
  getWorkspaceMeta as getWorkspaceMetaFromFs,
  writeWorkspaceMeta,
  getWorkspaceMultiDemoFiles,
  readProjectMeta,
  writeProjectMeta,
  getLatestVersion,
  syncProjectDemoPagesFromWorkspace,
  type WorkspaceMeta,
} from "./fs-utils";
import type { MultiDemoFiles } from "@opencode-workbench/shared";

export interface CreateWorkspaceResult {
  workspaceId: string;
  workspacePath: string;
  /** 多页面文件集合（取代旧 code/schema 单文件返回） */
  demos: MultiDemoFiles;
  workspaceScope?: WorkspaceMeta["scope"];
}

export interface WorkspaceSyncResult {
  success: boolean;
  workspacePath?: string;
  code?: string;
  error?: string;
}

function getProjectLiveWorkspaceDir(projectId: string): string {
  return path.join(getWorkspacesDir(), "projects", projectId);
}

function copyWorkspaceClean(source: string, target: string): void {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (src: string) => !src.includes("node_modules"),
  });
}

function writeLiveWorkspaceMeta(
  workspacePath: string,
  workspaceId: string,
  projectId: string,
): void {
  const now = Date.now();
  const latestVersion = getLatestVersion(projectId);
  const meta: WorkspaceMeta = {
    workspaceId,
    demoId: projectId,
    projectId,
    scope: "live",
    status: "active",
    baseVersion: latestVersion?.versionId || "v0",
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(
    path.join(workspacePath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
}

function readWorkspaceUpdatedAt(workspaceId: string): number {
  const meta = getWorkspaceMetaFromFs(workspaceId);
  if (meta?.updatedAt) return meta.updatedAt;
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath || !fs.existsSync(wsPath)) return 0;
  return fs.statSync(wsPath).mtimeMs;
}

function latestVersionId(projectId: string): string {
  return getLatestVersion(projectId)?.versionId || "v0";
}

function isWorkspaceBasedOnLatest(projectId: string, meta: WorkspaceMeta | null): boolean {
  const latest = latestVersionId(projectId);
  if (!meta?.baseVersion) return latest === "v0";
  return meta.baseVersion === latest;
}

export function isLiveWorkspace(workspaceId: string | null | undefined): boolean {
  if (!workspaceId) return false;
  const meta = getWorkspaceMetaFromFs(workspaceId);
  return meta?.scope === "live" && meta.status !== "archived";
}

export function getProjectActiveWorkspacePath(projectId: string): string | null {
  const project = readProjectMeta(projectId);
  if (!project?.activeWorkspaceId) return null;
  const wsPath = findWorkspacePath(project.activeWorkspaceId);
  return wsPath && fs.existsSync(wsPath) ? wsPath : null;
}

export function createWorkspace(
  userId: string,
  projectId: string,
): CreateWorkspaceResult {
  if (!projectExists(projectId)) {
    throw new Error(`Project "${projectId}" 不存在`);
  }

  const workspaceId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const projectPath = getProjectPath(projectId);
  const projectWorkspacePath = path.join(projectPath, "workspace");
  const workspaceDir = getWorkspaceDir(userId, projectId);
  const workspacePath = path.join(workspaceDir, workspaceId);

  ensureWorkspaceFiles(projectWorkspacePath);

  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.cpSync(projectWorkspacePath, workspacePath, { recursive: true });

  const meta: WorkspaceMeta = {
    workspaceId,
    demoId: projectId,
    projectId,
    userId,
    ownerUserId: userId,
    scope: "branch",
    status: "active",
    baseVersion: getLatestVersion(projectId)?.versionId || "v0",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(
    path.join(workspacePath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );

  const demos = getWorkspaceMultiDemoFiles(workspaceId) ?? {
    demos: {},
    projectConfigSchema: undefined,
  };

  return {
    workspaceId,
    workspacePath,
    demos,
    workspaceScope: "branch",
  };
}

export function getOrCreateProjectActiveWorkspace(
  projectId: string,
  options: { migrationWorkspaceId?: string | null } = {},
): CreateWorkspaceResult {
  if (!projectExists(projectId)) {
    throw new Error(`Project "${projectId}" 不存在`);
  }

  const project = readProjectMeta(projectId);
  if (!project) {
    throw new Error(`Project "${projectId}" 不存在`);
  }

  if (project.activeWorkspaceId) {
    const activePath = findWorkspacePath(project.activeWorkspaceId);
    if (activePath && fs.existsSync(activePath)) {
      const meta = getWorkspaceMetaFromFs(project.activeWorkspaceId);
      if (!isWorkspaceBasedOnLatest(projectId, meta)) {
        writeProjectMeta(projectId, {
          ...project,
          activeWorkspaceId: undefined,
          activeWorkspaceUpdatedAt: undefined,
          canonicalSyncedWorkspaceId: undefined,
          updatedAt: Date.now(),
        });
      } else if (!meta) {
        writeLiveWorkspaceMeta(activePath, project.activeWorkspaceId, projectId);
      } else if (meta.scope !== "live") {
        writeWorkspaceMeta(project.activeWorkspaceId, {
          ...meta,
          scope: "live",
          status: "active",
          projectId,
          demoId: projectId,
          updatedAt: meta.updatedAt ?? Date.now(),
        });
      }
      if (isWorkspaceBasedOnLatest(projectId, meta)) {
        const demos = getWorkspaceMultiDemoFiles(project.activeWorkspaceId) ?? {
          demos: {},
          projectConfigSchema: undefined,
        };
        return {
          workspaceId: project.activeWorkspaceId,
          workspacePath: activePath,
          demos,
          workspaceScope: "live",
        };
      }
    }
  }

  const workspaceId = `live-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const liveDir = getProjectLiveWorkspaceDir(projectId);
  const workspacePath = path.join(liveDir, workspaceId);
  const migrationPath = options.migrationWorkspaceId
    ? findWorkspacePath(options.migrationWorkspaceId)
    : null;
  const projectWorkspacePath = path.join(getProjectPath(projectId), "workspace");
  const sourcePath =
    migrationPath && fs.existsSync(migrationPath)
      ? migrationPath
      : projectWorkspacePath;

  ensureWorkspaceFiles(projectWorkspacePath);
  fs.mkdirSync(liveDir, { recursive: true });
  copyWorkspaceClean(sourcePath, workspacePath);
  writeLiveWorkspaceMeta(workspacePath, workspaceId, projectId);

  const now = Date.now();
  writeProjectMeta(projectId, {
    ...project,
    activeWorkspaceId: workspaceId,
    activeWorkspaceUpdatedAt: now,
    updatedAt: now,
  });

  const demos = getWorkspaceMultiDemoFiles(workspaceId) ?? {
    demos: {},
    projectConfigSchema: undefined,
  };
  return {
    workspaceId,
    workspacePath,
    demos,
    workspaceScope: "live",
  };
}

export function syncActiveWorkspaceToCanonical(
  projectId: string,
  workspaceId?: string | null,
): WorkspaceSyncResult {
  const project = readProjectMeta(projectId);
  if (!project) {
    return {
      success: false,
      code: "PROJECT_NOT_FOUND",
      error: "Project not found",
    };
  }

  const effectiveWorkspaceId = workspaceId || project.activeWorkspaceId;
  if (!effectiveWorkspaceId) {
    return {
      success: false,
      code: "WORKSPACE_STALE",
      error: "当前工作区已过期，请刷新项目后重试",
    };
  }

  if (project.activeWorkspaceId !== effectiveWorkspaceId) {
    return {
      success: false,
      code: "WORKSPACE_STALE",
      error: "当前工作区已过期，请刷新项目后重试",
    };
  }

  const sourcePath = findWorkspacePath(effectiveWorkspaceId);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return {
      success: false,
      code: "WORKSPACE_NOT_FOUND",
      error: `Workspace source not found: ${effectiveWorkspaceId}`,
    };
  }

  const sourceMeta = getWorkspaceMetaFromFs(effectiveWorkspaceId);
  if (!isWorkspaceBasedOnLatest(projectId, sourceMeta)) {
    return {
      success: false,
      code: "WORKSPACE_STALE",
      error: "当前工作区已过期，请刷新项目后重试",
    };
  }

  const projectWorkspacePath = path.join(getProjectPath(projectId), "workspace");
  const tempPath = `${projectWorkspacePath}.tmp`;
  if (fs.existsSync(tempPath)) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }

  try {
    copyWorkspaceClean(sourcePath, tempPath);
    for (const filename of [".session.json", ".workspace.json"]) {
      const filePath = path.join(tempPath, filename);
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    }
    if (fs.existsSync(projectWorkspacePath)) {
      fs.rmSync(projectWorkspacePath, { recursive: true, force: true });
    }
    fs.renameSync(tempPath, projectWorkspacePath);
    syncProjectDemoPagesFromWorkspace(projectId, projectWorkspacePath);

    const latestProject = readProjectMeta(projectId) ?? project;
    const now = Date.now();
    writeProjectMeta(projectId, {
      ...latestProject,
      activeWorkspaceId: effectiveWorkspaceId,
      activeWorkspaceUpdatedAt: readWorkspaceUpdatedAt(effectiveWorkspaceId) || now,
      canonicalSyncedWorkspaceId: effectiveWorkspaceId,
      canonicalSyncedAt: now,
      updatedAt: now,
    });
    return { success: true, workspacePath: projectWorkspacePath };
  } catch (error) {
    fs.rmSync(tempPath, { recursive: true, force: true });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Sync failed",
    };
  }
}

export function getWorkspace(workspaceId: string) {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath || !fs.existsSync(wsPath)) return null;

  const meta = getWorkspaceMetaFromFs(workspaceId);
  if (!meta) return null;

  // 多页面模式：读取所有页面
  const multi = getWorkspaceMultiDemoFiles(workspaceId);
  const demos = multi?.demos ?? {};
  const projectConfigSchema = multi?.projectConfigSchema;

  // 兼容：如果 workspace 根目录有旧格式文件，也读取
  const codePath = path.join(wsPath, "index.tsx");
  const schemaPath = path.join(wsPath, "config.schema.json");
  const hasLegacyFiles = fs.existsSync(codePath) && fs.existsSync(schemaPath);

  return {
    ...meta,
    demos,
    projectConfigSchema,
    workspacePath: wsPath,
    // 兼容旧格式前端
    code: hasLegacyFiles
      ? fs.readFileSync(codePath, "utf-8")
      : (Object.values(demos)[0]?.code ?? ""),
    schema: hasLegacyFiles
      ? fs.readFileSync(schemaPath, "utf-8")
      : (Object.values(demos)[0]?.schema ?? ""),
  };
}

export function deleteWorkspace(workspaceId: string): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  fs.rmSync(wsPath, { recursive: true, force: true });
  return true;
}

export function listWorkspaces(
  userId: string,
  projectId: string,
): WorkspaceMeta[] {
  const workspaceDir = getWorkspaceDir(userId, projectId);
  if (!fs.existsSync(workspaceDir)) return [];

  const workspaces: WorkspaceMeta[] = [];
  const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(workspaceDir, entry.name, ".workspace.json");
    if (!fs.existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(
        fs.readFileSync(metaPath, "utf-8"),
      ) as WorkspaceMeta;
      workspaces.push(meta);
    } catch {
      continue;
    }
  }

  return workspaces.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findActiveWorkspace(
  userId: string,
  projectId: string,
): string | null {
  const workspaces = listWorkspaces(userId, projectId);
  return workspaces.length > 0 ? workspaces[0].workspaceId : null;
}

export function updateWorkspaceTimestamp(workspaceId: string): void {
  const meta = getWorkspaceMetaFromFs(workspaceId);
  if (!meta) return;

  meta.updatedAt = Date.now();
  writeWorkspaceMeta(workspaceId, meta);
}

/**
 * 收集所有活跃（未过期）session 引用的 workspaceId
 */
function collectActiveWorkspaceIds(): Set<string> {
  const ids = new Set<string>();
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) return ids;

  const userDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const projectDirs = fs.readdirSync(path.join(sessionsDir, userDir.name), {
      withFileTypes: true,
    });
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const sessionDirs = fs.readdirSync(
        path.join(sessionsDir, userDir.name, projectDir.name),
        { withFileTypes: true },
      );
      for (const sessionDir of sessionDirs) {
        if (!sessionDir.isDirectory()) continue;
        const metaPath = path.join(
          sessionsDir,
          userDir.name,
          projectDir.name,
          sessionDir.name,
          ".session.json",
        );
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            if (meta.workspaceId && Date.now() <= meta.expiresAt) {
              ids.add(meta.workspaceId);
            }
          } catch {
            /* 忽略损坏的 session 元数据 */
          }
        }
      }
    }
  }

  return ids;
}

/**
 * 清理孤儿 workspace：没有任何活跃 session 引用的过期 workspace
 * @param ttlMs TTL 时间，默认 24 小时
 */
export function cleanupOrphanWorkspaces(
  ttlMs: number = 24 * 60 * 60 * 1000,
): string[] {
  const cleaned: string[] = [];
  const workspacesDir = getWorkspacesDir();
  if (!fs.existsSync(workspacesDir)) return cleaned;

  const activeWorkspaceIds = collectActiveWorkspaceIds();

  const userDirs = fs.readdirSync(workspacesDir, { withFileTypes: true });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const userWsDir = path.join(workspacesDir, userDir.name);
    const projectDirs = fs.readdirSync(userWsDir, { withFileTypes: true });

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const projectWsDir = path.join(userWsDir, projectDir.name);
      const wsEntries = fs.readdirSync(projectWsDir, { withFileTypes: true });

      for (const entry of wsEntries) {
        if (!entry.isDirectory()) continue;

        const wsId = entry.name;
        if (activeWorkspaceIds.has(wsId)) continue;

        const wsPath = path.join(projectWsDir, wsId);
        const metaPath = path.join(wsPath, ".workspace.json");

        let shouldDelete = false;
        if (fs.existsSync(metaPath)) {
          try {
            const wsMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            shouldDelete =
              wsMeta.scope !== "live" &&
              Date.now() - wsMeta.updatedAt > ttlMs;
          } catch {
            const stat = fs.statSync(wsPath);
            shouldDelete = Date.now() - stat.mtimeMs > ttlMs;
          }
        } else {
          const stat = fs.statSync(wsPath);
          shouldDelete = Date.now() - stat.mtimeMs > ttlMs;
        }

        if (shouldDelete) {
          fs.rmSync(wsPath, { recursive: true, force: true });
          cleaned.push(wsId);
        }
      }
    }
  }

  return cleaned;
}

/**
 * 将会话工作区替换为项目工作区的最新内容。
 * 用于版本恢复后同步会话工作区。
 */
export function syncSessionFromProject(
  userId: string,
  projectId: string,
  workspaceId: string,
): string | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const projectPath = getProjectPath(projectId);
  const projectWorkspacePath = path.join(projectPath, "workspace");
  if (!fs.existsSync(projectWorkspacePath)) return null;

  const existingMeta = getWorkspaceMetaFromFs(workspaceId);
  fs.rmSync(wsPath, { recursive: true, force: true });
  fs.cpSync(projectWorkspacePath, wsPath, { recursive: true });

  const meta: WorkspaceMeta = {
    ...(existingMeta ?? {
      workspaceId,
      demoId: projectId,
      projectId,
      userId,
      createdAt: Date.now(),
    }),
    demoId: projectId,
    projectId,
    updatedAt: Date.now(),
  };
  fs.writeFileSync(
    path.join(wsPath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );

  return wsPath;
}

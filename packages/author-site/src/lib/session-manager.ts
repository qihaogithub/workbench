import path from "path";
import fs from "fs";
import {
  getSessionsDir,
  getProjectPath,
  getSessionPath,
  getSnapshotPath,
  projectExists,
  deleteSession,
  getLatestVersion,
  readProjectMeta,
  writeProjectMeta,
  generateVersionId,
  countFiles,
  cleanupOldVersions,
  createProjectVersionSnapshot,
  findWorkspacePath,
  getWorkspaceMultiDemoFiles,
  syncProjectDemoPagesFromWorkspace,
  listDemoPages,
} from "./fs-utils";
import {
  getOrCreateProjectActiveWorkspace,
  isLiveWorkspace,
  findActiveWorkspace,
  syncActiveWorkspaceToCanonical,
  advanceWorkspaceBaseIfLatestSessionVersion,
} from "./workspace-manager";
import type {
  VersionInfo,
  MultiDemoFiles,
  VersionHistoryEntryType,
} from "@opencode-workbench/shared";
const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;
const DIRECTORY_REPLACE_RETRY_DELAYS_MS = [80, 160, 320, 640];

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function replaceDirectoryWithTemp(tempPath: string, targetPath: string): void {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DIRECTORY_REPLACE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      fs.renameSync(tempPath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < DIRECTORY_REPLACE_RETRY_DELAYS_MS.length) {
        sleepSync(DIRECTORY_REPLACE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.cpSync(tempPath, targetPath, { recursive: true });
    fs.rmSync(tempPath, { recursive: true, force: true });
  } catch {
    throw lastError;
  }
}

export interface CreateSessionResult {
  sessionId: string;
  workspaceId: string;
  workspaceScope: "live" | "branch" | "snapshot-source" | "legacy";
  isSharedWorkspace: boolean;
  workspacePath: string;
  /** 第一个 demo 页面的代码（兼容字段，Stage 2 将由前端切换为 demos 字段） */
  code: string;
  /** 第一个 demo 页面的 Schema（兼容字段） */
  schema: string;
  /** @deprecated 兼容旧调用方，等同于 workspacePath */
  tempWorkspace: string;
  /** 多页面文件集合 + 项目级配置 Schema */
  demos: MultiDemoFiles;
}

/** 从 MultiDemoFiles 提取第一个 demo 的 code/schema，便于 Stage 1 兼容旧调用方 */
function pickFirstDemoFiles(
  multi: MultiDemoFiles | null | undefined,
  sortedPageIds?: string[],
): {
  code: string;
  schema: string;
} {
  if (!multi) return { code: "", schema: "" };
  const ids = Object.keys(multi.demos);
  if (ids.length === 0) return { code: "", schema: "" };
  const firstId = sortedPageIds && sortedPageIds.length > 0
    ? sortedPageIds.find(id => ids.includes(id)) ?? ids[0]
    : ids[0];
  const first = multi.demos[firstId];
  return { code: first.code, schema: first.schema };
}

/**
 * 获取项目 Session 目录路径
 * 新结构: sessions/{userId}/{projectId}/
 */
function getProjectSessionDir(userId: string, projectId: string): string {
  return path.join(getSessionsDir(), userId, projectId);
}

export function archiveActiveSession(
  userId: string,
  projectId: string,
): string | null {
  const projectSessionDir = getProjectSessionDir(userId, projectId);
  if (!fs.existsSync(projectSessionDir)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(projectSessionDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(
        projectSessionDir,
        entry.name,
        ".session.json",
      );
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

        if (meta.userId && meta.userId !== userId) continue;
        if (Date.now() > meta.expiresAt) continue;

        const status = meta.status || "editing";
        if (status !== "editing") continue;

        if (meta.demoId === projectId) {
          meta.status = "archived";
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
          return entry.name;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 限制项目下的 Session 数量，超出时删除最旧的
 * @returns 被删除的 Session 数量
 */
export function enforceSessionLimit(
  userId: string,
  projectId: string,
  maxCount = 5,
): number {
  if (maxCount < 1) return 0;

  const projectSessionsDir = getProjectSessionDir(userId, projectId);
  if (
    !fs.existsSync(projectSessionsDir) ||
    !fs.statSync(projectSessionsDir).isDirectory()
  ) {
    return 0;
  }

  const sessions: Array<{ sessionId: string; createdAt: number }> = [];
  const entries = fs.readdirSync(projectSessionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(projectSessionsDir, entry.name, ".session.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (meta.demoId !== projectId) continue;
      if (meta.userId !== userId) continue;
      if (typeof meta.sessionId !== "string") continue;

      const createdAt =
        typeof meta.createdAt === "number" ? meta.createdAt : 0;
      sessions.push({ sessionId: meta.sessionId, createdAt });
    } catch { /* skip */ }
  }

  if (sessions.length <= maxCount) return 0;

  sessions.sort((a, b) => a.createdAt - b.createdAt);
  const toDelete = sessions.slice(0, sessions.length - maxCount);

  let deletedCount = 0;
  for (const s of toDelete) {
    try {
      deleteSession(s.sessionId);
      deletedCount++;
    } catch (err) {
      console.error(`Failed to delete old session ${s.sessionId}:`, err);
    }
  }

  return deletedCount;
}

export function findActiveSession(
  userId: string,
  projectId: string,
): string | null {
  const projectSessionDir = getProjectSessionDir(userId, projectId);
  if (!fs.existsSync(projectSessionDir)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(projectSessionDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(
        projectSessionDir,
        entry.name,
        ".session.json",
      );
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

        // 防御性检查：如果 session 元数据中的 userId 与路径不匹配，记录警告
        if (meta.userId && meta.userId !== userId) {
          console.warn(
            `[Session] Session ${entry.name} metadata userId (${meta.userId}) ` +
              `doesn't match path userId (${userId}). Possible data corruption.`,
          );
          continue;
        }

        // 发现过期 session，归档而非删除（保留消息历史）
        if (Date.now() > meta.expiresAt) {
          // 仅清理 workspace 临时文件，保留 session 元数据和消息
          if (meta.workspaceId && !isLiveWorkspace(meta.workspaceId)) {
            const wsPath = findWorkspacePath(meta.workspaceId);
            if (wsPath && fs.existsSync(wsPath)) {
              fs.rmSync(wsPath, { recursive: true, force: true });
            }
          }
          // 更新状态为 expired 而非删除
          if (meta.status === 'editing') {
            meta.status = 'expired';
            try {
              fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
            } catch { /* ignore write error */ }
          }
          console.log(`[Session] Archived expired session: ${entry.name}`);
          continue;
        }

        // 跳过已保存或已放弃的 session
        const status = meta.status || 'editing';
        if (status !== 'editing') {
          continue;
        }

        if (meta.workspaceId && !findWorkspacePath(meta.workspaceId)) {
          meta.status = 'orphaned';
          try {
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
          } catch { /* ignore write error */ }
          console.warn(
            `[Session] Archived session with missing workspace: ${entry.name}`,
          );
          continue;
        }

        if (meta.demoId === projectId) {
          // 返回目录名作为 sessionId，确保与文件系统一致
          // 同时更新 .session.json 中的 sessionId 字段以保持一致
          if (meta.sessionId !== entry.name) {
            meta.sessionId = entry.name;
            fs.writeFileSync(
              metaPath,
              JSON.stringify(meta, null, 2),
              "utf-8",
            );
            console.log(`[Session] Fixed sessionId mismatch in ${entry.name}`);
          }
          return entry.name;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function listActiveSessionsForUser(userId: string): string[] {
  const userSessionsDir = path.join(getSessionsDir(), userId);
  if (!fs.existsSync(userSessionsDir)) {
    return [];
  }

  const sessionIds: string[] = [];

  try {
    const projectDirs = fs.readdirSync(userSessionsDir, {
      withFileTypes: true,
    });

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectSessionDir = path.join(userSessionsDir, projectDir.name);
      const sessionDirs = fs.readdirSync(projectSessionDir, {
        withFileTypes: true,
      });

      for (const sessionDir of sessionDirs) {
        if (!sessionDir.isDirectory()) continue;

        const metaPath = path.join(
          projectSessionDir,
          sessionDir.name,
          ".session.json",
        );
        if (!fs.existsSync(metaPath)) continue;

        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          if (meta.userId && meta.userId !== userId) continue;
          if (Date.now() > meta.expiresAt) continue;
          if ((meta.status || "editing") !== "editing") continue;

          sessionIds.push(sessionDir.name);
        } catch {
          continue;
        }
      }
    }
  } catch {
    return sessionIds;
  }

  return sessionIds;
}

export function rebindProjectEditingSessionsToWorkspace(
  projectId: string,
  workspaceId: string,
): number {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) return 0;

  let updated = 0;
  const userDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const projectSessionDir = path.join(sessionsDir, userDir.name, projectId);
    if (!fs.existsSync(projectSessionDir)) continue;

    const sessionDirs = fs.readdirSync(projectSessionDir, { withFileTypes: true });
    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue;
      const metaPath = path.join(projectSessionDir, sessionDir.name, ".session.json");
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (meta.demoId !== projectId) continue;
        if ((meta.status || "editing") !== "editing") continue;
        if (Date.now() > meta.expiresAt) continue;
        if (meta.workspaceId === workspaceId) continue;
        meta.workspaceId = workspaceId;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
        updated += 1;
      } catch {
        continue;
      }
    }
  }

  return updated;
}

export function ensureSessionUsesProjectActiveWorkspace(
  userId: string,
  projectId: string,
  sessionId: string,
): { workspaceId: string; workspacePath: string } | null {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath) return null;
  const metaPath = path.join(sessionPath, ".session.json");
  if (!fs.existsSync(metaPath)) return null;

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  const migrationWorkspaceId =
    typeof meta.workspaceId === "string" && !isLiveWorkspace(meta.workspaceId)
      ? meta.workspaceId
      : findActiveWorkspace(userId, projectId);
  const active = getOrCreateProjectActiveWorkspace(projectId, {
    migrationWorkspaceId,
  });
  if (meta.workspaceId !== active.workspaceId) {
    meta.workspaceId = active.workspaceId;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  }
  rebindProjectEditingSessionsToWorkspace(projectId, active.workspaceId);
  return {
    workspaceId: active.workspaceId,
    workspacePath: active.workspacePath,
  };
}

export async function createEditSession(
  userId: string,
  projectId: string,
  existingWorkspaceId?: string,
): Promise<CreateSessionResult> {
  if (!projectExists(projectId)) {
    throw new Error(`Project "${projectId}" 不存在`);
  }

  let workspaceId: string;
  let workspacePath: string;
  let demos: MultiDemoFiles;
  let workspaceScope: CreateSessionResult["workspaceScope"] = "live";

  if (existingWorkspaceId) {
    const wsPath = findWorkspacePath(existingWorkspaceId);
    if (!wsPath) {
      throw new Error(`Workspace "${existingWorkspaceId}" 不存在`);
    }
    workspaceId = existingWorkspaceId;
    workspacePath = wsPath;
    workspaceScope = isLiveWorkspace(existingWorkspaceId) ? "live" : "branch";
    demos = getWorkspaceMultiDemoFiles(existingWorkspaceId) ?? {
      demos: {},
      projectConfigSchema: undefined,
    };
  } else {
    const wsResult = getOrCreateProjectActiveWorkspace(projectId, {
      migrationWorkspaceId: findActiveWorkspace(userId, projectId),
    });
    workspaceId = wsResult.workspaceId;
    workspacePath = wsResult.workspacePath;
    demos = wsResult.demos;
    workspaceScope = wsResult.workspaceScope ?? "live";
    rebindProjectEditingSessionsToWorkspace(projectId, workspaceId);
  }

  const sortedPageIds = listDemoPages(workspacePath).map(p => p.id);
  const { code, schema } = pickFirstDemoFiles(demos, sortedPageIds);

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const sessionDir = getProjectSessionDir(userId, projectId);
  const sessionPath = path.join(sessionDir, sessionId);

  fs.mkdirSync(sessionPath, { recursive: true });

  const latestVersion = getLatestVersion(projectId);

  const sessionMeta = {
    sessionId,
    userId,
    demoId: projectId,
    workspaceId,
    status: 'editing' as const,
    basedOnVersion: latestVersion?.versionId || 'v0',
    opencodeSessionId: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  };
  fs.writeFileSync(
    path.join(sessionPath, ".session.json"),
    JSON.stringify(sessionMeta, null, 2),
    "utf-8",
  );

  return {
    sessionId,
    workspaceId,
    workspaceScope,
    isSharedWorkspace: workspaceScope === "live",
    workspacePath,
    code,
    schema,
    tempWorkspace: workspacePath,
    demos,
  };
}

export function getEditSession(sessionId: string) {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return null;
  }

  const metaPath = path.join(sessionPath, ".session.json");
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

  let workspacePath = "";
  let demos: MultiDemoFiles = { demos: {}, projectConfigSchema: undefined };

  if (meta.workspaceId) {
    const wsPath = findWorkspacePath(meta.workspaceId);
    if (wsPath) {
      workspacePath = wsPath;
      demos = getWorkspaceMultiDemoFiles(meta.workspaceId) ?? demos;
    }
  }

  const sortedPageIds = workspacePath ? listDemoPages(workspacePath).map(p => p.id) : undefined;
  const { code, schema } = pickFirstDemoFiles(demos, sortedPageIds);

  return {
    sessionId: meta.sessionId,
    demoId: meta.demoId,
    userId: meta.userId,
    workspaceId: meta.workspaceId || null,
    status: meta.status || 'editing',
    basedOnVersion: meta.basedOnVersion || 'v0',
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    code,
    schema,
    workspacePath,
    demos,
  };
}

export interface SaveEditSessionResult {
  success: boolean;
  version?: string;
  savedAt?: number;
  error?: string;
}

export function saveEditSession(
  sessionId: string,
  username?: string,
  note?: string,
  versionType: VersionHistoryEntryType = "named_version",
): SaveEditSessionResult {
  const sessionMeta = getEditSession(sessionId);
  if (!sessionMeta) {
    return { success: false, error: 'Session not found' };
  }

  const sessionPath = getSessionPath(sessionId);
  const status = sessionMeta.status || 'editing';
  if (status !== 'editing') {
    if (sessionPath && fs.existsSync(sessionPath)) {
      try {
        const metaPath = path.join(sessionPath, ".session.json");
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          meta.status = 'editing';
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
          console.log(`[saveEditSession] 修复 session ${sessionId} 状态为 editing`);
        }
      } catch (e) {
        console.error(`[saveEditSession] 修复 session 状态失败:`, e);
        return { success: false, error: 'Session not in editing status' };
      }
    } else {
      return { success: false, error: 'Session not in editing status' };
    }
  }

  const { demoId: projectId, workspaceId } = sessionMeta;
  let project = readProjectMeta(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  if (workspaceId) {
    let synced = syncActiveWorkspaceToCanonical(projectId, workspaceId);
    if (
      !synced.success &&
      synced.code === "WORKSPACE_STALE" &&
      advanceWorkspaceBaseIfLatestSessionVersion(projectId, workspaceId, sessionId)
    ) {
      synced = syncActiveWorkspaceToCanonical(projectId, workspaceId);
    }
    if (!synced.success) {
      return {
        success: false,
        error: synced.error || "Sync active workspace failed",
      };
    }
    project = readProjectMeta(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }
  }

  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");

  if (workspaceId) {
    const result = createProjectVersionSnapshot(projectId, username || "未知用户", {
      sessionId,
      note,
      type: versionType,
      sourceWorkspacePath: workspacePath,
      advanceWorkspaceId: workspaceId,
    });

    if (!result.success || !result.version) {
      return {
        success: false,
        error: result.error || "Create project version snapshot failed",
      };
    }

    syncProjectDemoPagesFromWorkspace(projectId, workspacePath);

    return {
      success: true,
      version: result.version.versionId,
      savedAt: result.version.savedAt,
    };
  }

  const versionId = generateVersionId(project);
  const snapshotPath = getSnapshotPath(projectId, versionId);

  try {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    if (fs.existsSync(workspacePath)) {
      fs.cpSync(workspacePath, snapshotPath, {
        recursive: true,
        filter: (src: string) => !src.includes('node_modules'),
      });
    }

    let sourcePath: string;
    if (workspaceId) {
      const wsPath = findWorkspacePath(workspaceId);
      sourcePath = wsPath || "";
    } else {
      sourcePath = sessionPath || "";
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      console.error(`[saveEditSession] sourcePath 不存在: ${sourcePath}`);
      return { success: false, error: `Workspace source not found: ${workspaceId}` };
    }

    const tempPath = workspacePath + '.tmp';
    // 清理上次保存可能残留的临时目录
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
    try {
      fs.cpSync(sourcePath, tempPath, {
        recursive: true,
        filter: (src: string) => !src.includes('node_modules'),
      });

      const tempMetaJson = path.join(tempPath, ".session.json");
      if (fs.existsSync(tempMetaJson)) {
        fs.rmSync(tempMetaJson, { force: true });
      }
      const tempWsJson = path.join(tempPath, ".workspace.json");
      if (fs.existsSync(tempWsJson)) {
        fs.rmSync(tempWsJson, { force: true });
      }

      replaceDirectoryWithTemp(tempPath, workspacePath);
    } catch (e) {
      fs.rmSync(tempPath, { recursive: true, force: true });
      throw e;
    }

    const versionInfo: VersionInfo = {
      versionId,
      type: versionType,
      savedAt: Date.now(),
      savedBy: username || '未知用户',
      sessionId,
      snapshotPath,
      fileCount: countFiles(workspacePath),
      note,
    };

    project.versions.push(versionInfo);
    project.updatedAt = Date.now();

    cleanupOldVersions(project);
    writeProjectMeta(projectId, project);

    syncProjectDemoPagesFromWorkspace(projectId, workspacePath);

    const metaPath = path.join(sessionPath!, ".session.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (!isLiveWorkspace(workspaceId)) {
        meta.status = 'saved';
        meta.savedAt = Date.now();
      }
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    }

    if (!isLiveWorkspace(workspaceId)) {
      // 归档而非删除：保留 .session.json 和 .messages.json 供历史对话查看
      // 仅清理 workspace 临时文件以节省空间
      try {
        if (workspaceId) {
          const wsPath = findWorkspacePath(workspaceId);
          if (wsPath && fs.existsSync(wsPath)) {
            fs.rmSync(wsPath, { recursive: true, force: true });
          }
        }
        // 清理 session 目录下的 demos 和 assets 子目录（保留元数据和消息）
        const sessionDirEntries = fs.readdirSync(sessionPath!, { withFileTypes: true });
        for (const entry of sessionDirEntries) {
          if (entry.isDirectory() && (entry.name === 'demos' || entry.name === 'assets')) {
            fs.rmSync(path.join(sessionPath!, entry.name), { recursive: true, force: true });
          }
        }
      } catch (e) {
        console.warn(`[saveEditSession] 清理 workspace 失败，但保存已成功:`, e);
      }
    }

    return {
      success: true,
      version: versionId,
      savedAt: versionInfo.savedAt,
    };
  } catch (error) {
    console.error(`[saveEditSession] 保存失败:`, error);

    // 尝试从最新快照恢复 workspace
    if (project.versions.length > 0) {
      const latestVersion = project.versions[project.versions.length - 1];
      const latestSnapshot = latestVersion.snapshotPath;
      if (fs.existsSync(latestSnapshot)) {
        console.log(`[saveEditSession] 尝试从快照 ${latestVersion.versionId} 恢复 workspace`);
        try {
          if (fs.existsSync(workspacePath)) {
            fs.rmSync(workspacePath, { recursive: true, force: true });
          }
          fs.cpSync(latestSnapshot, workspacePath, { recursive: true });
          console.log(`[saveEditSession] 恢复成功`);
        } catch (restoreError) {
          console.error(`[saveEditSession] 恢复失败:`, restoreError);
        }
      }
    }

    if (error instanceof Error) {
      return { success: false, error: `Save failed: ${error.message}` };
    }
    return { success: false, error: 'Save failed' };
  }
}

export function syncEditSessionToProjectWorkspace(
  sessionId: string,
): { success: boolean; projectId?: string; workspacePath?: string; error?: string } {
  const sessionMeta = getEditSession(sessionId);
  if (!sessionMeta) {
    return { success: false, error: "Session not found" };
  }

  const { demoId: projectId, workspaceId } = sessionMeta;
  const project = readProjectMeta(projectId);
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  const synced = syncActiveWorkspaceToCanonical(projectId, workspaceId);
  return synced.success
    ? { success: true, projectId, workspacePath: synced.workspacePath }
    : { success: false, error: synced.error };
}

export function archiveSession(sessionId: string, status: 'discarded' | 'saved' | 'archived' = 'discarded'): boolean {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return false;
  }

  const metaPath = path.join(sessionPath, ".session.json");
  if (!fs.existsSync(metaPath)) {
    return false;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

    // 清理 workspace 临时文件
    if (meta.workspaceId && !isLiveWorkspace(meta.workspaceId)) {
      const wsPath = findWorkspacePath(meta.workspaceId);
      if (wsPath && fs.existsSync(wsPath)) {
        fs.rmSync(wsPath, { recursive: true, force: true });
      }
    }

    // 清理 session 目录下的 demos 和 assets 子目录（保留元数据和消息）
    const sessionDirEntries = fs.readdirSync(sessionPath, { withFileTypes: true });
    for (const entry of sessionDirEntries) {
      if (entry.isDirectory() && (entry.name === 'demos' || entry.name === 'assets')) {
        fs.rmSync(path.join(sessionPath, entry.name), { recursive: true, force: true });
      }
    }

    // 更新状态
    meta.status = status;
    meta.archivedAt = Date.now();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

    return true;
  } catch {
    return false;
  }
}

export function dropEditSession(sessionId: string): boolean {
  return deleteSession(sessionId);
}

export function discardEditSession(sessionId: string): boolean {
  // 归档而非删除，保留消息历史
  return archiveSession(sessionId, 'discarded');
}

/**
 * 清理指定用户的过期 Session
 * 仅清理 workspace 临时文件，保留 session 元数据和消息历史
 */
export function cleanupExpiredSessions(userId: string): string[] {
  const userSessionsDir = path.join(getSessionsDir(), userId);
  if (!fs.existsSync(userSessionsDir)) {
    return [];
  }

  const cleaned: string[] = [];
  const projectDirs = fs.readdirSync(userSessionsDir, { withFileTypes: true });

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;

    const projectSessionDir = path.join(userSessionsDir, projectDir.name);
    const sessionDirs = fs.readdirSync(projectSessionDir, {
      withFileTypes: true,
    });

    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue;

      const metaPath = path.join(
        projectSessionDir,
        sessionDir.name,
        ".session.json",
      );
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (Date.now() > meta.expiresAt) {
          // 仅清理 workspace，保留 session 元数据和消息
          if (meta.workspaceId && !isLiveWorkspace(meta.workspaceId)) {
            const wsPath = findWorkspacePath(meta.workspaceId);
            if (wsPath && fs.existsSync(wsPath)) {
              fs.rmSync(wsPath, { recursive: true, force: true });
            }
          }
          // 更新状态为 expired
          if (meta.status === 'editing') {
            meta.status = 'expired';
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
          }
          cleaned.push(sessionDir.name);
        }
      } catch {
        continue;
      }
    }
  }

  return cleaned;
}

/**
 * 全局清理：遍历所有用户的过期 Session（用于后台定时任务）
 * 仅清理 workspace 临时文件，保留 session 元数据和消息历史
 */
export function cleanupAllExpiredSessions(): string[] {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const cleaned: string[] = [];
  const userDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });

  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;

    const userId = userDir.name;
    const userSessionsDir = path.join(sessionsDir, userId);
    const projectDirs = fs.readdirSync(userSessionsDir, {
      withFileTypes: true,
    });

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectSessionDir = path.join(userSessionsDir, projectDir.name);
      const sessionDirs = fs.readdirSync(projectSessionDir, {
        withFileTypes: true,
      });

      for (const sessionDir of sessionDirs) {
        if (!sessionDir.isDirectory()) continue;

        const metaPath = path.join(
          projectSessionDir,
          sessionDir.name,
          ".session.json",
        );
        if (!fs.existsSync(metaPath)) continue;

        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          if (Date.now() > meta.expiresAt) {
            // 仅清理 workspace，保留 session 元数据和消息
            if (meta.workspaceId && !isLiveWorkspace(meta.workspaceId)) {
              const wsPath = findWorkspacePath(meta.workspaceId);
              if (wsPath && fs.existsSync(wsPath)) {
                fs.rmSync(wsPath, { recursive: true, force: true });
              }
            }
            // 更新状态为 expired
            if (meta.status === 'editing') {
              meta.status = 'expired';
              fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
            }
            cleaned.push(sessionDir.name);
          }
        } catch {
          continue;
        }
      }
    }
  }

  return cleaned;
}

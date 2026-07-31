import path from "path";
import fs from "fs";

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

export const DATA_DIR =
  process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
export const PROJECTS_DIR =
  process.env.PROJECTS_DIR || path.join(DATA_DIR, "projects");
export const TEMPLATES_DIR =
  process.env.TEMPLATES_DIR || path.join(DATA_DIR, "templates");
export const SESSIONS_DIR =
  process.env.SESSIONS_DIR || path.join(DATA_DIR, "sessions");
export const WORKSPACES_DIR =
  process.env.WORKSPACES_DIR || path.join(DATA_DIR, "workspaces");
export const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || path.join(DATA_DIR, "snapshots");

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

let sessionIndexInitialized = false;

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
  if (!sessionIndexInitialized) {
    sessionIndexInitialized = true;
    initSessionPathIndex();
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

const sessionPathCache = new Map<string, { path: string | null; at: number }>();
const SESSION_PATH_CACHE_TTL = 5 * 60_000;

const sessionPathIndex = new Map<string, string>();

export function registerSessionPath(sessionId: string, sessionPath: string): void {
  sessionPathIndex.set(sessionId, sessionPath);
}

export function unregisterSessionPath(sessionId: string): void {
  sessionPathIndex.delete(sessionId);
  sessionPathCache.delete(sessionId);
}

export function initSessionPathIndex(): void {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const level1Path = path.join(SESSIONS_DIR, entry.name);
    const subEntries = fs.readdirSync(level1Path, { withFileTypes: true });
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;
      const subPath = path.join(level1Path, sub.name);
      const leafEntries = fs.readdirSync(subPath, { withFileTypes: true });
      for (const leaf of leafEntries) {
        if (!leaf.isDirectory()) continue;
        const sessionDir = path.join(subPath, leaf.name);
        const metaPath = path.join(sessionDir, ".session.json");
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            if (meta.sessionId) {
              sessionPathIndex.set(meta.sessionId, sessionDir);
            }
          } catch { /* skip */ }
        }
      }
    }
  }
}

export function findSessionPath(sessionId: string): string | null {
  const cached = sessionPathCache.get(sessionId);
  if (cached && Date.now() - cached.at < SESSION_PATH_CACHE_TTL) {
    return cached.path;
  }

  const indexed = sessionPathIndex.get(sessionId);
  if (indexed && fs.existsSync(indexed)) {
    sessionPathCache.set(sessionId, { path: indexed, at: Date.now() });
    return indexed;
  }
  if (indexed) {
    sessionPathIndex.delete(sessionId);
  }

  if (!fs.existsSync(SESSIONS_DIR)) {
    sessionPathCache.set(sessionId, { path: null, at: Date.now() });
    return null;
  }

  const level1Entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });

  for (const level1 of level1Entries) {
    if (!level1.isDirectory()) continue;

    const level1Path = path.join(SESSIONS_DIR, level1.name);

    const directPath = path.join(level1Path, sessionId);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
      sessionPathIndex.set(sessionId, directPath);
      sessionPathCache.set(sessionId, { path: directPath, at: Date.now() });
      return directPath;
    }

    const level2Entries = fs.readdirSync(level1Path, { withFileTypes: true });
    for (const level2 of level2Entries) {
      if (!level2.isDirectory()) continue;

      const level2Path = path.join(level1Path, level2.name);

      const sessionPathByName = path.join(level2Path, sessionId);
      if (
        fs.existsSync(sessionPathByName) &&
        fs.statSync(sessionPathByName).isDirectory()
      ) {
        sessionPathIndex.set(sessionId, sessionPathByName);
        sessionPathCache.set(sessionId, { path: sessionPathByName, at: Date.now() });
        return sessionPathByName;
      }

      const level3Entries = fs.readdirSync(level2Path, { withFileTypes: true });
      for (const level3 of level3Entries) {
        if (!level3.isDirectory()) continue;

        const level3Path = path.join(level2Path, level3.name);
        const metaPath = path.join(level3Path, ".session.json");

        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            if (meta.sessionId) {
              sessionPathIndex.set(meta.sessionId, level3Path);
            }
            if (meta.sessionId === sessionId) {
              sessionPathCache.set(sessionId, { path: level3Path, at: Date.now() });
              return level3Path;
            }
          } catch {
            // 忽略解析错误的文件
          }
        }
      }
    }
  }

  sessionPathCache.set(sessionId, { path: null, at: Date.now() });
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

export function getDemosDir(): string {
  return PROJECTS_DIR;
}

export function getDemoPath(demoId: string): string {
  return getProjectPath(demoId);
}

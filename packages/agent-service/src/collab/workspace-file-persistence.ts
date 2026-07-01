import fs from "fs";
import path from "path";

import type { CollabResourceKind } from "@opencode-workbench/shared/contracts";

export interface SessionValidation {
  ok: boolean;
  reason?: string;
  userId?: string;
  username?: string;
  workspacePath?: string;
}

interface SessionMetaFile {
  sessionId?: string;
  demoId?: string;
  userId?: string;
  username?: string;
  workspaceId?: string;
  expiresAt?: number;
}

interface WorkspaceMetaFile {
  workspaceId?: string;
  demoId?: string;
  userId?: string;
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

function getDefaultDataDir(): string {
  return process.env.DATA_DIR ?? path.join(findProjectRoot(process.cwd()), "data");
}

export class WorkspaceFilePersistence {
  readonly dataDir: string;

  constructor(dataDir = getDefaultDataDir()) {
    this.dataDir = dataDir;
  }

  validateSession(input: {
    projectId: string;
    workspaceId: string;
    sessionId: string;
    resourcePath: string;
    kind: CollabResourceKind;
  }): SessionValidation {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok || !validation.workspacePath) return validation;

    const safePath = this.resolveResourcePath(validation.workspacePath, input.resourcePath, input.kind);
    if (!safePath) return { ok: false, reason: "INVALID_RESOURCE_PATH" };

    return validation;
  }

  validateWorkspaceSession(input: {
    projectId: string;
    workspaceId: string;
    sessionId: string;
  }): SessionValidation {
    const session = this.findSessionMeta(input.sessionId);
    if (!session) return { ok: false, reason: "SESSION_NOT_FOUND" };
    if (session.expiresAt && Date.now() > session.expiresAt) {
      return { ok: false, reason: "SESSION_EXPIRED" };
    }
    if (session.demoId !== input.projectId) {
      return { ok: false, reason: "PROJECT_MISMATCH" };
    }
    if (session.workspaceId !== input.workspaceId) {
      return { ok: false, reason: "WORKSPACE_MISMATCH" };
    }

    const workspacePath = this.findWorkspacePath(input.workspaceId);
    if (!workspacePath) return { ok: false, reason: "WORKSPACE_NOT_FOUND" };

    const workspaceMeta = this.readWorkspaceMeta(workspacePath);
    if (workspaceMeta?.demoId && workspaceMeta.demoId !== input.projectId) {
      return { ok: false, reason: "WORKSPACE_PROJECT_MISMATCH" };
    }
    if (!workspaceMeta?.demoId) {
      const inferredProjectId = this.inferProjectIdFromWorkspacePath(workspacePath);
      if (inferredProjectId && inferredProjectId !== input.projectId) {
        return { ok: false, reason: "WORKSPACE_PROJECT_MISMATCH" };
      }
    }

    return {
      ok: true,
      userId: session.userId,
      username: session.username ?? session.userId,
      workspacePath,
    };
  }

  readResource(workspacePath: string, resourcePath: string, kind: CollabResourceKind): string {
    const filePath = this.resolveResourcePath(workspacePath, resourcePath, kind);
    if (!filePath || !fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf-8");
  }

  writeResource(workspacePath: string, resourcePath: string, kind: CollabResourceKind, content: string): void {
    const filePath = this.resolveResourcePath(workspacePath, resourcePath, kind);
    if (!filePath) throw new Error("INVALID_RESOURCE_PATH");

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, filePath);
    this.touchWorkspace(workspacePath);
  }

  resolveResourcePath(
    workspacePath: string,
    resourcePath: string,
    kind: CollabResourceKind,
  ): string | null {
    const normalized = resourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.includes("\0") || normalized.split("/").includes("..")) {
      return null;
    }
    if (!this.isAllowedResource(normalized, kind)) return null;

    const fullPath = path.resolve(workspacePath, normalized);
    const root = path.resolve(workspacePath);
    if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
      return null;
    }
    return fullPath;
  }

  private isAllowedResource(resourcePath: string, kind: CollabResourceKind): boolean {
    if (kind === "page-code") return /^demos\/[^/]+\/index\.tsx$/.test(resourcePath);
    if (kind === "page-schema") return /^demos\/[^/]+\/config\.schema\.json$/.test(resourcePath);
    if (kind === "project-schema") return resourcePath === "project.config.schema.json";
    if (kind === "workspace-tree") return resourcePath === "workspace-tree.json";
    if (kind === "canvas-layout") return resourcePath === ".canvas-layout.json";
    if (kind === "knowledge-document") {
      return /^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(resourcePath);
    }
    return false;
  }

  private findSessionMeta(sessionId: string): SessionMetaFile | null {
    const sessionsDir = path.join(this.dataDir, "sessions");
    if (!fs.existsSync(sessionsDir)) return null;
    return this.findJsonFile<SessionMetaFile>(sessionsDir, ".session.json", (meta) => meta.sessionId === sessionId);
  }

  private findWorkspacePath(workspaceId: string): string | null {
    const workspacesDir = path.join(this.dataDir, "workspaces");
    if (!fs.existsSync(workspacesDir)) return null;

    const directPath = path.join(workspacesDir, workspaceId);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
      return directPath;
    }

    const pathByDirectoryName = this.findDirectoryByName(workspacesDir, workspaceId);
    if (pathByDirectoryName) return pathByDirectoryName;

    const found = this.findJsonPath(workspacesDir, ".workspace.json", (meta: WorkspaceMetaFile) => {
      return meta.workspaceId === workspaceId;
    });
    return found ? path.dirname(found) : null;
  }

  private inferProjectIdFromWorkspacePath(workspacePath: string): string | null {
    const workspacesDir = path.resolve(this.dataDir, "workspaces");
    const resolvedWorkspacePath = path.resolve(workspacePath);
    const relative = path.relative(workspacesDir, resolvedWorkspacePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }

    const segments = relative.split(path.sep).filter(Boolean);
    return segments.length >= 3 ? segments[1] : null;
  }

  private readWorkspaceMeta(workspacePath: string): WorkspaceMetaFile | null {
    const metaPath = path.join(workspacePath, ".workspace.json");
    if (!fs.existsSync(metaPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as WorkspaceMetaFile;
    } catch {
      return null;
    }
  }

  private touchWorkspace(workspacePath: string): void {
    const metaPath = path.join(workspacePath, ".workspace.json");
    if (!fs.existsSync(metaPath)) return;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as WorkspaceMetaFile & { updatedAt?: number };
      meta.updatedAt = Date.now();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    } catch {
      /* Ignore malformed workspace metadata; the file content was already saved. */
    }
  }

  private findJsonFile<T>(
    root: string,
    filename: string,
    predicate: (value: T) => boolean,
  ): T | null {
    const foundPath = this.findJsonPath(root, filename, predicate);
    if (!foundPath) return null;
    try {
      return JSON.parse(fs.readFileSync(foundPath, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  private findJsonPath<T>(
    root: string,
    filename: string,
    predicate: (value: T) => boolean,
  ): string | null {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        const nested = this.findJsonPath(entryPath, filename, predicate);
        if (nested) return nested;
      } else if (entry.isFile() && entry.name === filename) {
        try {
          const value = JSON.parse(fs.readFileSync(entryPath, "utf-8")) as T;
          if (predicate(value)) return entryPath;
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  private findDirectoryByName(root: string, dirname: string): string | null {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const entryPath = path.join(root, entry.name);
      if (entry.name === dirname) return entryPath;

      const nested = this.findDirectoryByName(entryPath, dirname);
      if (nested) return nested;
    }
    return null;
  }
}

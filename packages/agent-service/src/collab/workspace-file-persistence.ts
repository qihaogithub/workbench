import fs from "fs";
import crypto from "crypto";
import path from "path";

import type { CollabResourceKind } from "@workbench/shared/contracts";
import type {
  WorkspaceMutationCommittedEvent,
  WorkspaceMutationReceipt,
  WorkspaceMutationRequest,
  WorkspaceProjectionAck,
  WorkspaceProjectionAcknowledgedEvent,
} from "@workbench/shared/contracts";
import { WorkspaceMutationAuthority } from "../workspace/workspace-mutation-authority";

export interface SessionValidation {
  ok: boolean;
  reason?: string;
  userId?: string;
  username?: string;
  workspacePath?: string;
}

export interface ResourceFileState {
  content: string;
  hash: string;
  exists: boolean;
  mtimeMs: number;
  size: number;
}

export interface ResourceMutationResult {
  state: ResourceFileState;
  receipt: WorkspaceMutationReceipt;
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
  projectId?: string;
  userId?: string;
  ownerUserId?: string;
  scope?: "live" | "branch" | "snapshot-source" | "legacy";
  status?: "active" | "archived" | "committed" | "expired";
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

export function getDefaultDataDir(): string {
  return process.env.DATA_DIR ?? path.join(findProjectRoot(process.cwd()), "data");
}

export class WorkspaceFilePersistence {
  readonly dataDir: string;
  private readonly authority: WorkspaceMutationAuthority;

  constructor(dataDir = getDefaultDataDir()) {
    this.dataDir = dataDir;
    this.authority = new WorkspaceMutationAuthority({
      dataDir,
      resolveWorkspacePath: (workspaceId) => this.findWorkspacePath(workspaceId),
    });
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
    const workspaceProjectId = workspaceMeta?.projectId ?? workspaceMeta?.demoId;
    if (workspaceProjectId && workspaceProjectId !== input.projectId) {
      return { ok: false, reason: "WORKSPACE_PROJECT_MISMATCH" };
    }
    if (!workspaceProjectId) {
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
    return this.readResourceState(workspacePath, resourcePath, kind).content;
  }

  readResourceState(workspacePath: string, resourcePath: string, kind: CollabResourceKind): ResourceFileState {
    const filePath = this.resolveResourcePath(workspacePath, resourcePath, kind);
    if (!filePath || !fs.existsSync(filePath)) {
      return {
        content: "",
        hash: this.hashContent(""),
        exists: false,
        mtimeMs: 0,
        size: 0,
      };
    }
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    return {
      content,
      hash: this.hashContent(content),
      exists: true,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  }

  async commitResource(input: {
    projectId: string;
    workspaceId: string;
    resourcePath: string;
    kind: CollabResourceKind;
    content: string;
    expectedHash: string;
    baseRevision?: number;
    sessionId?: string;
  }): Promise<ResourceMutationResult> {
    const workspacePath = this.findWorkspacePath(input.workspaceId);
    if (!workspacePath || !this.resolveResourcePath(workspacePath, input.resourcePath, input.kind)) {
      throw new Error("INVALID_RESOURCE_PATH");
    }
    const receipt = await this.authority.mutate({
      mutationId: crypto.randomUUID(),
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      baseRevision: input.baseRevision ?? 0,
      actor: "collab",
      reason: "collab_autosave",
      operations: [{
        type: "put_text",
        path: input.resourcePath,
        content: input.content,
        expectedHash: input.expectedHash,
      }],
    });
    return { state: this.readResourceState(workspacePath, input.resourcePath, input.kind), receipt };
  }

  async getAuthorityState(input: { projectId: string; workspaceId: string; sessionId: string }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    return this.authority.getState(input.projectId, input.workspaceId);
  }

  async getAuthoritySnapshot(input: { projectId: string; workspaceId: string; sessionId: string }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    return this.authority.getSnapshot(input.projectId, input.workspaceId);
  }

  async getAuthorityResource(input: { projectId: string; workspaceId: string; sessionId: string; resourcePath: string }) {
    const snapshot = await this.getAuthoritySnapshot(input);
    const normalized = input.resourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.includes("\0") || normalized.split("/").includes("..")) {
      throw new Error("INVALID_REQUEST");
    }
    const content = snapshot.resources[normalized];
    const hash = snapshot.state.resourceHashes[normalized];
    if (content === undefined || !hash) throw new Error("WORKSPACE_RESOURCE_NOT_FOUND");
    return { path: normalized, content, hash, revision: snapshot.state.revision };
  }

  async getAuthorityEvents(input: { projectId: string; workspaceId: string; sessionId: string; afterRevision: number }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "WORKSPACE_MUTATION_FAILED");
    return this.authority.getCommittedEventsSince(input.projectId, input.workspaceId, input.afterRevision);
  }

  async getAuthorityProjectionAcks(input: { projectId: string; workspaceId: string; sessionId: string; afterRevision?: number }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "WORKSPACE_MUTATION_FAILED");
    return this.authority.getProjectionAcks(input.projectId, input.workspaceId, input.afterRevision);
  }

  getAuthorityHealth(input: { projectId: string; workspaceId: string; sessionId: string }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    return this.authority.getHealth(input.projectId, input.workspaceId);
  }

  async reconcileAuthorityAdopt(input: { projectId: string; workspaceId: string; sessionId: string }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    return this.authority.reconcileAdopt(input.projectId, input.workspaceId);
  }

  async reconcileAuthorityRestore(input: { projectId: string; workspaceId: string; sessionId: string }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    return this.authority.reconcileRestore(input.projectId, input.workspaceId);
  }

  async recordProjectionAck(ack: WorkspaceProjectionAck & { sessionId: string }) {
    const validation = this.validateWorkspaceSession(ack);
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    await this.authority.recordProjectionAck(ack);
  }

  async commitMutation(request: WorkspaceMutationRequest): Promise<WorkspaceMutationReceipt> {
    if (!request.sessionId) throw new Error("SESSION_NOT_FOUND");
    const validation = this.validateWorkspaceSession({
      projectId: request.projectId,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
    });
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    return this.authority.mutate(request);
  }

  async stageBinary(input: { projectId: string; workspaceId: string; sessionId: string; content: Buffer }) {
    const validation = this.validateWorkspaceSession(input);
    if (!validation.ok) throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    return this.authority.stageBinary(input.projectId, input.workspaceId, input.content);
  }

  onMutationCommitted(listener: (event: WorkspaceMutationCommittedEvent) => void): () => void {
    return this.authority.onCommitted(listener);
  }

  onProjectionAck(listener: (event: WorkspaceProjectionAcknowledgedEvent) => void): () => void {
    return this.authority.onProjectionAck(listener);
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
    if (kind === "page-prototype-html") return /^demos\/[^/]+\/prototype\.html$/.test(resourcePath);
    if (kind === "page-prototype-css") return /^demos\/[^/]+\/prototype\.css$/.test(resourcePath);
    if (kind === "page-schema") return /^demos\/[^/]+\/config\.schema\.json$/.test(resourcePath);
    if (kind === "page-sketch-scene") return /^demos\/[^/]+\/sketch\.scene\.json$/.test(resourcePath);
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

  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
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

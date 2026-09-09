import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  createWorkspaceResourceRegistry,
  hashWorkspaceContent,
  type WorkspaceRootManifest,
} from "@workbench/project-core/workspace-resource-registry";
import type { WorkspaceRecoveryRebuildResult } from "@workbench/shared/contracts";

export type { WorkspaceRecoveryRebuildResult } from "@workbench/shared/contracts";

import { WorkspaceMutationAuthority } from "./workspace-mutation-authority";

interface ProjectVersionRecord {
  versionId: string;
  savedAt?: number;
  savedBy?: string;
  sessionId?: string;
  snapshotPath?: string;
  fileCount?: number;
  workspaceId?: string;
  workspaceRevision?: number;
  workspaceRootHash?: string;
  note?: string;
  type?: string;
}

interface ProjectRecord {
  id: string;
  workspacePath?: string;
  activeWorkspaceId?: string;
  activeWorkspaceUpdatedAt?: number;
  canonicalSyncedWorkspaceId?: string;
  canonicalSyncedRevision?: number;
  canonicalSyncedRootHash?: string;
  canonicalSyncedAt?: number;
  demoPages?: unknown[];
  demoFolders?: unknown[];
  versions?: ProjectVersionRecord[];
  updatedAt?: number;
  [key: string]: unknown;
}

interface SessionRecord {
  sessionId?: string;
  demoId?: string;
  workspaceId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface WorkspaceRecoveryRebuildRequest {
  projectId: string;
  failedWorkspaceId: string;
  sourceVersionId: string;
  idempotencyKey: string;
  apply: boolean;
  actor: { userId: string; username: string };
}

export class WorkspaceRecoveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkspaceRecoveryError";
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(temporary, file);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function copyWorkspace(source: string, target: string): void {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(source, sourcePath);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      if (segments.some((segment) => ["node_modules", ".next", ".workbench", ".git"].includes(segment))) {
        return false;
      }
      return ![".workspace.json", ".session.json"].includes(path.basename(relative));
    },
  });
}

function listFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(directory);
  return files;
}

function manifestForDirectory(directory: string): WorkspaceRootManifest {
  const registry = createWorkspaceResourceRegistry();
  const resources: WorkspaceRootManifest["resources"] = [];
  for (const file of listFiles(directory)) {
    const relative = path.relative(directory, file).split(path.sep).join("/");
    const descriptor = registry.describe(relative);
    if (!descriptor) continue;
    const content = fs.readFileSync(file);
    resources.push({
      path: relative,
      kind: descriptor.kind,
      hash: hashWorkspaceContent(content),
      size: content.length,
    });
  }
  resources.sort((left, right) => left.path.localeCompare(right.path));
  const resourceHashes = Object.fromEntries(resources.map((entry) => [entry.path, entry.hash]));
  return {
    resources,
    resourceHashes,
    rootHash: hashWorkspaceContent(resources.map((entry) => `${entry.path}:${entry.hash}`).join("\n")),
  };
}

function compareManifests(current: WorkspaceRootManifest, source: WorkspaceRootManifest) {
  const currentPaths = new Set(Object.keys(current.resourceHashes));
  const sourcePaths = new Set(Object.keys(source.resourceHashes));
  return {
    currentResourceCount: current.resources.length,
    sourceResourceCount: source.resources.length,
    added: [...sourcePaths].filter((item) => !currentPaths.has(item)).sort(),
    removed: [...currentPaths].filter((item) => !sourcePaths.has(item)).sort(),
    changed: [...sourcePaths]
      .filter((item) => currentPaths.has(item) && current.resourceHashes[item] !== source.resourceHashes[item])
      .sort(),
  };
}

function nextVersionId(versions: ProjectVersionRecord[]): string {
  const maximum = versions.reduce((value, version) => {
    const match = /^v(\d+)$/.exec(version.versionId);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `v${maximum + 1}`;
}

function recoveryIdFor(request: WorkspaceRecoveryRebuildRequest): string {
  const digest = crypto.createHash("sha256").update([
    request.projectId,
    request.failedWorkspaceId,
    request.sourceVersionId,
    request.idempotencyKey,
  ].join(":"), "utf-8").digest("hex").slice(0, 20);
  return `recovery-${digest}`;
}

export class WorkspaceRecoveryCoordinator {
  constructor(
    private readonly dataDir: string,
    private readonly failpoint?: (
      phase: "after_capture" | "after_bootstrap" | "before_metadata_cas",
    ) => void,
  ) {}

  async rebuild(request: WorkspaceRecoveryRebuildRequest): Promise<WorkspaceRecoveryRebuildResult> {
    this.validateRequest(request);
    const projectFile = path.join(this.dataDir, "projects", request.projectId, "project.json");
    if (!fs.existsSync(projectFile)) {
      throw new WorkspaceRecoveryError("PROJECT_NOT_FOUND", "项目不存在");
    }
    const project = readJson<ProjectRecord>(projectFile);
    const recoveryId = recoveryIdFor(request);
    const priorJournalFile = path.join(
      this.dataDir,
      "workspace-recovery",
      recoveryId,
      "journal.json",
    );
    if (request.apply && fs.existsSync(priorJournalFile)) {
      const prior = readJson<{
        status?: string;
        result?: WorkspaceRecoveryRebuildResult;
      }>(priorJournalFile);
      if (prior.status === "completed" && prior.result) return prior.result;
    }
    if (project.activeWorkspaceId !== request.failedWorkspaceId) {
      throw new WorkspaceRecoveryError("WORKSPACE_MISMATCH", "故障 Workspace 已不是项目当前活动工作区");
    }
    const version = (project.versions ?? []).find((item) => item.versionId === request.sourceVersionId);
    if (!version) throw new WorkspaceRecoveryError("VERSION_NOT_FOUND", "恢复来源版本不存在");
    const sourcePath = version.snapshotPath ?? path.join(this.dataDir, "snapshots", request.projectId, request.sourceVersionId);
    if (!fs.existsSync(sourcePath)) {
      throw new WorkspaceRecoveryError("VERSION_SNAPSHOT_MISSING", "恢复来源版本快照不存在");
    }
    const sourceManifest = manifestForDirectory(sourcePath);
    if (!version.workspaceRootHash || version.workspaceRootHash !== sourceManifest.rootHash) {
      throw new WorkspaceRecoveryError(
        "VERSION_SNAPSHOT_UNTRUSTED",
        "版本快照与其 Workspace root proof 不一致",
        { expectedRootHash: version.workspaceRootHash, actualRootHash: sourceManifest.rootHash },
      );
    }
    const failedWorkspacePath = path.join(
      this.dataDir,
      "workspaces",
      "projects",
      request.projectId,
      request.failedWorkspaceId,
    );
    if (!fs.existsSync(failedWorkspacePath)) {
      throw new WorkspaceRecoveryError("WORKSPACE_NOT_FOUND", "故障 Workspace 不存在");
    }
    const currentManifest = manifestForDirectory(failedWorkspacePath);
    const baseResult: WorkspaceRecoveryRebuildResult = {
      applied: false,
      recoveryId,
      projectId: request.projectId,
      sourceVersionId: request.sourceVersionId,
      failedWorkspaceId: request.failedWorkspaceId,
      sourceRootHash: sourceManifest.rootHash,
      sourceResourceCount: sourceManifest.resources.length,
      diffSummary: compareManifests(currentManifest, sourceManifest),
      archivedSessionCount: 0,
    };
    if (!request.apply) return baseResult;
    return this.applyRebuild(request, project, version, sourcePath, sourceManifest, baseResult);
  }

  private async applyRebuild(
    request: WorkspaceRecoveryRebuildRequest,
    project: ProjectRecord,
    sourceVersion: ProjectVersionRecord,
    sourcePath: string,
    sourceManifest: WorkspaceRootManifest,
    baseResult: WorkspaceRecoveryRebuildResult,
  ): Promise<WorkspaceRecoveryRebuildResult> {
    const recoveryRoot = path.join(this.dataDir, "workspace-recovery", baseResult.recoveryId);
    const journalFile = path.join(recoveryRoot, "journal.json");
    if (fs.existsSync(journalFile)) {
      const existing = readJson<{ status?: string; result?: WorkspaceRecoveryRebuildResult }>(journalFile);
      if (existing.status === "completed" && existing.result) return existing.result;
      const latestProject = readJson<ProjectRecord>(path.join(this.dataDir, "projects", request.projectId, "project.json"));
      if (existing.status === "failed" && latestProject.activeWorkspaceId === request.failedWorkspaceId) {
        fs.renameSync(journalFile, path.join(recoveryRoot, `journal.failed-${Date.now()}.json`));
        fs.rmSync(path.join(recoveryRoot, "staging"), { recursive: true, force: true });
      } else {
        throw new WorkspaceRecoveryError("WORKSPACE_RECOVERY_IN_PROGRESS", "同一恢复请求已有未完成 journal，请先人工检查");
      }
    }
    const lockFile = path.join(this.dataDir, "workspace-recovery", "locks", `${request.projectId}.lock`);
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    try {
      fs.writeFileSync(lockFile, baseResult.recoveryId, { flag: "wx" });
    } catch {
      throw new WorkspaceRecoveryError("WORKSPACE_RECOVERY_LOCKED", "项目正在执行其他 Workspace 恢复");
    }

    const failedWorkspacePath = path.join(this.dataDir, "workspaces", "projects", request.projectId, request.failedWorkspaceId);
    const canonicalPath = path.join(this.dataDir, "projects", request.projectId, "workspace");
    const authorityPath = path.join(this.dataDir, "workspace-authority", request.failedWorkspaceId);
    const collabPath = path.join(this.dataDir, "collab-state", request.failedWorkspaceId);
    const newWorkspaceId = `live-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
    const liveRoot = path.dirname(failedWorkspacePath);
    const stagedCanonical = path.join(recoveryRoot, "staging", "canonical");
    const stagedLive = path.join(liveRoot, `.recovery-${baseResult.recoveryId}`);
    const finalLive = path.join(liveRoot, newWorkspaceId);
    const rollbackCanonical = path.join(recoveryRoot, "rollback-canonical");
    const now = Date.now();
    // Recovery appends this version during the same transaction. Binding the
    // rebuilt live workspace to the source version would make the first new
    // Session treat it as stale and replace it immediately.
    const recoveryVersionId = nextVersionId(project.versions ?? []);
    let metadataCommitted = false;

    try {
      fs.mkdirSync(recoveryRoot, { recursive: true });
      const authorityLease = path.join(
        this.dataDir,
        "workspace-authority",
        "leases",
        `${request.failedWorkspaceId}.lock`,
      );
      if (fs.existsSync(authorityLease)) {
        throw new WorkspaceRecoveryError(
          "WORKSPACE_WRITE_LEASE_UNAVAILABLE",
          "故障 Workspace 仍有写入正在进行",
        );
      }
      writeJsonAtomic(journalFile, { status: "capturing", request, startedAt: now });
      copyWorkspace(canonicalPath, path.join(recoveryRoot, "before", "project-workspace"));
      fs.cpSync(failedWorkspacePath, path.join(recoveryRoot, "before", "live-workspace"), { recursive: true });
      if (fs.existsSync(authorityPath)) fs.cpSync(authorityPath, path.join(recoveryRoot, "before", "authority"), { recursive: true });
      if (fs.existsSync(collabPath)) fs.cpSync(collabPath, path.join(recoveryRoot, "before", "collab-state"), { recursive: true });
      this.failpoint?.("after_capture");

      copyWorkspace(sourcePath, stagedCanonical);
      copyWorkspace(sourcePath, stagedLive);
      writeJsonAtomic(path.join(stagedLive, ".workspace.json"), {
        workspaceId: newWorkspaceId,
        demoId: request.projectId,
        projectId: request.projectId,
        userId: request.actor.userId,
        ownerUserId: request.actor.userId,
        scope: "live",
        status: "active",
        baseVersion: recoveryVersionId,
        createdAt: now,
        updatedAt: now,
      });

      const authority = new WorkspaceMutationAuthority({
        dataDir: this.dataDir,
        resolveWorkspacePath: (workspaceId) => workspaceId === newWorkspaceId ? stagedLive : null,
      });
      const state = await authority.bootstrap(request.projectId, newWorkspaceId);
      const health = authority.getHealth(request.projectId, newWorkspaceId);
      if (!health.ready || health.missingBackupCount !== 0 || health.stagingCount !== 0 || state.revision !== 1) {
        throw new WorkspaceRecoveryError("WORKSPACE_RECOVERY_PREFLIGHT_FAILED", "新 Workspace Authority preflight 未通过", { health });
      }
      this.failpoint?.("after_bootstrap");
      writeJsonAtomic(journalFile, { status: "prepared", request, newWorkspaceId, state, startedAt: now });

      fs.renameSync(canonicalPath, rollbackCanonical);
      try {
        fs.renameSync(stagedCanonical, canonicalPath);
      } catch (error) {
        fs.renameSync(rollbackCanonical, canonicalPath);
        throw error;
      }
      fs.renameSync(stagedLive, finalLive);
      const finalAuthority = new WorkspaceMutationAuthority({
        dataDir: this.dataDir,
        resolveWorkspacePath: (workspaceId) =>
          workspaceId === newWorkspaceId ? finalLive : null,
      });
      const finalHealth = finalAuthority.getHealth(
        request.projectId,
        newWorkspaceId,
      );
      if (
        !finalHealth.ready ||
        finalHealth.condition !== "healthy" ||
        finalHealth.externalDrift ||
        finalHealth.missingBackupCount !== 0 ||
        finalHealth.stagingCount !== 0
      ) {
        throw new WorkspaceRecoveryError(
          "WORKSPACE_RECOVERY_PREFLIGHT_FAILED",
          "新 Workspace 原子切换前的最终 health 未通过",
          { health: finalHealth },
        );
      }

      const workspaceTree = readJson<{ pages?: unknown[]; folders?: unknown[] }>(path.join(canonicalPath, "workspace-tree.json"));
      const recoverySnapshotPath = path.join(this.dataDir, "snapshots", request.projectId, recoveryVersionId);
      copyWorkspace(canonicalPath, recoverySnapshotPath);
      const recoveryVersion: ProjectVersionRecord = {
        versionId: recoveryVersionId,
        type: "restore_snapshot",
        savedAt: now,
        savedBy: request.actor.username,
        sessionId: `workspace-recovery:${baseResult.recoveryId}`,
        snapshotPath: recoverySnapshotPath,
        fileCount: listFiles(recoverySnapshotPath).length,
        workspaceId: newWorkspaceId,
        workspaceRevision: state.revision,
        workspaceRootHash: state.rootHash,
        note: `Workspace recovery 从 ${sourceVersion.versionId} 重建 (${baseResult.recoveryId})`,
      };
      const nextProject: ProjectRecord = {
        ...project,
        workspacePath: canonicalPath,
        activeWorkspaceId: newWorkspaceId,
        activeWorkspaceUpdatedAt: now,
        canonicalSyncedWorkspaceId: newWorkspaceId,
        canonicalSyncedRevision: state.revision,
        canonicalSyncedRootHash: state.rootHash,
        canonicalSyncedAt: now,
        demoPages: workspaceTree.pages ?? [],
        demoFolders: workspaceTree.folders ?? [],
        versions: [...(project.versions ?? []), recoveryVersion],
        updatedAt: now,
      };
      this.failpoint?.("before_metadata_cas");
      const latestProject = readJson<ProjectRecord>(
        path.join(this.dataDir, "projects", request.projectId, "project.json"),
      );
      if (
        latestProject.activeWorkspaceId !== request.failedWorkspaceId ||
        latestProject.updatedAt !== project.updatedAt ||
        latestProject.canonicalSyncedRevision !== project.canonicalSyncedRevision ||
        latestProject.canonicalSyncedRootHash !== project.canonicalSyncedRootHash
      ) {
        throw new WorkspaceRecoveryError(
          "WORKSPACE_RECOVERY_CAS_CONFLICT",
          "项目元数据在恢复期间已变更，未激活新 Workspace",
        );
      }
      writeJsonAtomic(path.join(this.dataDir, "projects", request.projectId, "project.json"), nextProject);
      metadataCommitted = true;

      const warnings: string[] = [];
      let archivedSessionCount = 0;
      try {
        archivedSessionCount = this.archiveSessions(request.projectId, request.failedWorkspaceId, now);
      } catch (error) {
        warnings.push(`旧 Session 归档未完全成功: ${error instanceof Error ? error.message : String(error)}`);
      }
      const failedMetaFile = path.join(failedWorkspacePath, ".workspace.json");
      if (fs.existsSync(failedMetaFile)) {
        try {
          const failedMeta = readJson<Record<string, unknown>>(failedMetaFile);
          writeJsonAtomic(failedMetaFile, { ...failedMeta, status: "archived", archivedAt: now, recoveryId: baseResult.recoveryId });
        } catch (error) {
          warnings.push(`旧 Workspace 归档标记写入失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const result: WorkspaceRecoveryRebuildResult = {
        ...baseResult,
        applied: true,
        newWorkspaceId,
        recoveryBundlePath: recoveryRoot,
        archivedSessionCount,
        ...(warnings.length > 0 ? { warnings } : {}),
        authority: {
          revision: state.revision,
          rootHash: state.rootHash,
          ready: health.ready,
          missingBackupCount: health.missingBackupCount,
          stagingCount: health.stagingCount,
        },
        finalHealth,
      };
      writeJsonAtomic(path.join(recoveryRoot, "manifest.json"), {
        recoveryId: baseResult.recoveryId,
        createdAt: now,
        sourceVersionId: request.sourceVersionId,
        sourceRootHash: sourceManifest.rootHash,
        failedWorkspaceId: request.failedWorkspaceId,
        newWorkspaceId,
        diffSummary: result.diffSummary,
      });
      writeJsonAtomic(journalFile, { status: "completed", result, completedAt: Date.now() });
      return result;
    } catch (error) {
      if (!metadataCommitted) {
        if (fs.existsSync(rollbackCanonical)) {
          if (fs.existsSync(canonicalPath)) {
            fs.renameSync(canonicalPath, path.join(recoveryRoot, `failed-canonical-${Date.now()}`));
          }
          fs.renameSync(rollbackCanonical, canonicalPath);
        }
        if (fs.existsSync(finalLive)) fs.rmSync(finalLive, { recursive: true, force: true });
        new WorkspaceMutationAuthority({ dataDir: this.dataDir, resolveWorkspacePath: () => null }).removeAuthority(newWorkspaceId);
      }
      if (fs.existsSync(stagedLive)) fs.rmSync(stagedLive, { recursive: true, force: true });
      fs.rmSync(path.join(recoveryRoot, "staging"), { recursive: true, force: true });
      writeJsonAtomic(journalFile, {
        status: "failed",
        request,
        failedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      try {
        if (fs.existsSync(lockFile) && fs.readFileSync(lockFile, "utf-8") === baseResult.recoveryId) {
          fs.rmSync(lockFile, { force: true });
        }
      } catch {
        // Keep a stale lock fail-closed for operator inspection.
      }
    }
  }

  private archiveSessions(projectId: string, workspaceId: string, archivedAt: number): number {
    const sessionsRoot = path.join(this.dataDir, "sessions");
    let count = 0;
    for (const file of listFiles(sessionsRoot).filter((item) => path.basename(item) === ".session.json")) {
      const session = readJson<SessionRecord>(file);
      if (session.demoId !== projectId || session.workspaceId !== workspaceId || session.status === "archived") continue;
      writeJsonAtomic(file, { ...session, status: "archived", archivedAt });
      count += 1;
    }
    return count;
  }

  private validateRequest(request: WorkspaceRecoveryRebuildRequest): void {
    if (!request.projectId || !request.failedWorkspaceId || !request.sourceVersionId || !request.idempotencyKey) {
      throw new WorkspaceRecoveryError("INVALID_REQUEST", "Workspace recovery 参数不完整");
    }
    if (request.idempotencyKey.length > 200) {
      throw new WorkspaceRecoveryError("INVALID_REQUEST", "idempotencyKey 过长");
    }
  }
}

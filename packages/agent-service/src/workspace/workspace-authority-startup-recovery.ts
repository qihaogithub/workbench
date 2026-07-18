import fs from "node:fs";
import path from "node:path";

import { logger } from "../utils/logger";
import { discoverLiveWorkspaces } from "./workspace-authority-migration";
import { WorkspaceMutationAuthority } from "./workspace-mutation-authority";

export interface WorkspaceAuthorityStartupRecoveryStatus {
  state: "pending" | "recovering" | "ready" | "failed";
  scannedWorkspaceCount: number;
  registeredWorkspaceCount: number;
  skippedUnregisteredCount: number;
  pendingTransactionCount: number;
  recoveredTransactionCount: number;
  rolledBackCount: number;
  committedCleanupCount: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

let currentStatus: WorkspaceAuthorityStartupRecoveryStatus = {
  state: "pending",
  scannedWorkspaceCount: 0,
  registeredWorkspaceCount: 0,
  skippedUnregisteredCount: 0,
  pendingTransactionCount: 0,
  recoveredTransactionCount: 0,
  rolledBackCount: 0,
  committedCleanupCount: 0,
};

export function getWorkspaceAuthorityStartupRecoveryStatus(): WorkspaceAuthorityStartupRecoveryStatus {
  return { ...currentStatus };
}

export async function recoverWorkspaceAuthoritiesOnStartup(dataDir: string): Promise<WorkspaceAuthorityStartupRecoveryStatus> {
  const resolvedDataDir = path.resolve(dataDir);
  currentStatus = {
    state: "recovering",
    scannedWorkspaceCount: 0,
    registeredWorkspaceCount: 0,
    skippedUnregisteredCount: 0,
    pendingTransactionCount: 0,
    recoveredTransactionCount: 0,
    rolledBackCount: 0,
    committedCleanupCount: 0,
    startedAt: Date.now(),
  };

  try {
    const workspaces = discoverLiveWorkspaces(resolvedDataDir);
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]));
    const authorityRoot = path.join(resolvedDataDir, "workspace-authority");
    const registeredWorkspaceIds = fs.existsSync(authorityRoot)
      ? fs.readdirSync(authorityRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "leases" && fs.existsSync(path.join(authorityRoot, entry.name, "state.json")))
        .map((entry) => entry.name)
        .sort()
      : [];
    currentStatus.scannedWorkspaceCount = workspaces.length;
    currentStatus.registeredWorkspaceCount = registeredWorkspaceIds.length;
    currentStatus.skippedUnregisteredCount = workspaces.filter((workspace) => !registeredWorkspaceIds.includes(workspace.workspaceId)).length;
    for (const workspaceId of registeredWorkspaceIds) {
      const workspace = workspaceById.get(workspaceId);
      if (!workspace) {
        logger.warn({ workspaceId }, "Skipping recovery: workspace data not found, authority entry may be stale");
        currentStatus.skippedUnregisteredCount++;
        continue;
      }
      const authority = new WorkspaceMutationAuthority({
        dataDir: resolvedDataDir,
        resolveWorkspacePath: (workspaceId) => workspaceId === workspace.workspaceId ? workspace.workspacePath : null,
      });
      const health = authority.getHealth(workspace.projectId, workspace.workspaceId);
      currentStatus.pendingTransactionCount += health.recoveryPendingCount;
      const result = await authority.recover(workspace.projectId, workspace.workspaceId);
      currentStatus.recoveredTransactionCount += result.recoveredCount;
      currentStatus.rolledBackCount += result.rolledBackCount;
      currentStatus.committedCleanupCount += result.committedCleanupCount;
    }
    currentStatus = { ...currentStatus, state: "ready", completedAt: Date.now() };
    return getWorkspaceAuthorityStartupRecoveryStatus();
  } catch (error) {
    currentStatus = {
      ...currentStatus,
      state: "failed",
      completedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  }
}

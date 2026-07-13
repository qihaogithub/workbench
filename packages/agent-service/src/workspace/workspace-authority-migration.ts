import fs from "node:fs";
import path from "node:path";

import { WorkspaceMutationAuthority } from "./workspace-mutation-authority";

export interface WorkspaceAuthorityMigrationOptions {
  dataDir: string;
  projectId?: string;
  workspaceId?: string;
  all?: boolean;
  apply: boolean;
}

export interface WorkspaceAuthorityMigrationItem {
  projectId: string;
  workspaceId: string;
  workspacePath: string;
  action:
    | "would_bootstrap"
    | "bootstrapped"
    | "would_repair_backups"
    | "backups_repaired"
    | "already_bootstrapped"
    | "blocked";
  applied: boolean;
  issues: string[];
  revision?: number;
  rootHash?: string;
}

export interface LiveWorkspace {
  projectId: string;
  workspaceId: string;
  workspacePath: string;
}

export function discoverLiveWorkspaces(dataDir: string): LiveWorkspace[] {
  const workspaces: LiveWorkspace[] = [];
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name === ".workspace.json") {
        const metadata = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as {
          scope?: string;
          projectId?: string;
          demoId?: string;
          workspaceId?: string;
        };
        const projectId = metadata.projectId ?? metadata.demoId;
        if (metadata.scope === "live" && projectId && metadata.workspaceId) {
          workspaces.push({ projectId, workspaceId: metadata.workspaceId, workspacePath: path.dirname(fullPath) });
        }
      }
    }
  };
  visit(path.join(dataDir, "workspaces"));
  return workspaces.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
}

function validateSelector(options: WorkspaceAuthorityMigrationOptions): void {
  const selectorCount = Number(Boolean(options.projectId)) + Number(Boolean(options.workspaceId)) + Number(Boolean(options.all));
  if (selectorCount !== 1) {
    throw new Error("Exactly one of projectId, workspaceId or all is required");
  }
}

export async function migrateWorkspaceAuthorities(options: WorkspaceAuthorityMigrationOptions): Promise<{
  success: boolean;
  applied: boolean;
  selector: { projectId?: string; workspaceId?: string; all?: boolean };
  summary: { matched: number; changed: number; blocked: number };
  items: WorkspaceAuthorityMigrationItem[];
}> {
  validateSelector(options);
  const dataDir = path.resolve(options.dataDir);
  const selected = discoverLiveWorkspaces(dataDir).filter((workspace) => (
    options.all || workspace.projectId === options.projectId || workspace.workspaceId === options.workspaceId
  ));
  const items: WorkspaceAuthorityMigrationItem[] = [];

  for (const workspace of selected) {
    const authority = new WorkspaceMutationAuthority({
      dataDir,
      resolveWorkspacePath: (workspaceId) => workspaceId === workspace.workspaceId ? workspace.workspacePath : null,
    });
    const health = authority.getHealth(workspace.projectId, workspace.workspaceId);
    const issues: string[] = [];
    if (health.activeLease) issues.push("active or stale write lease exists");
    if (health.preparedCount > 0) issues.push("prepared transactions need recovery");
    if (health.stateExists && health.externalDrift) issues.push("external drift requires explicit adopt or restore");
    if (issues.length > 0) {
      items.push({ ...workspace, action: "blocked", applied: false, issues, revision: health.revision, rootHash: health.rootHash });
      continue;
    }

    const needsBootstrap = !health.stateExists;
    const needsBackupRepair = health.stateExists && health.missingBackupCount > 0;
    if (!needsBootstrap && !needsBackupRepair) {
      items.push({ ...workspace, action: "already_bootstrapped", applied: false, issues: [], revision: health.revision, rootHash: health.rootHash });
      continue;
    }
    if (!options.apply) {
      items.push({
        ...workspace,
        action: needsBootstrap ? "would_bootstrap" : "would_repair_backups",
        applied: false,
        issues: [],
        revision: health.revision,
        rootHash: health.rootHash,
      });
      continue;
    }

    const state = await authority.bootstrap(workspace.projectId, workspace.workspaceId);
    items.push({
      ...workspace,
      action: needsBootstrap ? "bootstrapped" : "backups_repaired",
      applied: true,
      issues: [],
      revision: state.revision,
      rootHash: state.rootHash,
    });
  }

  const blocked = items.filter((item) => item.action === "blocked").length;
  return {
    success: blocked === 0 && selected.length > 0,
    applied: options.apply,
    selector: { projectId: options.projectId, workspaceId: options.workspaceId, all: options.all },
    summary: {
      matched: selected.length,
      changed: items.filter((item) => item.applied).length,
      blocked,
    },
    items,
  };
}

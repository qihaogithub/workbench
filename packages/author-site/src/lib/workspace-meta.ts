import path from "path";
import fs from "fs";
import type { DemoFiles } from "@workbench/shared";
import { WORKSPACES_DIR } from "./paths";

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
    const projectDirs = fs.readdirSync(
      path.join(WORKSPACES_DIR, userDir.name),
      { withFileTypes: true },
    );
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const wsPath = path.join(
        WORKSPACES_DIR,
        userDir.name,
        projectDir.name,
        workspaceId,
      );
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
  projectId?: string;
  userId?: string;
  ownerUserId?: string;
  scope?: "live" | "branch" | "snapshot-source" | "legacy";
  baseVersion?: string;
  status?: "active" | "archived" | "committed" | "expired";
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

export function writeWorkspaceMeta(
  workspaceId: string,
  meta: WorkspaceMeta,
): void {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return;

  fs.writeFileSync(
    path.join(wsPath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
}

export function markWorkspaceBasedOnVersion(
  workspaceId: string,
  baseVersion: string,
): boolean {
  const meta = getWorkspaceMeta(workspaceId);
  if (!meta) return false;

  writeWorkspaceMeta(workspaceId, {
    ...meta,
    baseVersion,
    updatedAt: Date.now(),
  });
  return true;
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

export function updateWorkspaceFiles(
  workspaceId: string,
  files: DemoFiles,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  fs.writeFileSync(path.join(wsPath, "index.tsx"), files.code, "utf-8");
  fs.writeFileSync(
    path.join(wsPath, "config.schema.json"),
    files.schema,
    "utf-8",
  );
  return true;
}

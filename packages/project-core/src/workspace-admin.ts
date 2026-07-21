import fs from "node:fs";
import path from "node:path";

interface JsonRecord {
  [key: string]: unknown;
}

export interface WorkspaceAdminEntry {
  workspaceId: string;
  projectId: string;
  path: string;
  scope: "canonical" | "live" | "branch" | "snapshot-source" | "legacy";
  status?: string;
  baseVersion?: string;
  updatedAt?: number;
  relation: "canonical" | "active" | "canonical-synced" | "unreferenced";
  activeSessionIds: string[];
}

export interface WorkspaceCleanCandidate {
  workspaceId: string;
  path: string;
  reason: "orphaned" | "expired";
  updatedAt?: number;
}

function readJson(filePath: string): JsonRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as JsonRecord;
  } catch {
    return null;
  }
}

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  return files;
}

function stringField(record: JsonRecord | null, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record?.[key] === "string") return record[key] as string;
  }
  return undefined;
}

function numberField(record: JsonRecord | null, ...keys: string[]): number | undefined {
  for (const key of keys) {
    if (typeof record?.[key] === "number") return record[key] as number;
  }
  return undefined;
}

function activeSessionsByWorkspace(dataDir: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const now = Date.now();
  for (const file of walkFiles(path.join(dataDir, "sessions"))) {
    if (!file.endsWith(".session.json")) continue;
    const session = readJson(file);
    const workspaceId = stringField(session, "workspaceId");
    const sessionId = stringField(session, "sessionId", "id");
    const status = stringField(session, "status");
    const expiresAt = numberField(session, "expiresAt");
    if (
      !workspaceId ||
      !sessionId ||
      status === "closed" ||
      status === "expired" ||
      (expiresAt !== undefined && expiresAt <= now)
    ) {
      continue;
    }
    result.set(workspaceId, [...(result.get(workspaceId) ?? []), sessionId]);
  }
  return result;
}

export function listProjectWorkspaces(
  dataDir: string,
  projectId: string,
): WorkspaceAdminEntry[] {
  const projectDir = path.join(dataDir, "projects", path.basename(projectId));
  const project = readJson(path.join(projectDir, "project.json"));
  if (!project || stringField(project, "id") !== projectId) return [];
  const activeWorkspaceId = stringField(project, "activeWorkspaceId");
  const canonicalSyncedWorkspaceId = stringField(
    project,
    "canonicalSyncedWorkspaceId",
  );
  const activeSessions = activeSessionsByWorkspace(dataDir);
  const entries: WorkspaceAdminEntry[] = [];
  const canonicalPath = path.join(projectDir, "workspace");
  if (fs.existsSync(canonicalPath)) {
    entries.push({
      workspaceId: `canonical:${projectId}`,
      projectId,
      path: canonicalPath,
      scope: "canonical",
      relation: "canonical",
      activeSessionIds: [],
      updatedAt: fs.statSync(canonicalPath).mtimeMs,
    });
  }

  for (const file of walkFiles(path.join(dataDir, "workspaces"))) {
    if (!file.endsWith(".workspace.json")) continue;
    const metadata = readJson(file);
    const metadataProjectId = stringField(metadata, "projectId", "demoId");
    if (metadataProjectId !== projectId) continue;
    const workspacePath = path.dirname(file);
    const workspaceId =
      stringField(metadata, "workspaceId", "id") ?? path.basename(workspacePath);
    const scope = stringField(metadata, "scope");
    entries.push({
      workspaceId,
      projectId,
      path: workspacePath,
      scope:
        scope === "live" ||
        scope === "branch" ||
        scope === "snapshot-source" ||
        scope === "legacy"
          ? scope
          : "legacy",
      status: stringField(metadata, "status"),
      baseVersion: stringField(metadata, "baseVersion"),
      updatedAt:
        numberField(metadata, "updatedAt") ?? fs.statSync(workspacePath).mtimeMs,
      relation:
        workspaceId === activeWorkspaceId
          ? "active"
          : workspaceId === canonicalSyncedWorkspaceId
            ? "canonical-synced"
            : "unreferenced",
      activeSessionIds: activeSessions.get(workspaceId) ?? [],
    });
  }
  return entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function cleanProjectWorkspaces(
  dataDir: string,
  projectId: string,
  options: { force?: boolean; includeExpired?: boolean; maxAgeMs?: number } = {},
) {
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;
  const candidates: WorkspaceCleanCandidate[] = listProjectWorkspaces(
    dataDir,
    projectId,
  )
    .filter(
      (entry) =>
        entry.scope !== "canonical" &&
        entry.relation === "unreferenced" &&
        entry.activeSessionIds.length === 0,
    )
    .map((entry) => ({
      workspaceId: entry.workspaceId,
      path: entry.path,
      reason:
        entry.updatedAt !== undefined && entry.updatedAt < cutoff
          ? "expired"
          : "orphaned",
      updatedAt: entry.updatedAt,
    }));
  const eligible = candidates.filter(
    (candidate) => candidate.reason === "orphaned" || options.includeExpired,
  );
  const removed: WorkspaceCleanCandidate[] = [];
  if (options.force) {
    for (const candidate of eligible) {
      fs.rmSync(candidate.path, { recursive: true, force: true });
      removed.push(candidate);
    }
  }
  return {
    projectId,
    dryRun: !options.force,
    candidates,
    removed,
  };
}

export function fixProjectWorkspaceReferences(
  dataDir: string,
  projectId: string,
  options: { force?: boolean } = {},
) {
  const projectPath = path.join(
    dataDir,
    "projects",
    path.basename(projectId),
    "project.json",
  );
  const project = readJson(projectPath);
  if (!project || stringField(project, "id") !== projectId) return null;
  const workspaces = listProjectWorkspaces(dataDir, projectId);
  const workspaceIds = new Set(
    workspaces
      .filter((entry) => entry.scope !== "canonical")
      .map((entry) => entry.workspaceId),
  );
  const activeWorkspaceId = stringField(project, "activeWorkspaceId");
  const issues: Array<{ code: string; message: string; fixable: boolean }> = [];
  const fixed: string[] = [];
  if (activeWorkspaceId && !workspaceIds.has(activeWorkspaceId)) {
    issues.push({
      code: "ACTIVE_WORKSPACE_MISSING",
      message: `activeWorkspaceId 指向不存在的 workspace: ${activeWorkspaceId}`,
      fixable: true,
    });
    if (options.force) {
      delete project.activeWorkspaceId;
      delete project.activeWorkspaceUpdatedAt;
      fixed.push("activeWorkspaceId", "activeWorkspaceUpdatedAt");
    }
  }
  const canonicalSyncedWorkspaceId = stringField(
    project,
    "canonicalSyncedWorkspaceId",
  );
  if (
    canonicalSyncedWorkspaceId &&
    canonicalSyncedWorkspaceId !== activeWorkspaceId
  ) {
    issues.push({
      code: "CANONICAL_SYNC_PROOF_MISMATCH",
      message: "canonicalSyncedWorkspaceId 与 activeWorkspaceId 不一致，仅报告不自动修改",
      fixable: false,
    });
  }
  const contentState = readJson(
    path.join(dataDir, "projects", projectId, "content", "state.json"),
  );
  const materializationStatus = stringField(contentState, "materializationStatus");
  if (
    (materializationStatus === "pending" || materializationStatus === "failed") &&
    stringField(contentState, "headCommitId")
  ) {
    issues.push({
      code: "CONTENT_GRAPH_MATERIALIZATION_REQUIRED",
      message: `内容图物化状态为 ${materializationStatus}，请运行 ow project materialize ${projectId}`,
      fixable: false,
    });
  }
  if (options.force && fixed.length > 0) {
    project.updatedAt = Date.now();
    fs.writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf-8");
  }
  return { projectId, dryRun: !options.force, issues, fixed };
}

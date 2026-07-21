import fs from "node:fs";
import path from "node:path";

import type { ProjectContentState } from "@workbench/shared/contracts";

function readState(filePath: string): ProjectContentState | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectContentState;
  } catch {
    return null;
  }
}

export function readContentGraphAdminStatus(dataDir: string, projectId: string) {
  const contentDir = path.join(dataDir, "projects", projectId, "content");
  const state = readState(path.join(contentDir, "state.json"));
  const commitsDir = path.join(contentDir, "commits");
  const commitCount = fs.existsSync(commitsDir)
    ? fs.readdirSync(commitsDir).filter((file) => file.endsWith(".json")).length
    : 0;
  return {
    projectId,
    exists: fs.existsSync(contentDir),
    headCommitId: state?.headCommitId,
    materializedCommitId: state?.materializedCommitId,
    materializationStatus: state?.materializationStatus,
    pending:
      Boolean(state?.headCommitId) &&
      (state?.materializationStatus !== "ready" ||
        state.materializedCommitId !== state.headCommitId),
    commitCount,
    updatedAt: state?.updatedAt,
  };
}

export function backupAndResetContentGraphStorage(
  dataDir: string,
  projectId: string,
): { contentDir: string; backupPath?: string } {
  const contentDir = path.join(dataDir, "projects", projectId, "content");
  let backupPath: string | undefined;
  if (fs.existsSync(contentDir)) {
    backupPath = path.join(
      dataDir,
      "snapshots",
      projectId,
      `content-backup-${Date.now()}`,
    );
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.renameSync(contentDir, backupPath);
  }
  fs.mkdirSync(contentDir, { recursive: true });
  return { contentDir, backupPath };
}

export function restoreContentGraphStorage(
  contentDir: string,
  backupPath?: string,
): void {
  fs.rmSync(contentDir, { recursive: true, force: true });
  if (backupPath && fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, contentDir);
  }
}

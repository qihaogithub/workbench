import fs from "node:fs";
import path from "node:path";

import {
  pruneJsonlFile,
  removeEmptyParentDirectories,
  type JsonlRetentionResult,
} from "../utils/jsonl-retention";
import {
  pruneWorkspaceAuthorityOperationalLogs,
  type WorkspaceAuthorityOperationalLogRetentionResult,
} from "../workspace/workspace-mutation-authority";

export const RUNTIME_LOG_RETENTION_DAYS = 3;
export const RUNTIME_LOG_RETENTION_INTERVAL_MS = 30 * 60 * 1000;

export interface RuntimeLogRetentionResult {
  cutoffAt: number;
  runLogFilesScanned: number;
  runLogFilesChanged: number;
  runLogLinesRemoved: number;
  diagnosticLinesRemoved: number;
  authority: WorkspaceAuthorityOperationalLogRetentionResult[];
}

function getRunLogRoot(dataDir: string): string {
  return process.env.AGENT_RUN_LOG_DIR || path.join(dataDir, "agent-run-logs");
}

function isProtectedDataPath(dataDir: string, target: string): boolean {
  const resolvedTarget = path.resolve(target);
  return [
    "projects",
    "workspaces",
    "collab-state",
    "sessions",
    "screenshots",
    "preview-modules",
    "audit",
  ].some((name) => {
    const protectedRoot = path.resolve(dataDir, name);
    return (
      resolvedTarget === protectedRoot ||
      resolvedTarget.startsWith(`${protectedRoot}${path.sep}`)
    );
  });
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.promises
      .readdir(directory, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(filePath);
      }
    }
  };
  await visit(root);
  return files;
}

async function pruneRunLogFile(
  filePath: string,
  cutoffAt: number,
  root: string,
): Promise<JsonlRetentionResult> {
  const result = await pruneJsonlFile(filePath, cutoffAt, ["timestamp"]);
  if (result.removedFile)
    removeEmptyParentDirectories(path.dirname(filePath), root);
  return result;
}

async function performCleanup(
  dataDir: string,
  now: number,
): Promise<RuntimeLogRetentionResult> {
  const cutoffAt = now - RUNTIME_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const runLogRoot = getRunLogRoot(dataDir);
  const runLogFiles = isProtectedDataPath(dataDir, runLogRoot)
    ? []
    : await listJsonlFiles(runLogRoot);
  let runLogFilesChanged = 0;
  let runLogLinesRemoved = 0;
  for (const filePath of runLogFiles) {
    const result = await pruneRunLogFile(filePath, cutoffAt, runLogRoot);
    if (result.removedLines > 0) runLogFilesChanged += 1;
    runLogLinesRemoved += result.removedLines;
  }

  const diagnosticPath = path.join(
    dataDir,
    "editor-diagnostics",
    "agent-service.jsonl",
  );
  const diagnosticResult = await pruneJsonlFile(diagnosticPath, cutoffAt, [
    "ts",
    "timestamp",
  ]);
  const authority = await pruneWorkspaceAuthorityOperationalLogs(
    dataDir,
    cutoffAt,
  );
  return {
    cutoffAt,
    runLogFilesScanned: runLogFiles.length,
    runLogFilesChanged,
    runLogLinesRemoved,
    diagnosticLinesRemoved: diagnosticResult.removedLines,
    authority,
  };
}

let cleanupInFlight: Promise<RuntimeLogRetentionResult> | null = null;

/** Run retention once; overlapping startup/timer calls share the same pass. */
export function cleanupAgentRuntimeLogs(
  dataDir: string,
  now = Date.now(),
): Promise<RuntimeLogRetentionResult> {
  if (cleanupInFlight) return cleanupInFlight;
  cleanupInFlight = performCleanup(path.resolve(dataDir), now).finally(() => {
    cleanupInFlight = null;
  });
  return cleanupInFlight;
}

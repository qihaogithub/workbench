import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

import { getDataDir } from "@/lib/fs-utils";

export const EDITOR_DIAGNOSTICS_RETENTION_DAYS = 3;

export interface EditorDiagnosticsRetentionResult {
  cutoffAt: number;
  sqliteRowsRemoved: number;
  fallbackFilesScanned: number;
  fallbackLinesRemoved: number;
  warnings: string[];
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getDiagnosticsDir(dataDir: string): string {
  return path.join(dataDir, "editor-diagnostics");
}

function getDiagnosticsDbPath(dataDir: string): string {
  return path.join(dataDir, "diagnostics", "editor-events.db");
}

async function pruneFallbackFile(
  filePath: string,
  cutoffAt: number,
): Promise<number> {
  const content = await fs.promises
    .readFile(filePath, "utf8")
    .catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
  if (content === null) return 0;

  const kept: string[] = [];
  let removed = 0;
  for (const line of content.split("\n")) {
    if (line.length === 0) continue;
    let timestamp: number | null = null;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      timestamp = parseTimestamp(parsed.ts ?? parsed.timestamp);
    } catch {
      // Keep malformed lines for later diagnosis.
    }
    if (timestamp !== null && timestamp < cutoffAt) {
      removed += 1;
    } else {
      kept.push(line);
    }
  }
  if (removed === 0) return 0;
  if (kept.length === 0) {
    await fs.promises.unlink(filePath).catch(() => undefined);
  } else {
    await fs.promises.writeFile(filePath, `${kept.join("\n")}\n`, "utf8");
  }
  return removed;
}

function pruneSqliteRows(
  dataDir: string,
  cutoffIso: string,
): { removed: number; warning?: string } {
  const dbPath = getDiagnosticsDbPath(dataDir);
  if (!fs.existsSync(dbPath)) return { removed: 0 };

  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath);
    db.pragma("busy_timeout = 5000");
    const result = db
      .prepare("DELETE FROM editor_events WHERE ts < ?")
      .run(cutoffIso);
    if (result.changes > 0) {
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
        db.exec("VACUUM");
      } catch (error) {
        return {
          removed: result.changes,
          warning: `SQLite 诊断库已删除过期行，但压缩失败: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    return { removed: result.changes };
  } catch (error) {
    return {
      removed: 0,
      warning: `SQLite 诊断库清理失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    db?.close();
  }
}

/**
 * Keep only the rolling three-day diagnostics window. This function handles
 * the author-owned SQLite database and frontend fallback files; the shared
 * agent-service JSONL spool is pruned by agent-service itself.
 */
export async function cleanupEditorDiagnosticsRetention(
  dataDir = getDataDir(),
  now = Date.now(),
): Promise<EditorDiagnosticsRetentionResult> {
  const cutoffAt =
    now - EDITOR_DIAGNOSTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const warnings: string[] = [];
  const sqlite = pruneSqliteRows(dataDir, new Date(cutoffAt).toISOString());
  if (sqlite.warning) warnings.push(sqlite.warning);

  const diagnosticsDir = getDiagnosticsDir(dataDir);
  const entries = await fs.promises
    .readdir(diagnosticsDir, { withFileTypes: true })
    .catch(() => []);
  const fallbackFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".jsonl") &&
      entry.name !== "agent-service.jsonl",
  );
  let fallbackLinesRemoved = 0;
  for (const entry of fallbackFiles) {
    fallbackLinesRemoved += await pruneFallbackFile(
      path.join(diagnosticsDir, entry.name),
      cutoffAt,
    );
  }

  return {
    cutoffAt,
    sqliteRowsRemoved: sqlite.removed,
    fallbackFilesScanned: fallbackFiles.length,
    fallbackLinesRemoved,
    warnings,
  };
}

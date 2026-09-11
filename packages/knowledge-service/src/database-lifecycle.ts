import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

export interface DatabaseIntegrityReport {
  ok: boolean;
  quickCheck: string[];
  integrityCheck: string[];
}

export interface DatabaseRecoveryRecord {
  recoveredAt: string;
  databasePath: string;
  quarantinePath: string;
  movedFiles: string[];
  integrity: DatabaseIntegrityReport | null;
  error: string | null;
}

export function inspectDatabaseIntegrity(databasePath: string): DatabaseIntegrityReport {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 5_000 });
  try {
    const quickCheck = pragmaValues(db, "quick_check");
    const integrityCheck = pragmaValues(db, "integrity_check");
    return {
      ok: quickCheck.length === 1 && quickCheck[0] === "ok"
        && integrityCheck.length === 1 && integrityCheck[0] === "ok",
      quickCheck,
      integrityCheck,
    };
  } finally {
    db.close();
  }
}

export function prepareKnowledgeDatabase(input: {
  dataDir: string;
  databasePath?: string;
}): DatabaseRecoveryRecord | null {
  const knowledgeDir = path.join(input.dataDir, "knowledge");
  fs.mkdirSync(knowledgeDir, { recursive: true });
  const databasePath = input.databasePath ?? path.join(knowledgeDir, "knowledge.db");
  if (!fs.existsSync(databasePath)) return null;

  let integrity: DatabaseIntegrityReport | null = null;
  let error: string | null = null;
  if (!hasSqliteHeader(databasePath)) {
    error = "SQLITE_NOTADB: invalid database header";
  } else {
    try {
      integrity = inspectDatabaseIntegrity(databasePath);
      if (integrity.ok) return null;
    } catch (cause) {
      if (!isCorruptDatabaseError(cause)) throw cause;
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  const recoveredAt = new Date().toISOString();
  const directoryName = `${recoveredAt.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  const quarantinePath = path.join(knowledgeDir, "quarantine", directoryName);
  fs.mkdirSync(quarantinePath, { recursive: true });
  const movedFiles: string[] = [];
  for (const sourcePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (!fs.existsSync(sourcePath)) continue;
    const destinationPath = path.join(quarantinePath, path.basename(sourcePath));
    fs.renameSync(sourcePath, destinationPath);
    movedFiles.push(destinationPath);
  }
  const record: DatabaseRecoveryRecord = {
    recoveredAt,
    databasePath,
    quarantinePath,
    movedFiles,
    integrity,
    error,
  };
  fs.writeFileSync(path.join(quarantinePath, "recovery.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

export function readLatestKnowledgeDatabaseRecovery(dataDir: string): DatabaseRecoveryRecord | null {
  const quarantineRoot = path.join(dataDir, "knowledge", "quarantine");
  if (!fs.existsSync(quarantineRoot)) return null;
  const candidates = fs.readdirSync(quarantineRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(quarantineRoot, entry.name, "recovery.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .sort()
    .reverse();
  for (const filePath of candidates) {
    try {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as DatabaseRecoveryRecord;
      if (typeof value.recoveredAt === "string" && typeof value.quarantinePath === "string" && Array.isArray(value.movedFiles)) {
        return value;
      }
    } catch {
      // Ignore incomplete diagnostic records and continue to the next one.
    }
  }
  return null;
}

function pragmaValues(db: Database.Database, pragma: "quick_check" | "integrity_check"): string[] {
  return (db.prepare(`PRAGMA ${pragma}`).all() as Array<Record<string, unknown>>)
    .flatMap((row) => Object.values(row))
    .filter((value): value is string => typeof value === "string");
}

function isCorruptDatabaseError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "SQLITE_CORRUPT" || code === "SQLITE_NOTADB"
    || /malformed|not a database|database disk image is malformed/i.test(message);
}

function hasSqliteHeader(databasePath: string): boolean {
  const descriptor = fs.openSync(databasePath, "r");
  try {
    const header = Buffer.alloc(16);
    return fs.readSync(descriptor, header, 0, header.length, 0) === header.length
      && header.toString("binary") === "SQLite format 3\0";
  } finally {
    fs.closeSync(descriptor);
  }
}

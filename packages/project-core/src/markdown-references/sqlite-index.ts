import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { InMemoryMarkdownReferenceIndex, type MarkdownReferenceIndexScope, type RebuildMarkdownReferenceIndexInput } from "./link-index.js";
import type {
  MarkdownIndexStatus,
  MarkdownLinkIndexSnapshot,
  MarkdownLinkRecord,
  MarkdownReferenceSource,
  MarkdownReferenceTarget,
} from "./types.js";

const DEFAULT_PARSER_VERSION = "markdown-reference-v1";

export interface SqliteMarkdownReferenceIndexOptions {
  /** The database is a derived cache and must live outside any workspace. */
  dataDir?: string;
  dbPath?: string;
  now?: () => number;
}

export interface MarkdownReferenceIndexStatus {
  status: MarkdownIndexStatus;
  snapshot: MarkdownLinkIndexSnapshot | null;
}

export interface IncrementalMarkdownReferenceIndexInput extends RebuildMarkdownReferenceIndexInput {
  /** Only sources in this list are replaced; other edges stay in the active generation. */
  replaceSources?: readonly MarkdownReferenceSource[];
}

/**
 * Durable derived index for outgoing links and backlinks.
 *
 * Rebuilds are written to a new generation and switched under one SQLite
 * transaction. Markdown and workspace files are never modified by this class.
 */
export class SqliteMarkdownReferenceIndex {
  readonly dbPath: string;
  private readonly now: () => number;
  private readonly db: Database.Database;

  constructor(options: SqliteMarkdownReferenceIndexOptions = {}) {
    this.now = options.now ?? Date.now;
    this.dbPath = path.resolve(options.dbPath ?? path.join(options.dataDir ?? defaultDataDir(), "derived", "markdown-links.sqlite"));
    this.db = openDatabase(this.dbPath);
  }

  close(): void {
    this.db.close();
  }

  rebuild(input: RebuildMarkdownReferenceIndexInput): MarkdownLinkIndexSnapshot {
    const memory = buildMemorySnapshot(input);
    const projectId = input.projectId ?? memory.projectId ?? inferProjectId(input.documents);
    if (!projectId) throw new Error("MARKDOWN_REFERENCE_PROJECT_REQUIRED");
    const snapshot: MarkdownLinkIndexSnapshot = {
      ...memory,
      projectId,
      workspaceId: input.workspaceId,
      authorityMutationId: input.authorityMutationId,
      authorityRevision: input.authorityRevision,
      authorityRootHash: input.authorityRootHash,
      generatedAt: this.now(),
      parserVersion: input.parserVersion ?? DEFAULT_PARSER_VERSION,
    };
    const current = this.snapshot({ projectId, workspaceId: input.workspaceId });
    if (isOlderVersion(snapshot, current)) return current!;
    this.commitGeneration(snapshot);
    return snapshot;
  }

  /**
   * Replace only the supplied source documents while preserving the other
   * edges in the active generation. If no generation exists this is a full
   * rebuild, making projector retries safe and idempotent.
   */
  updateSources(input: IncrementalMarkdownReferenceIndexInput): MarkdownLinkIndexSnapshot {
    const projectId = input.projectId ?? inferProjectId(input.documents);
    if (!projectId) throw new Error("MARKDOWN_REFERENCE_PROJECT_REQUIRED");
    const scope = { projectId, workspaceId: input.workspaceId };
    const current = this.snapshot(scope);
    if (!current) return this.rebuild(input);
    if (isIncomingReceiptOlder(input, current)) return current;

    const memory = buildMemorySnapshot(input);
    const replace = new Set((input.replaceSources ?? input.documents.map((document) => document.source)).map(sourceKey));
    const records = current.records.filter((record) => !replace.has(sourceKey(record.source))).concat(memory.records);
    const snapshot: MarkdownLinkIndexSnapshot = {
      ...current,
      projectId,
      workspaceId: input.workspaceId,
      authorityMutationId: input.authorityMutationId ?? current.authorityMutationId,
      authorityRevision: input.authorityRevision ?? current.authorityRevision,
      authorityRootHash: input.authorityRootHash ?? current.authorityRootHash,
      generatedAt: this.now(),
      parserVersion: input.parserVersion ?? current.parserVersion,
      records,
    };
    if (isOlderVersion(snapshot, current)) return current;
    this.commitGeneration(snapshot);
    return snapshot;
  }

  removeSources(input: Pick<IncrementalMarkdownReferenceIndexInput, "workspaceId" | "projectId" | "authorityMutationId" | "authorityRevision" | "authorityRootHash" | "parserVersion"> & { sources: readonly MarkdownReferenceSource[] }): MarkdownLinkIndexSnapshot | null {
    const projectId = input.projectId;
    if (!projectId) throw new Error("MARKDOWN_REFERENCE_PROJECT_REQUIRED");
    const current = this.snapshot({ projectId, workspaceId: input.workspaceId });
    if (!current) return null;
    const removed = new Set(input.sources.map(sourceKey));
    const snapshot: MarkdownLinkIndexSnapshot = {
      ...current,
      authorityMutationId: input.authorityMutationId ?? current.authorityMutationId,
      authorityRevision: input.authorityRevision ?? current.authorityRevision,
      authorityRootHash: input.authorityRootHash ?? current.authorityRootHash,
      generatedAt: this.now(),
      parserVersion: input.parserVersion ?? current.parserVersion,
      records: current.records.filter((record) => !removed.has(sourceKey(record.source))),
    };
    if (isOlderVersion(snapshot, current)) return current;
    this.commitGeneration(snapshot);
    return snapshot;
  }

  snapshot(scope?: MarkdownReferenceIndexScope): MarkdownLinkIndexSnapshot | null {
    try {
      const row = scope
        ? this.db.prepare("SELECT * FROM markdown_index_generations WHERE project_id = ? AND workspace_id = ? AND status = 'active' ORDER BY generation_id DESC LIMIT 1").get(scope.projectId, scope.workspaceId) as GenerationRow | undefined
        : this.db.prepare("SELECT * FROM markdown_index_generations WHERE status = 'active' ORDER BY generated_at DESC, generation_id DESC LIMIT 1").get() as GenerationRow | undefined;
      if (!row) return null;
      const rows = this.db.prepare("SELECT * FROM markdown_index_records WHERE generation_id = ? ORDER BY record_id ASC").all(row.generation_id) as RecordRow[];
      return rowToSnapshot(row, rows);
    } catch {
      // A damaged derived cache is equivalent to a cache miss. The next
      // rebuild will rotate it out without risking source Markdown.
      return null;
    }
  }

  status(scope: MarkdownReferenceIndexScope): MarkdownReferenceIndexStatus {
    const snapshot = this.snapshot(scope);
    return { status: snapshot ? "ready" : "stale", snapshot };
  }

  outgoing(source: MarkdownReferenceSource): MarkdownLinkRecord[] {
    const snap = this.snapshot({ projectId: source.projectId, workspaceId: source.workspaceId });
    return snap?.records.filter((record) => sameSource(record.source, source)) ?? [];
  }

  backlinks(target: MarkdownReferenceTarget, scope?: MarkdownReferenceIndexScope): MarkdownLinkRecord[] {
    const snapshot = scope
      ? this.snapshot(scope)
      : this.latestSnapshotForProject(target.projectId);
    return snapshot?.records.filter((record) => sameTarget(record.target, target)) ?? [];
  }

  private latestSnapshotForProject(projectId: string): MarkdownLinkIndexSnapshot | null {
    try {
      const row = this.db.prepare("SELECT * FROM markdown_index_generations WHERE project_id = ? AND status = 'active' ORDER BY generated_at DESC, generation_id DESC LIMIT 1").get(projectId) as GenerationRow | undefined;
      if (!row) return null;
      const rows = this.db.prepare("SELECT * FROM markdown_index_records WHERE generation_id = ? ORDER BY record_id ASC").all(row.generation_id) as RecordRow[];
      return rowToSnapshot(row, rows);
    } catch {
      return null;
    }
  }

  private commitGeneration(snapshot: MarkdownLinkIndexSnapshot): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE markdown_index_generations SET status = 'archived' WHERE project_id = ? AND workspace_id = ? AND status = 'active'").run(snapshot.projectId, snapshot.workspaceId);
      const generation = this.db.prepare(`INSERT INTO markdown_index_generations
        (project_id, workspace_id, status, authority_mutation_id, authority_revision, authority_root_hash, generated_at, parser_version, record_count)
        VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)`)
        .run(snapshot.projectId, snapshot.workspaceId, snapshot.authorityMutationId ?? null, snapshot.authorityRevision ?? null, snapshot.authorityRootHash ?? null, snapshot.generatedAt, snapshot.parserVersion, snapshot.records.length);
      const generationId = Number(generation.lastInsertRowid);
      const insert = this.db.prepare(`INSERT INTO markdown_index_records
        (generation_id, source_key, source_json, target_key, target_json, target_kind, target_project_id, target_resource_id, label_snapshot, start_offset, end_offset, line_number, column_number, content_hash, target_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const record of snapshot.records) {
        insert.run(generationId, sourceKey(record.source), JSON.stringify(record.source), targetKey(record.target), JSON.stringify(record.target), record.target.kind, record.target.projectId, targetResourceId(record.target), record.labelSnapshot, record.start, record.end, record.line, record.column, record.contentHash ?? null, record.targetState);
      }
      // Old generations cannot be observed after the active switch. Pruning
      // them keeps this derived DB bounded while preserving atomic reads.
      this.db.prepare("DELETE FROM markdown_index_records WHERE generation_id IN (SELECT generation_id FROM markdown_index_generations WHERE status = 'archived')").run();
      this.db.prepare("DELETE FROM markdown_index_generations WHERE status = 'archived'").run();
    });
    tx();
  }
}

interface GenerationRow {
  generation_id: number;
  project_id: string;
  workspace_id: string;
  authority_mutation_id: string | null;
  authority_revision: number | null;
  authority_root_hash: string | null;
  generated_at: number;
  parser_version: string;
  record_count: number;
}

interface RecordRow {
  source_json: string;
  target_json: string;
  label_snapshot: string;
  start_offset: number;
  end_offset: number;
  line_number: number;
  column_number: number;
  content_hash: string | null;
  target_state: MarkdownLinkRecord["targetState"];
}

function openDatabase(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  let opened: Database.Database | undefined;
  try {
    opened = new Database(dbPath);
    initializeDatabase(opened);
    return opened;
  } catch (error) {
    try { opened?.close(); } catch { /* best effort */ }
    // The file is only derived state. Rotate malformed files and retry once;
    // never delete or rewrite source content as part of recovery.
    for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (!fs.existsSync(candidate)) continue;
      try { fs.renameSync(candidate, `${candidate}.corrupt-${Date.now()}`); } catch { /* best effort; retry below */ }
    }
    try {
      const db = new Database(dbPath);
      initializeDatabase(db);
      return db;
    } catch {
      throw error;
    }
  }
}

function initializeDatabase(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  const columns = db.prepare("PRAGMA table_info(markdown_index_records)").all() as Array<{ name?: string }>;
  if (!columns.some((column) => column.name === "target_json")) {
    throw new Error("MARKDOWN_REFERENCE_SCHEMA_MISMATCH");
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS markdown_index_generations (
  generation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived', 'building')),
  authority_mutation_id TEXT,
  authority_revision INTEGER,
  authority_root_hash TEXT,
  generated_at INTEGER NOT NULL,
  parser_version TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS markdown_index_active_generation
  ON markdown_index_generations(project_id, workspace_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS markdown_index_generation_lookup
  ON markdown_index_generations(project_id, workspace_id, status, generated_at DESC);
CREATE TABLE IF NOT EXISTS markdown_index_records (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  generation_id INTEGER NOT NULL REFERENCES markdown_index_generations(generation_id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  source_json TEXT NOT NULL,
  target_key TEXT NOT NULL,
  target_json TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_project_id TEXT NOT NULL,
  target_resource_id TEXT NOT NULL,
  label_snapshot TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  line_number INTEGER NOT NULL,
  column_number INTEGER NOT NULL,
  content_hash TEXT,
  target_state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS markdown_index_records_source ON markdown_index_records(generation_id, source_key);
CREATE INDEX IF NOT EXISTS markdown_index_records_target ON markdown_index_records(generation_id, target_key);
`;

function defaultDataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

function buildMemorySnapshot(input: RebuildMarkdownReferenceIndexInput): MarkdownLinkIndexSnapshot {
  return new InMemoryMarkdownReferenceIndex().rebuild(input);
}

function inferProjectId(documents: RebuildMarkdownReferenceIndexInput["documents"]): string | undefined {
  return documents[0]?.source.projectId;
}

function rowToSnapshot(row: GenerationRow, rows: RecordRow[]): MarkdownLinkIndexSnapshot {
  return {
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    authorityMutationId: row.authority_mutation_id ?? undefined,
    authorityRevision: row.authority_revision ?? undefined,
    authorityRootHash: row.authority_root_hash ?? undefined,
    generatedAt: row.generated_at,
    parserVersion: row.parser_version,
    records: rows.flatMap((record) => {
      try {
        return [{
          source: JSON.parse(record.source_json) as MarkdownReferenceSource,
          target: JSON.parse(record.target_json) as MarkdownReferenceTarget,
          labelSnapshot: record.label_snapshot,
          start: record.start_offset,
          end: record.end_offset,
          line: record.line_number,
          column: record.column_number,
          contentHash: record.content_hash ?? undefined,
          targetState: record.target_state,
        }];
      } catch {
        return [];
      }
    }),
  };
}

function sourceKey(source: MarkdownReferenceSource): string {
  return JSON.stringify(source);
}

function targetKey(target: MarkdownReferenceTarget): string {
  return JSON.stringify(target);
}

function targetResourceId(target: MarkdownReferenceTarget): string {
  return target.kind === "project" ? target.projectId : target.kind === "page" ? target.pageId : target.docId;
}

function sameSource(a: MarkdownReferenceSource, b: MarkdownReferenceSource): boolean {
  return sourceKey(a) === sourceKey(b);
}

function sameTarget(a: MarkdownReferenceTarget, b: MarkdownReferenceTarget): boolean {
  return targetKey(a) === targetKey(b);
}

function isOlderVersion(next: MarkdownLinkIndexSnapshot, current: MarkdownLinkIndexSnapshot | null): boolean {
  if (!current || typeof next.authorityRevision !== "number" || typeof current.authorityRevision !== "number") return false;
  if (next.authorityRevision < current.authorityRevision) return true;
  return next.authorityRevision === current.authorityRevision
    && Boolean(next.authorityRootHash)
    && Boolean(current.authorityRootHash)
    && next.authorityRootHash !== current.authorityRootHash;
}

function isIncomingReceiptOlder(input: RebuildMarkdownReferenceIndexInput, current: MarkdownLinkIndexSnapshot): boolean {
  if (typeof input.authorityRevision !== "number" || typeof current.authorityRevision !== "number") return false;
  if (input.authorityRevision < current.authorityRevision) return true;
  return input.authorityRevision === current.authorityRevision
    && Boolean(input.authorityRootHash)
    && Boolean(current.authorityRootHash)
    && input.authorityRootHash !== current.authorityRootHash;
}

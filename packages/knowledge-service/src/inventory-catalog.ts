import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import type {
  InventoryEntry,
  InventoryFreshness,
  InventoryGeneratedSemantic,
  InventoryEvidenceRef,
  InventoryMatchReason,
  InventoryQuery,
  InventoryQueryResult,
  InventorySnapshot,
  InventoryTargetAvailability,
} from "@workbench/shared";
import {
  canonicalInventoryJson,
  inventorySearchText,
  PROJECT_INVENTORY_SCHEMA_VERSION,
  resolveInventorySemantic,
} from "./shared-runtime.js";

export interface SqliteInventoryCatalogOptions {
  dataDir: string;
  databasePath?: string;
}

export interface InventoryGenerationRequest {
  canonicalUri: string;
  sourceFingerprint: string;
  evidenceRefs: InventoryEvidenceRef[];
}

export interface InventoryCatalogStats {
  databasePath: string;
  activeProjects: number;
  freshProjects: number;
  staleProjects: number;
  unavailableProjects: number;
  activeEntries: number;
  reviewRecommended: number;
  generationJobCount: number;
  pendingJobs: number;
  failedJobs: number;
  generationFailureRate: number;
  generationLatencyP50Ms: number | null;
  generationLatencyP95Ms: number | null;
  annotations: number;
  queryCount: number;
  queryHitCount: number;
  queryHitRate: number;
  queryLatencyP50Ms: number | null;
  queryLatencyP95Ms: number | null;
  truncatedQueryCount: number;
}

export interface InventorySearchOptions extends InventoryQuery {
  projectId: string;
  targetAvailability?: (entry: InventoryEntry) => InventoryTargetAvailability;
}

export interface InventoryAnnotationInput {
  projectId: string;
  canonicalUri: string;
  sourceFingerprint: string;
  generated: InventoryGeneratedSemantic;
}

export interface InventoryGenerationJob {
  taskKey: string;
  projectId: string;
  canonicalUri: string;
  sourceFingerprint: string;
  generatorVersion: string;
  evidenceRefs: InventoryEvidenceRef[];
  status: "pending" | "running" | "ready" | "failed" | "superseded";
  attempts: number;
  error?: string;
}

export class SqliteInventoryCatalog {
  readonly databasePath: string;
  private readonly db: Database.Database;
  private queryCount = 0;
  private queryHitCount = 0;
  private truncatedQueryCount = 0;
  private readonly queryLatencies: number[] = [];
  private readonly generationStarts = new Map<string, number>();
  private readonly generationLatencies: number[] = [];

  constructor(options: SqliteInventoryCatalogOptions) {
    const knowledgeDir = path.join(options.dataDir, "knowledge");
    fs.mkdirSync(knowledgeDir, { recursive: true });
    this.databasePath = options.databasePath ?? path.join(knowledgeDir, "knowledge.db");
    this.db = new Database(this.databasePath, { timeout: 5_000 });
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = FULL");
    this.initializeSchema();
  }

  close(): void {
    this.db.close();
  }

  publish(snapshot: InventorySnapshot): number {
    const write = this.db.transaction(() => {
      const generation = this.db.prepare(
        `INSERT INTO inventory_generations
          (project_id, workspace_revision, workspace_root_hash, catalog_fingerprint,
           overlay_hash, projection_fingerprint, generator_version, built_at,
           freshness, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'building', ?)`,
      ).run(
        snapshot.projectId,
        snapshot.workspaceRevision,
        snapshot.workspaceRootHash,
        snapshot.catalogFingerprint,
        snapshot.overlayHash,
        snapshot.projectionFingerprint,
        snapshot.generatorVersion,
        snapshot.builtAt,
        snapshot.freshness,
        Date.now(),
      );
      const generationId = Number(generation.lastInsertRowid);
      const insertEntry = this.db.prepare(
        `INSERT INTO inventory_entries
          (generation_id, project_id, canonical_uri, resource_type, scope,
           source_state, generation_state, review_state, entry_json, name, aliases,
           summary, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertFts = this.db.prepare(
        `INSERT INTO inventory_entries_fts
          (generation_id, project_id, canonical_uri, name, aliases, summary, search_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const entry of snapshot.entries) {
        const resolved = resolveInventorySemantic(entry);
        insertEntry.run(
          generationId,
          snapshot.projectId,
          entry.canonicalUri,
          entry.resourceType,
          entry.scope,
          entry.sourceState,
          entry.generationState,
          entry.reviewState,
          JSON.stringify(entry),
          resolved.name,
          resolved.aliases.join(" "),
          resolved.summary,
          entry.human.updatedAt ? Date.parse(entry.human.updatedAt) || Date.now() : Date.now(),
        );
        insertFts.run(
          generationId,
          snapshot.projectId,
          entry.canonicalUri,
          resolved.name,
          resolved.aliases.join(" "),
          resolved.summary,
          inventorySearchText(entry),
        );
        if (entry.generated) {
          this.db.prepare(
            `INSERT OR REPLACE INTO inventory_annotations
              (project_id, canonical_uri, source_fingerprint, content_hash, annotation_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(
            snapshot.projectId,
            entry.canonicalUri,
            entry.generated.sourceFingerprint,
            entry.generated.contentHash,
            JSON.stringify(entry.generated),
            Date.now(),
          );
        }
      }
      this.db.prepare(
        "UPDATE inventory_generations SET status = 'active' WHERE generation_id = ?",
      ).run(generationId);
      // Keep the previous active generation intact until the new generation
      // has been fully written and promoted. A failed insert therefore cannot
      // leave reads without a usable directory.
      this.db.prepare(
        "UPDATE inventory_generations SET status = 'superseded' WHERE project_id = ? AND status = 'active' AND generation_id <> ?",
      ).run(snapshot.projectId, generationId);
      this.db.prepare(
        "UPDATE inventory_generation_jobs SET status = 'superseded', updated_at = ? WHERE project_id = ? AND status IN ('pending', 'running')",
      ).run(Date.now(), snapshot.projectId);
      return generationId;
    });
    return Number(write());
  }

  activeSnapshot(projectId: string): InventorySnapshot | null {
    const generation = this.db.prepare(
      `SELECT generation_id AS generationId, project_id AS projectId,
          workspace_revision AS workspaceRevision, workspace_root_hash AS workspaceRootHash,
          catalog_fingerprint AS catalogFingerprint, overlay_hash AS overlayHash,
          projection_fingerprint AS projectionFingerprint, generator_version AS generatorVersion,
          built_at AS builtAt, freshness
       FROM inventory_generations
       WHERE project_id = ? AND status = 'active'
       ORDER BY generation_id DESC LIMIT 1`,
    ).get(projectId) as InventoryGenerationRow | undefined;
    if (!generation) return null;
    const entries = this.db.prepare(
      "SELECT entry_json AS entryJson FROM inventory_entries WHERE generation_id = ? ORDER BY canonical_uri",
    ).all(generation.generationId) as Array<{ entryJson: string }>;
    return {
      schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
      projectId: generation.projectId,
      workspaceRevision: generation.workspaceRevision,
      workspaceRootHash: generation.workspaceRootHash,
      catalogFingerprint: generation.catalogFingerprint,
      overlayHash: generation.overlayHash,
      projectionFingerprint: generation.projectionFingerprint,
      generatorVersion: generation.generatorVersion,
      builtAt: generation.builtAt,
      freshness: generation.freshness,
      entries: entries.map((row) => JSON.parse(row.entryJson) as InventoryEntry),
    };
  }

  generatedForProject(projectId: string): Map<string, InventoryGeneratedSemantic> {
    const snapshot = this.activeSnapshot(projectId);
    return new Map(
      (snapshot?.entries ?? [])
        .filter((entry): entry is InventoryEntry & { generated: InventoryGeneratedSemantic } => Boolean(entry.generated))
        .map((entry) => [entry.canonicalUri, entry.generated]),
    );
  }

  createGenerationJobs(
    projectId: string,
    requests: readonly InventoryGenerationRequest[],
    generatorVersion: string,
  ): number {
    const insert = this.db.prepare(
      `INSERT INTO inventory_generation_jobs
        (task_key, project_id, canonical_uri, source_fingerprint, generator_version,
         evidence_json, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
       ON CONFLICT(task_key) DO UPDATE SET
         evidence_json = excluded.evidence_json,
         status = 'pending', attempts = 0, error = NULL, updated_at = excluded.updated_at
       WHERE inventory_generation_jobs.status IN ('failed', 'superseded')`,
    );
    let inserted = 0;
    const write = this.db.transaction(() => {
      for (const request of requests) {
        const taskKey = `${projectId}:${request.canonicalUri}:${request.sourceFingerprint}:${generatorVersion}`;
        inserted += Number(insert.run(taskKey, projectId, request.canonicalUri, request.sourceFingerprint, generatorVersion, JSON.stringify(request.evidenceRefs), Date.now(), Date.now()).changes);
      }
    });
    write();
    return inserted;
  }

  claimGenerationJobs(projectId: string, limit = 8): InventoryGenerationJob[] {
    const safeLimit = Math.max(1, Math.min(limit, 32));
    const claim = this.db.transaction(() => {
      const rows = this.db.prepare(
        `SELECT task_key AS taskKey, project_id AS projectId, canonical_uri AS canonicalUri,
            source_fingerprint AS sourceFingerprint, generator_version AS generatorVersion,
            evidence_json AS evidenceJson, status, attempts, error
         FROM inventory_generation_jobs
         WHERE project_id = ? AND status = 'pending'
         ORDER BY created_at, task_key LIMIT ?`,
      ).all(projectId, safeLimit) as InventoryJobRow[];
      const update = this.db.prepare(
        "UPDATE inventory_generation_jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE task_key = ? AND status = 'pending'",
      );
      return rows.filter((row) => update.run(Date.now(), row.taskKey).changes > 0).map((row) => {
        this.generationStarts.set(row.taskKey, Date.now());
        return toGenerationJob(row);
      });
    });
    return claim();
  }

  applyAnnotation(input: InventoryAnnotationInput): boolean {
    const write = this.db.transaction(() => {
      const generation = this.db.prepare(
        "SELECT generation_id AS generationId FROM inventory_generations WHERE project_id = ? AND status = 'active'",
      ).get(input.projectId) as { generationId: number } | undefined;
      if (!generation) return false;
      const row = this.db.prepare(
        "SELECT entry_json AS entryJson FROM inventory_entries WHERE generation_id = ? AND canonical_uri = ?",
      ).get(generation.generationId, input.canonicalUri) as { entryJson: string } | undefined;
      if (!row) return false;
      const entry = JSON.parse(row.entryJson) as InventoryEntry;
      const currentJob = this.db.prepare(
        `SELECT task_key AS taskKey FROM inventory_generation_jobs
         WHERE project_id = ? AND canonical_uri = ? AND source_fingerprint = ?
           AND status IN ('pending', 'running') LIMIT 1`,
      ).get(input.projectId, input.canonicalUri, input.sourceFingerprint) as { taskKey?: string } | undefined;
      if (entry.generated?.sourceFingerprint
        && entry.generated.sourceFingerprint !== input.sourceFingerprint
        && !currentJob) return false;
      entry.generated = input.generated;
      entry.generationState = "ready";
      entry.reviewState = entry.human.confirmedGeneratedHash
        ? entry.human.confirmedGeneratedHash === input.generated.contentHash ? "confirmed" : "review_recommended"
        : entry.reviewState === "not_required" ? "not_required" : "unreviewed";
      this.updateEntry(generation.generationId, input.projectId, entry);
      this.db.prepare(
        `INSERT OR REPLACE INTO inventory_annotations
          (project_id, canonical_uri, source_fingerprint, content_hash, annotation_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(input.projectId, input.canonicalUri, input.sourceFingerprint, input.generated.contentHash, JSON.stringify(input.generated), Date.now());
      this.db.prepare(
        `UPDATE inventory_generation_jobs SET status = 'ready', updated_at = ?
         WHERE project_id = ? AND canonical_uri = ? AND source_fingerprint = ? AND status IN ('pending', 'running')`,
      ).run(Date.now(), input.projectId, input.canonicalUri, input.sourceFingerprint);
      if (currentJob?.taskKey) this.recordGenerationLatency(currentJob.taskKey);
      return true;
    });
    return Boolean(write());
  }

  markGenerationFailed(input: { projectId: string; canonicalUri: string; sourceFingerprint: string; error: string }): boolean {
    const write = this.db.transaction(() => {
      const task = this.db.prepare(
        `SELECT task_key AS taskKey FROM inventory_generation_jobs
         WHERE project_id = ? AND canonical_uri = ? AND source_fingerprint = ?
           AND status IN ('pending', 'running') LIMIT 1`,
      ).get(input.projectId, input.canonicalUri, input.sourceFingerprint) as { taskKey?: string } | undefined;
      const result = this.db.prepare(
        `UPDATE inventory_generation_jobs SET status = 'failed', error = ?, attempts = attempts + 1, updated_at = ?
         WHERE project_id = ? AND canonical_uri = ? AND source_fingerprint = ? AND status IN ('pending', 'running')`,
      ).run(input.error.slice(0, 200), Date.now(), input.projectId, input.canonicalUri, input.sourceFingerprint);
      if (result.changes > 0 && task?.taskKey) this.recordGenerationLatency(task.taskKey);
      const generation = this.db.prepare(
        "SELECT generation_id AS generationId FROM inventory_generations WHERE project_id = ? AND status = 'active'",
      ).get(input.projectId) as { generationId: number } | undefined;
      if (generation) {
        const row = this.db.prepare(
          "SELECT entry_json AS entryJson FROM inventory_entries WHERE generation_id = ? AND canonical_uri = ?",
        ).get(generation.generationId, input.canonicalUri) as { entryJson: string } | undefined;
        if (row) {
          const entry = JSON.parse(row.entryJson) as InventoryEntry;
          if (result.changes > 0) {
            entry.generationState = "failed";
            this.updateEntry(generation.generationId, input.projectId, entry);
          }
        }
      }
      return result.changes > 0;
    });
    return Boolean(write());
  }

  markGenerationSuperseded(taskKey: string): boolean {
    const result = this.db.prepare(
      "UPDATE inventory_generation_jobs SET status = 'superseded', updated_at = ? WHERE task_key = ? AND status = 'running'",
    ).run(Date.now(), taskKey);
    if (result.changes > 0) this.recordGenerationLatency(taskKey);
    return result.changes > 0;
  }

  search(options: InventorySearchOptions): InventoryQueryResult {
    this.queryCount++;
    const startedAt = Date.now();
    const finish = (result: InventoryQueryResult): InventoryQueryResult => {
      this.recordQueryLatency(Date.now() - startedAt);
      return result;
    };
    const snapshot = this.activeSnapshot(options.projectId);
    if (!snapshot) return finish({ entries: [], freshness: "unavailable", total: 0, nextCursor: null, truncated: false });
    const query = options.query?.trim() ?? "";
    let rows: Array<{ entryJson: string }>;
    if (query) {
      const matchQuery = toFtsQuery(query);
      if (!matchQuery) rows = [];
      else rows = this.db.prepare(
        `SELECT e.entry_json AS entryJson
         FROM inventory_entries_fts AS f
         JOIN inventory_entries AS e
           ON e.generation_id = f.generation_id AND e.canonical_uri = f.canonical_uri
         WHERE f.generation_id = ? AND inventory_entries_fts MATCH ?`,
      ).all(findGenerationId(this.db, options.projectId), matchQuery) as Array<{ entryJson: string }>;
      // unicode61 does not segment CJK text into the short fragments users
      // commonly type. Keep FTS as the primary index, then use the already
      // bounded active snapshot for a normalized substring fallback when FTS
      // produces no result.
      if (rows.length === 0) {
        const normalizedQuery = normalize(query);
        rows = snapshot.entries
          .filter((entry) => normalize(inventorySearchText(entry)).includes(normalizedQuery))
          .map((entry) => ({ entryJson: JSON.stringify(entry) }));
      }
    } else {
      rows = snapshot.entries.map((entry) => ({ entryJson: JSON.stringify(entry) }));
    }
    const filtered = rows
      .map((row) => JSON.parse(row.entryJson) as InventoryEntry)
      .filter((entry) => entry.sourceState === "active")
      .filter((entry) => !options.resourceTypes?.length || options.resourceTypes.includes(entry.resourceType))
      .filter((entry) => !options.scopes?.length || options.scopes.includes(entry.scope))
      .map((entry) => ({
        entry,
        matchedBy: matchReasons(entry, query),
        availability: options.targetAvailability?.(entry) ?? (entry.scope === "local" ? "available" : "unknown"),
      }));
    filtered.sort((left, right) => scoreMatch(right.matchedBy) - scoreMatch(left.matchedBy) || left.entry.canonicalUri.localeCompare(right.entry.canonicalUri));
    const total = filtered.length;
    if (total > 0) this.queryHitCount++;
    const offset = decodeCursor(options.cursor);
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const page = filtered.slice(offset, offset + limit);
    const result = {
      entries: page.map(({ entry, matchedBy, availability }) => ({
        ...entry,
        resolved: resolveInventorySemantic(entry),
        matchedBy,
        targetAvailability: availability,
      })),
      freshness: snapshot.freshness,
      total,
      nextCursor: offset + page.length < total ? encodeCursor(offset + page.length) : null,
      truncated: offset + page.length < total,
    };
    if (result.truncated) this.truncatedQueryCount++;
    return finish(result);
  }

  stats(): InventoryCatalogStats {
    const count = (sql: string): number => Number((this.db.prepare(sql).get() as { count: number }).count);
    const generationJobCount = count("SELECT COUNT(*) AS count FROM inventory_generation_jobs");
    const failedJobs = count("SELECT COUNT(*) AS count FROM inventory_generation_jobs WHERE status = 'failed'");
    const activeEntryRows = this.db.prepare(
      "SELECT entry_json AS entryJson FROM inventory_entries WHERE generation_id IN (SELECT generation_id FROM inventory_generations WHERE status = 'active')",
    ).all() as Array<{ entryJson: string }>;
    const reviewRecommended = activeEntryRows.reduce((total, row) => {
      try { return total + ((JSON.parse(row.entryJson) as InventoryEntry).reviewState === "review_recommended" ? 1 : 0); } catch { return total; }
    }, 0);
    const freshness = (value: InventoryFreshness): number => count(`SELECT COUNT(*) AS count FROM inventory_generations WHERE status = 'active' AND freshness = '${value}'`);
    return {
      databasePath: this.databasePath,
      activeProjects: count("SELECT COUNT(*) AS count FROM inventory_generations WHERE status = 'active'"),
      freshProjects: freshness("fresh"),
      staleProjects: freshness("stale") + freshness("rebuilding"),
      unavailableProjects: freshness("unavailable"),
      activeEntries: count("SELECT COUNT(*) AS count FROM inventory_entries WHERE generation_id IN (SELECT generation_id FROM inventory_generations WHERE status = 'active')"),
      reviewRecommended,
      generationJobCount,
      pendingJobs: count("SELECT COUNT(*) AS count FROM inventory_generation_jobs WHERE status IN ('pending', 'running')"),
      failedJobs,
      generationFailureRate: generationJobCount === 0 ? 0 : failedJobs / generationJobCount,
      generationLatencyP50Ms: percentile(this.generationLatencies, 0.5),
      generationLatencyP95Ms: percentile(this.generationLatencies, 0.95),
      annotations: count("SELECT COUNT(*) AS count FROM inventory_annotations"),
      queryCount: this.queryCount,
      queryHitCount: this.queryHitCount,
      queryHitRate: this.queryCount === 0 ? 0 : this.queryHitCount / this.queryCount,
      queryLatencyP50Ms: percentile(this.queryLatencies, 0.5),
      queryLatencyP95Ms: percentile(this.queryLatencies, 0.95),
      truncatedQueryCount: this.truncatedQueryCount,
    };
  }

  integrityCheck(): boolean {
    const row = this.db.prepare("PRAGMA quick_check").get() as { quick_check: string };
    return row.quick_check === "ok";
  }

  private updateEntry(generationId: number, projectId: string, entry: InventoryEntry): void {
    const resolved = resolveInventorySemantic(entry);
    this.db.prepare(
      `UPDATE inventory_entries SET
        source_state = ?, generation_state = ?, review_state = ?, entry_json = ?,
        name = ?, aliases = ?, summary = ?, updated_at = ?
       WHERE generation_id = ? AND canonical_uri = ?`,
    ).run(
      entry.sourceState,
      entry.generationState,
      entry.reviewState,
      JSON.stringify(entry),
      resolved.name,
      resolved.aliases.join(" "),
      resolved.summary,
      Date.now(),
      generationId,
      entry.canonicalUri,
    );
    this.db.prepare(
      `DELETE FROM inventory_entries_fts WHERE generation_id = ? AND canonical_uri = ?`,
    ).run(generationId, entry.canonicalUri);
    this.db.prepare(
      `INSERT INTO inventory_entries_fts
        (generation_id, project_id, canonical_uri, name, aliases, summary, search_text)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(generationId, projectId, entry.canonicalUri, resolved.name, resolved.aliases.join(" "), resolved.summary, inventorySearchText(entry));
  }

  private recordQueryLatency(durationMs: number): void {
    this.queryLatencies.push(durationMs);
    if (this.queryLatencies.length > 256) this.queryLatencies.shift();
  }

  private recordGenerationLatency(taskKey: string): void {
    const startedAt = this.generationStarts.get(taskKey);
    this.generationStarts.delete(taskKey);
    if (startedAt === undefined) return;
    this.generationLatencies.push(Math.max(0, Date.now() - startedAt));
    if (this.generationLatencies.length > 256) this.generationLatencies.shift();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_schema_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL
      );
    `);
    const schema = this.db.prepare(
      "SELECT schema_version AS schemaVersion FROM inventory_schema_meta WHERE id = 1",
    ).get() as { schemaVersion?: number } | undefined;
    if (schema?.schemaVersion !== PROJECT_INVENTORY_SCHEMA_VERSION) {
      // Inventory data is derived and this feature is pre-release. Rebuild
      // only inventory tables when the semantic contract changes; the shared
      // knowledge tables and all other project data remain untouched.
      this.db.exec(`
        DROP TABLE IF EXISTS inventory_entries_fts;
        DROP TABLE IF EXISTS inventory_generation_jobs;
        DROP TABLE IF EXISTS inventory_annotations;
        DROP TABLE IF EXISTS inventory_entries;
        DROP TABLE IF EXISTS inventory_generations;
      `);
      this.db.prepare(
        `INSERT INTO inventory_schema_meta (id, schema_version) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version`,
      ).run(PROJECT_INVENTORY_SCHEMA_VERSION);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_generations (
        generation_id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        workspace_revision INTEGER,
        workspace_root_hash TEXT,
        catalog_fingerprint TEXT NOT NULL,
        overlay_hash TEXT NOT NULL,
        projection_fingerprint TEXT NOT NULL,
        generator_version TEXT NOT NULL,
        built_at TEXT NOT NULL,
        freshness TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('building', 'active', 'superseded')),
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_generations_project
        ON inventory_generations(project_id, status, generation_id DESC);
      CREATE TABLE IF NOT EXISTS inventory_entries (
        generation_id INTEGER NOT NULL REFERENCES inventory_generations(generation_id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        canonical_uri TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        scope TEXT NOT NULL,
        source_state TEXT NOT NULL,
        generation_state TEXT NOT NULL,
        review_state TEXT NOT NULL,
        entry_json TEXT NOT NULL,
        name TEXT NOT NULL,
        aliases TEXT NOT NULL,
        summary TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (generation_id, canonical_uri)
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_entries_generation
        ON inventory_entries(generation_id, source_state, resource_type, scope);
      CREATE VIRTUAL TABLE IF NOT EXISTS inventory_entries_fts USING fts5(
        generation_id UNINDEXED,
        project_id UNINDEXED,
        canonical_uri UNINDEXED,
        name,
        aliases,
        summary,
        search_text,
        tokenize = 'unicode61'
      );
      CREATE TABLE IF NOT EXISTS inventory_annotations (
        project_id TEXT NOT NULL,
        canonical_uri TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        annotation_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, canonical_uri, source_fingerprint)
      );
      CREATE TABLE IF NOT EXISTS inventory_generation_jobs (
        task_key TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        canonical_uri TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        generator_version TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed', 'superseded')),
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_jobs_project
        ON inventory_generation_jobs(project_id, status, updated_at DESC);
    `);
    const columns = this.db.prepare("PRAGMA table_info(inventory_generation_jobs)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "evidence_json")) {
      this.db.exec("ALTER TABLE inventory_generation_jobs ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'");
    }
  }
}

interface InventoryGenerationRow {
  generationId: number;
  projectId: string;
  workspaceRevision: number | null;
  workspaceRootHash: string | null;
  catalogFingerprint: string;
  overlayHash: string;
  projectionFingerprint: string;
  generatorVersion: string;
  builtAt: string;
  freshness: InventoryFreshness;
}

interface InventoryJobRow {
  taskKey: string;
  projectId: string;
  canonicalUri: string;
  sourceFingerprint: string;
  generatorVersion: string;
  evidenceJson: string;
  status: InventoryGenerationJob["status"];
  attempts: number;
  error: string | null;
}

function toGenerationJob(row: InventoryJobRow): InventoryGenerationJob {
  return {
    taskKey: row.taskKey,
    projectId: row.projectId,
    canonicalUri: row.canonicalUri,
    sourceFingerprint: row.sourceFingerprint,
    generatorVersion: row.generatorVersion,
    evidenceRefs: JSON.parse(row.evidenceJson) as InventoryEvidenceRef[],
    status: row.status,
    attempts: row.attempts,
    ...(row.error ? { error: row.error } : {}),
  };
}

function findGenerationId(db: Database.Database, projectId: string): number {
  const row = db.prepare(
    "SELECT generation_id AS generationId FROM inventory_generations WHERE project_id = ? AND status = 'active' ORDER BY generation_id DESC LIMIT 1",
  ).get(projectId) as { generationId?: number } | undefined;
  return row?.generationId ?? -1;
}

function matchReasons(entry: InventoryEntry, query: string): InventoryMatchReason[] {
  if (!query) return [];
  const normalized = normalize(query);
  const resolved = resolveInventorySemantic(entry);
  const reasons: InventoryMatchReason[] = [];
  if (normalize(entry.canonicalUri) === normalized) reasons.push({ field: "uri", value: entry.canonicalUri, score: 1_000 });
  const id = entry.canonicalUri.split("/").pop() ?? "";
  if (normalize(id) === normalized) reasons.push({ field: "id", value: id, score: 950 });
  if (normalize(resolved.name) === normalized) reasons.push({ field: "name", value: resolved.name, score: 900 });
  else if (normalize(resolved.name).startsWith(normalized)) reasons.push({ field: "name", value: resolved.name, score: 800 });
  for (const alias of resolved.aliases) if (normalize(alias) === normalized) reasons.push({ field: "alias", value: alias, score: 780 });
  if (normalize(entry.resourceType) === normalized) reasons.push({ field: "resourceType", value: entry.resourceType, score: 450 });
  if (normalize(entry.scope) === normalized) reasons.push({ field: "scope", value: entry.scope, score: 440 });
  if (normalize(resolved.summary).includes(normalized)) reasons.push({ field: "summary", value: resolved.summary, score: 500 });
  return reasons.length ? reasons : [{ field: "summary", value: query, score: 100 }];
}

function scoreMatch(reasons: InventoryMatchReason[]): number {
  return reasons.reduce((best, reason) => Math.max(best, reason.score), 0);
}

function toFtsQuery(query: string): string {
  const tokens = query.match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 32) ?? [];
  return tokens.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const value = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function hashInventorySnapshot(snapshot: InventorySnapshot): string {
  return crypto.createHash("sha256").update(canonicalInventoryJson(snapshot)).digest("hex");
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? null;
}

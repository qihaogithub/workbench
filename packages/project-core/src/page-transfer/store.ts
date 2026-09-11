import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import type {
  PageTransferItem,
  PageTransferJob,
  PageTransferJobStatus,
  PageTransferItemStatus,
  PageTransferOutboxRecord,
  ReferenceGrant,
  ReferenceGrantStatus,
  ReferenceHead,
} from "./types.js";

export class PageTransferStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PageTransferStoreError";
  }
}

export class PageTransferStore {
  readonly db: Database.Database;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(options: {
    dataDir: string;
    dbPath?: string;
    now?: () => number;
    idFactory?: () => string;
  }) {
    const dbPath =
      options.dbPath ??
      path.join(options.dataDir, ".project-admin", "page-transfers.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.now = options.now ?? Date.now;
    this.idFactory =
      options.idFactory ?? (() => `transfer_${crypto.randomUUID()}`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_jobs (
        id TEXT PRIMARY KEY, source_project_id TEXT NOT NULL, source_workspace_id TEXT NOT NULL,
        target_project_id TEXT NOT NULL, target_workspace_id TEXT NOT NULL, mode TEXT NOT NULL,
        status TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, topology_status TEXT NOT NULL,
        source_revision INTEGER NOT NULL DEFAULT 0, source_root_hash TEXT NOT NULL DEFAULT '',
        target_base_revision INTEGER NOT NULL DEFAULT 0, target_base_root_hash TEXT,
        target_folder_id TEXT, placement_json TEXT, page_placements_json TEXT, created_by TEXT NOT NULL DEFAULT '',
        last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transfer_items (
        job_id TEXT NOT NULL, source_page_id TEXT NOT NULL, target_page_id TEXT NOT NULL,
        status TEXT NOT NULL, package_hash TEXT NOT NULL, mutation_id TEXT NOT NULL,
        reference_grant_id TEXT, conflict_json TEXT, warning TEXT, receipt_json TEXT, PRIMARY KEY (job_id, source_page_id),
        UNIQUE (job_id, target_page_id), FOREIGN KEY (job_id) REFERENCES transfer_jobs(id)
      );
      CREATE TABLE IF NOT EXISTS reference_grants (
        id TEXT PRIMARY KEY, source_project_id TEXT NOT NULL, source_page_id TEXT NOT NULL,
        target_project_id TEXT NOT NULL, target_page_id TEXT NOT NULL, status TEXT NOT NULL,
        source_head_hash TEXT, created_by TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(source_project_id, source_page_id, target_project_id, target_page_id)
      );
      CREATE TABLE IF NOT EXISTS reference_grant_heads (
        grant_id TEXT PRIMARY KEY, source_page_version_id TEXT NOT NULL, source_content_hash TEXT NOT NULL,
        status TEXT NOT NULL, materialization_id TEXT, last_known_good_materialization_id TEXT,
        error_code TEXT, updated_at INTEGER NOT NULL,
        FOREIGN KEY (grant_id) REFERENCES reference_grants(id)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
        status TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL,
        last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (job_id) REFERENCES transfer_jobs(id)
      );
    `);
    this.ensureColumn(
      "transfer_jobs",
      "source_revision",
      "INTEGER NOT NULL DEFAULT 0",
    );
    this.ensureColumn(
      "transfer_jobs",
      "source_root_hash",
      "TEXT NOT NULL DEFAULT ''",
    );
    this.ensureColumn(
      "transfer_jobs",
      "target_base_revision",
      "INTEGER NOT NULL DEFAULT 0",
    );
    this.ensureColumn("transfer_jobs", "target_base_root_hash", "TEXT");
    this.ensureColumn("transfer_jobs", "target_folder_id", "TEXT");
    this.ensureColumn("transfer_jobs", "placement_json", "TEXT");
    this.ensureColumn("transfer_jobs", "page_placements_json", "TEXT");
    this.ensureColumn(
      "transfer_jobs",
      "created_by",
      "TEXT NOT NULL DEFAULT ''",
    );
    this.ensureColumn("transfer_items", "reference_grant_id", "TEXT");
    this.ensureColumn(
      "reference_grants",
      "created_by",
      "TEXT NOT NULL DEFAULT ''",
    );
  }

  close(): void {
    this.db.close();
  }

  createJob(
    input: Omit<
      PageTransferJob,
      "createdAt" | "updatedAt" | "status" | "topologyStatus"
    > & { status?: PageTransferJobStatus },
  ): PageTransferJob {
    const now = this.now();
    const job: PageTransferJob = {
      ...input,
      id: input.id || this.idFactory(),
      status: input.status ?? "prepared",
      topologyStatus: "pending",
      createdAt: now,
      updatedAt: now,
    };
    const existing = this.db
      .prepare("SELECT * FROM transfer_jobs WHERE idempotency_key = ?")
      .get(job.idempotencyKey) as Record<string, unknown> | undefined;
    if (existing) return this.rowJob(existing);
    this.db
      .prepare(
        `INSERT INTO transfer_jobs (id,source_project_id,source_workspace_id,target_project_id,target_workspace_id,mode,status,idempotency_key,topology_status,source_revision,source_root_hash,target_base_revision,target_base_root_hash,target_folder_id,placement_json,page_placements_json,created_by,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        job.id,
        job.sourceProjectId,
        job.sourceWorkspaceId,
        job.targetProjectId,
        job.targetWorkspaceId,
        job.mode,
        job.status,
        job.idempotencyKey,
        job.topologyStatus,
        job.sourceRevision,
        job.sourceRootHash,
        job.targetBaseRevision,
        job.targetBaseRootHash ?? null,
        job.targetFolderId,
        job.placement ? JSON.stringify(job.placement) : null,
        job.pagePlacements ? JSON.stringify(job.pagePlacements) : null,
        job.createdBy,
        null,
        now,
        now,
      );
    return job;
  }

  getJob(id: string): PageTransferJob | undefined {
    const row = this.db
      .prepare("SELECT * FROM transfer_jobs WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowJob(row) : undefined;
  }
  getJobByIdempotencyKey(key: string): PageTransferJob | undefined {
    const row = this.db
      .prepare("SELECT * FROM transfer_jobs WHERE idempotency_key = ?")
      .get(key) as Record<string, unknown> | undefined;
    return row ? this.rowJob(row) : undefined;
  }
  transitionJob(
    id: string,
    status: PageTransferJobStatus,
    fields: {
      topologyStatus?: PageTransferJob["topologyStatus"];
      lastError?: string;
    } = {},
  ): PageTransferJob {
    const now = this.now();
    const result = this.db
      .prepare(
        "UPDATE transfer_jobs SET status=?, topology_status=COALESCE(?,topology_status), last_error=?, updated_at=? WHERE id=?",
      )
      .run(
        status,
        fields.topologyStatus ?? null,
        fields.lastError ?? null,
        now,
        id,
      );
    if (!result.changes)
      throw new PageTransferStoreError(
        "JOB_NOT_FOUND",
        `Transfer job not found: ${id}`,
      );
    return this.getJob(id) as PageTransferJob;
  }

  upsertItem(item: PageTransferItem): PageTransferItem {
    this.db
      .prepare(
        `INSERT INTO transfer_items (job_id,source_page_id,target_page_id,status,package_hash,mutation_id,reference_grant_id,conflict_json,warning,receipt_json) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id,source_page_id) DO UPDATE SET target_page_id=excluded.target_page_id,status=excluded.status,package_hash=excluded.package_hash,mutation_id=excluded.mutation_id,reference_grant_id=excluded.reference_grant_id,conflict_json=excluded.conflict_json,warning=excluded.warning,receipt_json=excluded.receipt_json`,
      )
      .run(
        item.jobId,
        item.sourcePageId,
        item.targetPageId,
        item.status,
        item.packageHash,
        item.mutationId,
        item.referenceGrantId ?? null,
        item.conflict ? JSON.stringify(item.conflict) : null,
        item.warning ?? null,
        item.receipt ? JSON.stringify(item.receipt) : null,
      );
    return item;
  }
  listItems(jobId: string): PageTransferItem[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM transfer_items WHERE job_id = ? ORDER BY source_page_id",
        )
        .all(jobId) as Record<string, unknown>[]
    ).map((row) => this.rowItem(row));
  }
  transitionItem(
    jobId: string,
    sourcePageId: string,
    status: PageTransferItemStatus,
    fields: Partial<
      Pick<PageTransferItem, "conflict" | "warning" | "receipt">
    > = {},
  ): PageTransferItem {
    const item = this.listItems(jobId).find(
      (value) => value.sourcePageId === sourcePageId,
    );
    if (!item) throw new PageTransferStoreError("ITEM_NOT_FOUND", sourcePageId);
    return this.upsertItem({ ...item, status, ...fields });
  }

  upsertGrant(
    input: Omit<ReferenceGrant, "createdAt" | "updatedAt" | "id" | "status"> & {
      id?: string;
      status?: ReferenceGrantStatus;
    },
  ): ReferenceGrant {
    const now = this.now();
    const grant: ReferenceGrant = {
      ...input,
      id: input.id ?? this.idFactory(),
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    };
    const existing = this.db
      .prepare(
        "SELECT * FROM reference_grants WHERE source_project_id=? AND source_page_id=? AND target_project_id=? AND target_page_id=?",
      )
      .get(
        input.sourceProjectId,
        input.sourcePageId,
        input.targetProjectId,
        input.targetPageId,
      ) as Record<string, unknown> | undefined;
    if (existing) {
      this.db
        .prepare(
          "UPDATE reference_grants SET status=?,source_head_hash=?,created_by=?,updated_at=? WHERE id=?",
        )
        .run(
          grant.status,
          grant.sourceHeadHash ?? null,
          grant.createdBy,
          now,
          String(existing.id),
        );
      return this.getGrant(String(existing.id)) as ReferenceGrant;
    }
    this.db
      .prepare(
        "INSERT INTO reference_grants (id,source_project_id,source_page_id,target_project_id,target_page_id,status,source_head_hash,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        grant.id,
        grant.sourceProjectId,
        grant.sourcePageId,
        grant.targetProjectId,
        grant.targetPageId,
        grant.status,
        grant.sourceHeadHash ?? null,
        grant.createdBy,
        now,
        now,
      );
    return grant;
  }
  getGrant(id: string): ReferenceGrant | undefined {
    const row = this.db
      .prepare("SELECT * FROM reference_grants WHERE id=?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowGrant(row) : undefined;
  }
  listGrants(
    sourceProjectId?: string,
    sourcePageId?: string,
  ): ReferenceGrant[] {
    const rows =
      sourceProjectId === undefined
        ? (this.db
            .prepare("SELECT * FROM reference_grants ORDER BY created_at")
            .all() as Record<string, unknown>[])
        : (this.db
            .prepare(
              "SELECT * FROM reference_grants WHERE source_project_id=? AND source_page_id=? ORDER BY created_at",
            )
            .all(sourceProjectId, sourcePageId) as Record<string, unknown>[]);
    return rows.map((row) => this.rowGrant(row));
  }
  transitionGrant(id: string, status: ReferenceGrantStatus): ReferenceGrant {
    const result = this.db
      .prepare("UPDATE reference_grants SET status=?,updated_at=? WHERE id=?")
      .run(status, this.now(), id);
    if (!result.changes)
      throw new PageTransferStoreError("GRANT_NOT_FOUND", id);
    return this.getGrant(id) as ReferenceGrant;
  }
  activateGrant(id: string): ReferenceGrant {
    return this.transitionGrant(id, "active");
  }
  revokeGrant(id: string): ReferenceGrant {
    return this.transitionGrant(id, "revoked");
  }
  markGrantSourceDeleted(id: string): ReferenceGrant {
    return this.transitionGrant(id, "source_deleted");
  }
  upsertHead(input: Omit<ReferenceHead, "updatedAt">): ReferenceHead {
    const head = { ...input, updatedAt: this.now() };
    this.db
      .prepare(
        `INSERT INTO reference_grant_heads (grant_id,source_page_version_id,source_content_hash,status,materialization_id,last_known_good_materialization_id,error_code,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(grant_id) DO UPDATE SET source_page_version_id=excluded.source_page_version_id,source_content_hash=excluded.source_content_hash,status=excluded.status,materialization_id=excluded.materialization_id,last_known_good_materialization_id=excluded.last_known_good_materialization_id,error_code=excluded.error_code,updated_at=excluded.updated_at`,
      )
      .run(
        head.grantId,
        head.sourcePageVersionId,
        head.sourceContentHash,
        head.status,
        head.materializationId ?? null,
        head.lastKnownGoodMaterializationId ?? null,
        head.errorCode ?? null,
        head.updatedAt,
      );
    return head;
  }
  updateReferenceHead(input: Omit<ReferenceHead, "updatedAt">): ReferenceHead {
    return this.upsertHead(input);
  }
  getHead(grantId: string): ReferenceHead | undefined {
    const row = this.db
      .prepare("SELECT * FROM reference_grant_heads WHERE grant_id=?")
      .get(grantId) as Record<string, unknown> | undefined;
    return row
      ? {
          grantId: String(row.grant_id),
          sourcePageVersionId: String(row.source_page_version_id),
          sourceContentHash: String(row.source_content_hash),
          status: row.status as ReferenceHead["status"],
          materializationId: row.materialization_id
            ? String(row.materialization_id)
            : undefined,
          lastKnownGoodMaterializationId: row.last_known_good_materialization_id
            ? String(row.last_known_good_materialization_id)
            : undefined,
          errorCode: row.error_code ? String(row.error_code) : undefined,
          updatedAt: Number(row.updated_at),
        }
      : undefined;
  }
  enqueue(
    input: Omit<
      PageTransferOutboxRecord,
      "status" | "attempts" | "nextAttemptAt" | "createdAt" | "updatedAt"
    > & { id?: string },
  ): PageTransferOutboxRecord {
    const now = this.now();
    const record: PageTransferOutboxRecord = {
      ...input,
      id: input.id ?? this.idFactory(),
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare("INSERT OR IGNORE INTO outbox VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(
        record.id,
        record.jobId,
        record.kind,
        JSON.stringify(record.payload),
        record.status,
        0,
        now,
        null,
        now,
        now,
      );
    return this.getOutbox(record.id) as PageTransferOutboxRecord;
  }
  getOutbox(id: string): PageTransferOutboxRecord | undefined {
    const row = this.db.prepare("SELECT * FROM outbox WHERE id=?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowOutbox(row) : undefined;
  }
  pendingOutbox(limit = 100): PageTransferOutboxRecord[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM outbox WHERE status IN ('pending','failed') AND next_attempt_at <= ? ORDER BY created_at LIMIT ?",
        )
        .all(this.now(), limit) as Record<string, unknown>[]
    ).map((r) => this.rowOutbox(r));
  }
  markOutbox(
    id: string,
    status: PageTransferOutboxRecord["status"],
    error?: string,
  ): PageTransferOutboxRecord {
    this.db
      .prepare(
        "UPDATE outbox SET status=?,attempts=attempts+1,last_error=?,updated_at=? WHERE id=?",
      )
      .run(status, error ?? null, this.now(), id);
    return this.getOutbox(id) as PageTransferOutboxRecord;
  }
  private rowJob(r: Record<string, unknown>): PageTransferJob {
    return {
      id: String(r.id),
      sourceProjectId: String(r.source_project_id),
      sourceWorkspaceId: String(r.source_workspace_id),
      targetProjectId: String(r.target_project_id),
      targetWorkspaceId: String(r.target_workspace_id),
      mode: r.mode as PageTransferJob["mode"],
      status: r.status as PageTransferJobStatus,
      idempotencyKey: String(r.idempotency_key),
      sourceRevision: Number(r.source_revision),
      sourceRootHash: String(r.source_root_hash),
      targetBaseRevision: Number(r.target_base_revision),
      targetBaseRootHash: r.target_base_root_hash
        ? String(r.target_base_root_hash)
        : undefined,
      targetFolderId: r.target_folder_id ? String(r.target_folder_id) : null,
      placement: r.placement_json
        ? JSON.parse(String(r.placement_json))
        : undefined,
      pagePlacements: r.page_placements_json
        ? JSON.parse(String(r.page_placements_json))
        : undefined,
      createdBy: String(r.created_by),
      topologyStatus: r.topology_status as PageTransferJob["topologyStatus"],
      lastError: r.last_error ? String(r.last_error) : undefined,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  }
  private rowItem(r: Record<string, unknown>): PageTransferItem {
    return {
      jobId: String(r.job_id),
      sourcePageId: String(r.source_page_id),
      targetPageId: String(r.target_page_id),
      status: r.status as PageTransferItemStatus,
      packageHash: String(r.package_hash),
      mutationId: String(r.mutation_id),
      referenceGrantId: r.reference_grant_id
        ? String(r.reference_grant_id)
        : undefined,
      conflict: r.conflict_json
        ? JSON.parse(String(r.conflict_json))
        : undefined,
      warning: r.warning ? String(r.warning) : undefined,
      receipt: r.receipt_json ? JSON.parse(String(r.receipt_json)) : undefined,
    };
  }
  private rowGrant(r: Record<string, unknown>): ReferenceGrant {
    return {
      id: String(r.id),
      sourceProjectId: String(r.source_project_id),
      sourcePageId: String(r.source_page_id),
      targetProjectId: String(r.target_project_id),
      targetPageId: String(r.target_page_id),
      status: r.status as ReferenceGrantStatus,
      sourceHeadHash: r.source_head_hash
        ? String(r.source_head_hash)
        : undefined,
      createdBy: String(r.created_by),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  }
  private rowOutbox(r: Record<string, unknown>): PageTransferOutboxRecord {
    return {
      id: String(r.id),
      jobId: String(r.job_id),
      kind: r.kind as PageTransferOutboxRecord["kind"],
      payload: JSON.parse(String(r.payload_json)),
      status: r.status as PageTransferOutboxRecord["status"],
      attempts: Number(r.attempts),
      nextAttemptAt: Number(r.next_attempt_at),
      lastError: r.last_error ? String(r.last_error) : undefined,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  }
  private ensureColumn(
    table: string,
    column: string,
    declaration: string,
  ): void {
    const columns = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column))
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

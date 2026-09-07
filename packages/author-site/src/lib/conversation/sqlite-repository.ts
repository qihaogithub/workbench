import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import {
  CONVERSATION_RETENTION_MS,
  MAX_CONTEXT_SUMMARY_BYTES,
  MAX_CONTEXT_SUMMARY_TAIL_BYTES,
  MAX_CONTEXT_SUMMARY_TAIL_MESSAGES,
  MAX_DISPLAY_PARTS_BYTES,
  MAX_RUN_ARTIFACT_BYTES,
  ConversationDomainError,
  assertMessageContent,
  assertStableId,
  isTerminalRunStatus,
  sanitizeDisplayParts,
  sanitizeDisplayPartsPayload,
  type AppendUserMessageCommand,
  type CancelRunAck,
  type CommitRunTerminalCommand,
  type ConversationMessageRecord,
  type ConversationContextSummaryInput,
  type ConversationContextSummaryRecord,
  type ConversationContextSummaryTailMessage,
  type ConversationDeletionScope,
  type ConversationProjection,
  type ConversationReliabilitySnapshot,
  type ConversationRecord,
  type ConversationRunRecord,
  type ConversationRunArtifactRecord,
  type MessageAcceptedAck,
  type RunStartAck,
  type RunTerminalAck,
  type StartRunCommand,
} from "./domain";
import type {
  ConversationOutboxEvent,
  ConversationRepository,
  EnsureConversationInput,
} from "./repository";

interface ConversationRow {
  id: string;
  user_id: string;
  project_id: string;
  workspace_id: string | null;
  title: string | null;
  status: "active" | "archived" | "deleted";
  revision: number;
  last_sequence: number;
  created_at: number;
  updated_at: number;
  expires_at: number;
  deleted_at: number | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  client_message_id: string | null;
  sequence: number;
  role: "user" | "assistant";
  kind: string | null;
  status: ConversationMessageRecord["status"];
  content_text: string;
  display_parts_json: string;
  created_at: number;
  completed_at: number | null;
  metadata_json: string;
}

interface RunRow {
  id: string;
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  status: ConversationRunRecord["status"];
  accepted_revision: number;
  started_revision: number | null;
  terminal_revision: number | null;
  model_provider: string | null;
  model_id: string | null;
  started_at: number | null;
  finished_at: number | null;
  cancel_requested_at: number | null;
  error_code: string | null;
  usage_json: string;
  summary_json: string;
  trace_id: string | null;
  terminal_hash: string | null;
}

interface ContextSummaryRow {
  conversation_id: string;
  schema_version: number;
  summary_version: number;
  source_revision: number;
  covered_through_sequence: number;
  summary_text: string;
  tail_messages_json: string;
  summary_hash: string;
  created_at: number;
}

interface RunArtifactRow {
  id: string;
  conversation_id: string;
  run_id: string;
  message_id: string;
  owner_user_id: string;
  mime_type: "application/json";
  size_bytes: number;
  sha256: string;
  payload_json: string;
  created_at: number;
  expires_at: number;
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapConversation(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status,
    revision: row.revision,
    lastSequence: row.last_sequence,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
  };
}

function mapMessage(row: MessageRow): ConversationMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    clientMessageId: row.client_message_id,
    sequence: row.sequence,
    role: row.role,
    kind: row.kind,
    status: row.status,
    content: row.content_text,
    displayParts: parseArray(row.display_parts_json),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    metadata: parseObject(row.metadata_json),
  };
}

function mapRun(row: RunRow): ConversationRunRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    status: row.status,
    modelProvider: row.model_provider,
    modelId: row.model_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorCode: row.error_code,
    usage: parseObject(row.usage_json),
    summary: parseObject(row.summary_json),
    traceId: row.trace_id,
  };
}

function parseSummaryTail(value: string): ConversationContextSummaryTailMessage[] {
  return parseArray(value).filter(
    (item): item is ConversationContextSummaryTailMessage =>
      Boolean(
        item &&
          typeof item === "object" &&
          ((item as { role?: unknown }).role === "user" ||
            (item as { role?: unknown }).role === "assistant") &&
          typeof (item as { content?: unknown }).content === "string",
      ),
  );
}

function mapContextSummary(row: ContextSummaryRow): ConversationContextSummaryRecord {
  return {
    schemaVersion: row.schema_version,
    summaryVersion: row.summary_version,
    conversationId: row.conversation_id,
    sourceRevision: row.source_revision,
    coveredThroughSequence: row.covered_through_sequence,
    summaryText: row.summary_text,
    tailMessages: parseSummaryTail(row.tail_messages_json),
    summaryHash: row.summary_hash,
    createdAt: row.created_at,
  };
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class SqliteConversationRepository implements ConversationRepository {
  readonly databasePath: string;
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.databasePath = path.resolve(databasePath);
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    let openedDatabase: Database.Database | null = null;
    try {
      openedDatabase = new Database(this.databasePath, { timeout: 5_000 });
      this.db = openedDatabase;
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("busy_timeout = 5000");
      this.db.pragma("synchronous = FULL");
      this.migrate();
      if (!this.quickCheck()) {
        throw new Error("PRAGMA quick_check failed");
      }
    } catch (error) {
      try {
        openedDatabase?.close();
      } catch {
        // Preserve the original availability error; closing is best-effort.
      }
      throw new ConversationDomainError(
        "CONVERSATION_STORE_UNAVAILABLE",
        "对话账本不可用",
        error,
      );
    }
  }

  private migrate(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version > 3) {
      throw new Error(`Unsupported conversation schema version: ${version}`);
    }
    if (version === 0) {
      this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          workspace_id TEXT,
          title TEXT,
          status TEXT NOT NULL CHECK(status IN ('active','archived','deleted')),
          revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
          last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE INDEX idx_conversations_owner_project_updated
          ON conversations(user_id, project_id, updated_at DESC);
        CREATE INDEX idx_conversations_expiry ON conversations(expires_at);

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          client_message_id TEXT,
          sequence INTEGER NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user','assistant')),
          kind TEXT,
          status TEXT NOT NULL CHECK(status IN ('accepted','completed','failed','cancelled','interrupted','superseded')),
          content_text TEXT NOT NULL,
          display_parts_json TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          UNIQUE(conversation_id, sequence),
          UNIQUE(conversation_id, client_message_id)
        );
        CREATE INDEX idx_messages_conversation_sequence
          ON messages(conversation_id, sequence);

        CREATE TABLE runs (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          user_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          assistant_message_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')),
          accepted_revision INTEGER NOT NULL,
          started_revision INTEGER,
          terminal_revision INTEGER,
          model_provider TEXT,
          model_id TEXT,
          started_at INTEGER,
          finished_at INTEGER,
          cancel_requested_at INTEGER,
          error_code TEXT,
          usage_json TEXT NOT NULL DEFAULT '{}',
          summary_json TEXT NOT NULL DEFAULT '{}',
          trace_id TEXT,
          terminal_hash TEXT
        );
        CREATE INDEX idx_runs_conversation_status ON runs(conversation_id, status);
        CREATE INDEX idx_runs_user_message ON runs(user_message_id);

        CREATE TABLE attachments (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
          owner_user_id TEXT NOT NULL,
          storage_ref TEXT NOT NULL,
          sha256 TEXT,
          mime_type TEXT,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE INDEX idx_attachments_owner_conversation
          ON attachments(owner_user_id, conversation_id);

        CREATE TABLE outbox (
          id TEXT PRIMARY KEY,
          aggregate_type TEXT NOT NULL,
          aggregate_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          published_at INTEGER,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
        CREATE INDEX idx_outbox_pending ON outbox(published_at, created_at);
        CREATE INDEX idx_outbox_aggregate ON outbox(aggregate_id);
        CREATE TABLE context_summaries (
          conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
          schema_version INTEGER NOT NULL,
          summary_version INTEGER NOT NULL CHECK(summary_version > 0),
          source_revision INTEGER NOT NULL CHECK(source_revision >= 0),
          covered_through_sequence INTEGER NOT NULL CHECK(covered_through_sequence >= 0),
          summary_text TEXT NOT NULL,
          tail_messages_json TEXT NOT NULL DEFAULT '[]',
          summary_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE run_artifacts (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          owner_user_id TEXT NOT NULL,
          mime_type TEXT NOT NULL CHECK(mime_type='application/json'),
          size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
          sha256 TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX idx_run_artifacts_owner_conversation
          ON run_artifacts(owner_user_id, conversation_id, expires_at);
        PRAGMA user_version = 3;
        COMMIT;
      `);
    }
    if (version === 1) {
      this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE context_summaries (
          conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
          schema_version INTEGER NOT NULL,
          summary_version INTEGER NOT NULL CHECK(summary_version > 0),
          source_revision INTEGER NOT NULL CHECK(source_revision >= 0),
          covered_through_sequence INTEGER NOT NULL CHECK(covered_through_sequence >= 0),
          summary_text TEXT NOT NULL,
          tail_messages_json TEXT NOT NULL DEFAULT '[]',
          summary_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        PRAGMA user_version = 2;
        COMMIT;
      `);
    }
    if (version === 1 || version === 2) {
      this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE run_artifacts (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          owner_user_id TEXT NOT NULL,
          mime_type TEXT NOT NULL CHECK(mime_type='application/json'),
          size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
          sha256 TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX idx_run_artifacts_owner_conversation
          ON run_artifacts(owner_user_id, conversation_id, expires_at);
        PRAGMA user_version = 3;
        COMMIT;
      `);
    }
  }

  private normalizeContextSummary(
    input: ConversationContextSummaryInput,
    conversation: ConversationRow,
  ): Omit<ConversationContextSummaryRecord, "summaryVersion" | "conversationId" | "summaryHash" | "createdAt"> {
    if (input.schemaVersion !== 1) {
      throw new ConversationDomainError("CONVERSATION_INVALID", "context summary schema version 不支持");
    }
    const summaryText = input.summaryText.trim();
    if (!summaryText || Buffer.byteLength(summaryText, "utf8") > MAX_CONTEXT_SUMMARY_BYTES) {
      throw new ConversationDomainError("CONVERSATION_TOO_LARGE", "context summary 超出大小限制");
    }
    if (
      !Number.isInteger(input.sourceRevision) ||
      input.sourceRevision < 0 ||
      input.sourceRevision > conversation.revision ||
      !Number.isInteger(input.coveredThroughSequence) ||
      input.coveredThroughSequence < 0 ||
      input.coveredThroughSequence > conversation.last_sequence
    ) {
      throw new ConversationDomainError("CONVERSATION_CONFLICT", "context summary 覆盖范围与账本不匹配");
    }
    if (!Array.isArray(input.tailMessages) || input.tailMessages.length > MAX_CONTEXT_SUMMARY_TAIL_MESSAGES) {
      throw new ConversationDomainError("CONVERSATION_TOO_LARGE", "context summary tail 消息数超限");
    }
    const tailMessages = input.tailMessages.map((message) => {
      if (
        !message ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" ||
        !message.content.trim()
      ) {
        throw new ConversationDomainError("CONVERSATION_INVALID", "context summary tail 消息无效");
      }
      return { role: message.role, content: message.content.trim().slice(0, 8_000) };
    });
    if (Buffer.byteLength(JSON.stringify(tailMessages), "utf8") > MAX_CONTEXT_SUMMARY_TAIL_BYTES) {
      throw new ConversationDomainError("CONVERSATION_TOO_LARGE", "context summary tail 超出大小限制");
    }
    return {
      schemaVersion: 1,
      sourceRevision: input.sourceRevision,
      coveredThroughSequence: input.coveredThroughSequence,
      summaryText,
      tailMessages,
    };
  }

  private persistContextSummary(
    conversation: ConversationRow,
    input: ConversationContextSummaryInput,
    now: number,
  ): void {
    const normalized = this.normalizeContextSummary(input, conversation);
    const existing = this.db.prepare(
      "SELECT * FROM context_summaries WHERE conversation_id=?",
    ).get(conversation.id) as ContextSummaryRow | undefined;
    const summaryVersion = (existing?.summary_version ?? 0) + 1;
    const summaryHash = stableHash(normalized);
    this.db.prepare(`
      INSERT INTO context_summaries
        (conversation_id,schema_version,summary_version,source_revision,covered_through_sequence,summary_text,tail_messages_json,summary_hash,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        schema_version=excluded.schema_version,
        summary_version=excluded.summary_version,
        source_revision=excluded.source_revision,
        covered_through_sequence=excluded.covered_through_sequence,
        summary_text=excluded.summary_text,
        tail_messages_json=excluded.tail_messages_json,
        summary_hash=excluded.summary_hash,
        created_at=excluded.created_at
    `).run(
      conversation.id,
      normalized.schemaVersion,
      summaryVersion,
      normalized.sourceRevision,
      normalized.coveredThroughSequence,
      normalized.summaryText,
      JSON.stringify(normalized.tailMessages),
      summaryHash,
      now,
    );
  }

  private validContextSummary(
    conversationId: string,
    maxSourceRevision: number,
    beforeSequence: number,
  ): ConversationContextSummaryRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM context_summaries
      WHERE conversation_id=? AND schema_version=1 AND source_revision<=? AND covered_through_sequence<?
    `).get(conversationId, maxSourceRevision, beforeSequence) as ContextSummaryRow | undefined;
    if (!row) return null;
    const mapped = mapContextSummary(row);
    const expectedHash = stableHash({
      schemaVersion: mapped.schemaVersion,
      sourceRevision: mapped.sourceRevision,
      coveredThroughSequence: mapped.coveredThroughSequence,
      summaryText: mapped.summaryText,
      tailMessages: mapped.tailMessages,
    });
    return expectedHash === mapped.summaryHash ? mapped : null;
  }

  private ownedConversation(ownerUserId: string, conversationId: string): ConversationRow {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .get(conversationId, ownerUserId) as ConversationRow | undefined;
    if (row) return row;
    const exists = this.db
      .prepare("SELECT 1 AS value FROM conversations WHERE id = ?")
      .get(conversationId) as { value: number } | undefined;
    throw new ConversationDomainError(
      exists ? "CONVERSATION_FORBIDDEN" : "CONVERSATION_NOT_FOUND",
      exists ? "无权访问该对话" : "对话不存在",
    );
  }

  private insertOutbox(
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
    now: number,
  ): void {
    this.db.prepare(`
      INSERT INTO outbox
        (id, aggregate_type, aggregate_id, event_type, schema_version, payload_json, created_at)
      VALUES (?, 'conversation', ?, ?, 1, ?, ?)
    `).run(makeId("event"), aggregateId, eventType, JSON.stringify(payload), now);
  }

  ensureConversation(input: EnsureConversationInput): ConversationRecord {
    const id = assertStableId(input.id, "conversationId");
    const owner = assertStableId(input.ownerUserId, "ownerUserId");
    const project = assertStableId(input.projectId, "projectId");
    const now = input.now ?? Date.now();
    const existing = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
      | ConversationRow
      | undefined;
    if (existing) {
      if (existing.user_id !== owner || existing.project_id !== project) {
        throw new ConversationDomainError(
          "CONVERSATION_CONFLICT",
          "对话标识已绑定到其他归属",
        );
      }
      if ((input.workspaceId ?? null) !== existing.workspace_id) {
        this.db.prepare(`
          UPDATE conversations SET workspace_id = ?, updated_at = ?, expires_at = ? WHERE id = ?
        `).run(input.workspaceId ?? null, now, now + CONVERSATION_RETENTION_MS, id);
      }
      return mapConversation(
        this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow,
      );
    }
    this.db.prepare(`
      INSERT INTO conversations
        (id,user_id,project_id,workspace_id,title,status,revision,last_sequence,created_at,updated_at,expires_at)
      VALUES (?,?,?,?,?,'active',0,0,?,?,?)
    `).run(
      id,
      owner,
      project,
      input.workspaceId ?? null,
      input.title?.trim() || null,
      now,
      now,
      now + CONVERSATION_RETENTION_MS,
    );
    this.insertOutbox(id, "conversation.created", { projectId: project }, now);
    return mapConversation(
      this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow,
    );
  }

  listConversations(ownerUserId: string, projectId: string): ConversationRecord[] {
    return (this.db.prepare(`
      SELECT * FROM conversations
      WHERE user_id = ? AND project_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, created_at DESC
    `).all(ownerUserId, projectId) as ConversationRow[]).map(mapConversation);
  }

  getProjection(ownerUserId: string, conversationId: string): ConversationProjection {
    const conversation = mapConversation(this.ownedConversation(ownerUserId, conversationId));
    const messages = (this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND status <> 'superseded'
      ORDER BY sequence ASC
    `).all(conversationId) as MessageRow[]).map(mapMessage);
    const runs = (this.db.prepare(`
      SELECT * FROM runs WHERE conversation_id = ? ORDER BY rowid ASC
    `).all(conversationId) as RunRow[]).map(mapRun);
    return { conversation, messages, runs };
  }

  getRunArtifact(
    ownerUserId: string,
    conversationId: string,
    artifactId: string,
    now = Date.now(),
  ): ConversationRunArtifactRecord {
    this.ownedConversation(ownerUserId, conversationId);
    const row = this.db.prepare(`
      SELECT * FROM run_artifacts
      WHERE id=? AND conversation_id=? AND owner_user_id=? AND expires_at>?
    `).get(
      assertStableId(artifactId, "artifactId"),
      conversationId,
      ownerUserId,
      now,
    ) as RunArtifactRow | undefined;
    if (!row) {
      throw new ConversationDomainError("CONVERSATION_NOT_FOUND", "run artifact 不存在或已过期");
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      runId: row.run_id,
      messageId: row.message_id,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
      payload: parseArray(row.payload_json),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  getReliabilitySnapshot(
    now = Date.now(),
    staleRunThresholdMs = 15 * 60 * 1000,
  ): ConversationReliabilitySnapshot {
    const counts = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM conversations) AS conversations,
        (SELECT COUNT(*) FROM messages WHERE status <> 'superseded') AS messages,
        (SELECT COUNT(*) FROM messages WHERE role='user' AND status='accepted') AS accepted_user_messages,
        (SELECT COUNT(*) FROM runs) AS runs,
        (SELECT COUNT(*) FROM context_summaries) AS context_summaries,
        (SELECT COUNT(*) FROM run_artifacts WHERE expires_at>?) AS run_artifacts,
        (SELECT COUNT(*) FROM outbox WHERE published_at IS NULL) AS outbox_pending,
        (SELECT COUNT(*) FROM outbox WHERE published_at IS NULL AND attempts>0) AS outbox_retried
    `).get(now) as Record<string, number>;
    const statusRows = this.db.prepare(
      "SELECT status, COUNT(*) AS count FROM runs GROUP BY status",
    ).all() as Array<{ status: ConversationRunRecord["status"]; count: number }>;
    const runStatus: ConversationReliabilitySnapshot["runStatus"] = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      interrupted: 0,
    };
    for (const row of statusRows) runStatus[row.status] = row.count;
    const terminalRuns =
      runStatus.completed + runStatus.failed + runStatus.cancelled + runStatus.interrupted;
    const nonterminalRuns = runStatus.queued + runStatus.running;
    const staleBefore = now - Math.max(1, staleRunThresholdMs);
    const staleNonterminalRuns = (this.db.prepare(`
      SELECT COUNT(*) AS count FROM runs
      WHERE status IN ('queued','running')
        AND COALESCE(started_at, (SELECT created_at FROM messages WHERE id=user_message_id)) <= ?
    `).get(staleBefore) as { count: number }).count;
    return {
      generatedAt: now,
      staleRunThresholdMs: Math.max(1, staleRunThresholdMs),
      totals: {
        conversations: counts.conversations,
        messages: counts.messages,
        acceptedUserMessages: counts.accepted_user_messages,
        runs: counts.runs,
        terminalRuns,
        nonterminalRuns,
        staleNonterminalRuns,
        contextSummaries: counts.context_summaries,
        runArtifacts: counts.run_artifacts,
      },
      terminalCompletenessRate:
        terminalRuns + staleNonterminalRuns > 0
          ? terminalRuns / (terminalRuns + staleNonterminalRuns)
          : null,
      runStatus,
      outbox: {
        pending: counts.outbox_pending,
        retried: counts.outbox_retried,
      },
    };
  }

  appendUserMessage(command: AppendUserMessageCommand): MessageAcceptedAck {
    const transaction = this.db.transaction(() => {
      const conversation = this.ownedConversation(command.ownerUserId, command.conversationId);
      const clientMessageId = assertStableId(command.clientMessageId, "clientMessageId");
      const content = assertMessageContent(command.content);
      const existing = this.db.prepare(`
        SELECT m.*, r.id AS run_id, r.assistant_message_id, r.accepted_revision
        FROM messages m JOIN runs r ON r.user_message_id = m.id
        WHERE m.conversation_id = ? AND m.client_message_id = ?
        ORDER BY r.rowid ASC LIMIT 1
      `).get(command.conversationId, clientMessageId) as
        | (MessageRow & { run_id: string; assistant_message_id: string; accepted_revision: number })
        | undefined;
      if (existing) {
        return {
          conversationId: command.conversationId,
          messageId: existing.id,
          assistantMessageId: existing.assistant_message_id,
          runId: existing.run_id,
          sequence: existing.sequence,
          serverCreatedAt: existing.created_at,
          conversationRevision: existing.accepted_revision,
          status: "accepted" as const,
        };
      }
      const now = command.now ?? Date.now();
      const messageId = makeId("message");
      const assistantMessageId = makeId("assistant");
      const runId = makeId("run");
      const sequence = conversation.last_sequence + 1;
      const revision = conversation.revision + 1;
      this.db.prepare(`
        INSERT INTO messages
          (id,conversation_id,client_message_id,sequence,role,kind,status,content_text,display_parts_json,created_at,metadata_json)
        VALUES (?,?,?,?,? ,?,'accepted',?,?,?,'{}')
      `).run(
        messageId,
        command.conversationId,
        clientMessageId,
        sequence,
        "user",
        command.kind ?? null,
        content,
        JSON.stringify(sanitizeDisplayParts(command.displayParts)),
        now,
      );
      this.db.prepare(`
        INSERT INTO runs
          (id,conversation_id,user_message_id,assistant_message_id,status,accepted_revision)
        VALUES (?,?,?,?,'queued',?)
      `).run(runId, command.conversationId, messageId, assistantMessageId, revision);
      const attachments = [...new Map(
        (command.attachments ?? []).map((attachment) => [attachment.storageRef, attachment]),
      ).values()];
      if (attachments.length > 30) {
        throw new ConversationDomainError("CONVERSATION_TOO_LARGE", "单条消息附件数量超出限制");
      }
      for (const attachment of attachments) {
        const storageRef = assertStableId(attachment.storageRef, "attachment storageRef");
        if (
          !Number.isSafeInteger(attachment.sizeBytes) ||
          attachment.sizeBytes < 0 ||
          attachment.sizeBytes > 20 * 1024 * 1024
        ) {
          throw new ConversationDomainError("CONVERSATION_INVALID", "附件大小无效");
        }
        const sha256 = attachment.sha256?.trim().toLowerCase() || null;
        if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) {
          throw new ConversationDomainError("CONVERSATION_INVALID", "附件摘要无效");
        }
        const mimeType = attachment.mimeType?.trim().slice(0, 255) || null;
        this.db.prepare(`
          INSERT INTO attachments
            (id,conversation_id,message_id,owner_user_id,storage_ref,sha256,mime_type,size_bytes,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
          makeId("attachment"),
          command.conversationId,
          messageId,
          command.ownerUserId,
          storageRef,
          sha256,
          mimeType,
          attachment.sizeBytes,
          now,
        );
      }
      this.db.prepare(`
        UPDATE conversations
        SET revision = ?, last_sequence = ?, updated_at = ?, expires_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        revision,
        sequence,
        now,
        now + CONVERSATION_RETENTION_MS,
        command.conversationId,
        command.ownerUserId,
      );
      this.insertOutbox(command.conversationId, "message.accepted", { runId }, now);
      return {
        conversationId: command.conversationId,
        messageId,
        assistantMessageId,
        runId,
        sequence,
        serverCreatedAt: now,
        conversationRevision: revision,
        status: "accepted" as const,
      };
    });
    return transaction();
  }

  startRun(command: StartRunCommand): RunStartAck {
    return this.db.transaction(() => {
      const conversation = this.ownedConversation(command.ownerUserId, command.conversationId);
      if (command.agentSessionId !== command.conversationId) {
        throw new ConversationDomainError("CONVERSATION_CONFLICT", "Agent Session 与对话绑定不匹配");
      }
      if (conversation.project_id !== command.projectId) {
        throw new ConversationDomainError("CONVERSATION_FORBIDDEN", "对话与项目归属不匹配");
      }
      const run = this.db.prepare(`
        SELECT * FROM runs
        WHERE id = ? AND conversation_id = ? AND user_message_id = ? AND assistant_message_id = ?
      `).get(
        command.runId,
        command.conversationId,
        command.messageId,
        command.assistantMessageId,
      ) as RunRow | undefined;
      if (!run) {
        throw new ConversationDomainError("CONVERSATION_CONFLICT", "run 身份不匹配");
      }
      if (isTerminalRunStatus(run.status)) {
        throw new ConversationDomainError("CONVERSATION_CONFLICT", "run 已终结");
      }
      const now = command.now ?? Date.now();
      let revision = conversation.revision;
      if (run.status === "queued") {
        revision += 1;
        this.db.prepare(`
          UPDATE runs SET status='running', started_at=?, started_revision=?, model_provider=?, model_id=?, trace_id=?
          WHERE id=?
        `).run(
          now,
          revision,
          command.modelProvider ?? null,
          command.modelId ?? null,
          command.traceId ?? null,
          run.id,
        );
        this.db.prepare(`
          UPDATE conversations SET revision=?, updated_at=?, expires_at=? WHERE id=? AND user_id=?
        `).run(revision, now, now + CONVERSATION_RETENTION_MS, conversation.id, command.ownerUserId);
        this.insertOutbox(conversation.id, "run.started", { runId: run.id }, now);
      }
      const current = this.db.prepare("SELECT * FROM messages WHERE id = ? AND conversation_id = ?")
        .get(command.messageId, command.conversationId) as MessageRow | undefined;
      if (!current || current.role !== "user" || current.status === "superseded") {
        throw new ConversationDomainError("CONVERSATION_CONFLICT", "user message 无效");
      }
      const contextSummary = this.validContextSummary(
        command.conversationId,
        run.accepted_revision,
        current.sequence,
      );
      const history = (this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ? AND sequence > ? AND sequence < ? AND status <> 'superseded'
        ORDER BY sequence ASC
      `).all(
        command.conversationId,
        contextSummary?.coveredThroughSequence ?? 0,
        current.sequence,
      ) as MessageRow[]).map(mapMessage);
      return {
        conversationId: command.conversationId,
        runId: run.id,
        messageId: current.id,
        assistantMessageId: run.assistant_message_id,
        conversationRevision: run.status === "running" && run.started_revision !== null
          ? run.started_revision
          : revision,
        historyBaseRevision: Math.max(0, run.accepted_revision - 1),
        historyBeforeRun: history,
        currentUserMessage: mapMessage(current),
        contextSummary,
      };
    })();
  }

  commitRunTerminal(command: CommitRunTerminalCommand): RunTerminalAck {
    return this.db.transaction(() => {
      const conversation = this.ownedConversation(command.ownerUserId, command.conversationId);
      if (conversation.project_id !== command.projectId) {
        throw new ConversationDomainError("CONVERSATION_FORBIDDEN", "对话与项目归属不匹配");
      }
      const run = this.db.prepare(`
        SELECT * FROM runs
        WHERE id=? AND conversation_id=? AND user_message_id=? AND assistant_message_id=?
      `).get(command.runId, command.conversationId, command.messageId, command.assistantMessageId) as
        | RunRow
        | undefined;
      if (!run) throw new ConversationDomainError("CONVERSATION_CONFLICT", "run 身份不匹配");
      const sanitizedDisplayPayload = sanitizeDisplayPartsPayload(command.displayParts);
      const artifactPayloadJson = JSON.stringify(sanitizedDisplayPayload);
      const artifactSizeBytes = Buffer.byteLength(artifactPayloadJson, "utf8");
      const artifactSha256 = crypto.createHash("sha256").update(artifactPayloadJson).digest("hex");
      const artifactId = `artifact-${stableHash({
        conversationId: command.conversationId,
        runId: command.runId,
        sha256: artifactSha256,
      }).slice(0, 40)}`;
      const shouldPersistArtifact =
        command.status === "completed" &&
        artifactSizeBytes > MAX_DISPLAY_PARTS_BYTES &&
        artifactSizeBytes <= MAX_RUN_ARTIFACT_BYTES;
      const displayParts = shouldPersistArtifact
        ? [{
            type: "artifact",
            status: "available",
            artifactRef: artifactId,
            mimeType: "application/json",
            sizeBytes: artifactSizeBytes,
            sha256: artifactSha256,
          }]
        : artifactSizeBytes > MAX_RUN_ARTIFACT_BYTES
          ? [{ type: "artifact", status: "omitted", reason: "run_artifact_too_large" }]
          : sanitizeDisplayParts(command.displayParts);
      const terminalHash = stableHash({
        status: command.status,
        content: command.content ?? "",
        displayParts,
        errorCode: command.errorCode ?? null,
        usage: command.usage ?? {},
        summary: command.summary ?? {},
        contextSummary: command.contextSummary ?? null,
      });
      if (isTerminalRunStatus(run.status)) {
        if (run.status !== command.status || run.terminal_hash !== terminalHash) {
          throw new ConversationDomainError("CONVERSATION_CONFLICT", "run 终态与已提交内容冲突");
        }
        const assistant = this.db.prepare("SELECT * FROM messages WHERE id=?").get(run.assistant_message_id) as
          | MessageRow
          | undefined;
        return {
          conversationId: command.conversationId,
          runId: run.id,
          messageId: run.user_message_id,
          assistantMessageId: run.assistant_message_id,
          status: command.status,
          conversationRevision: run.terminal_revision ?? conversation.revision,
          assistantMessage: assistant ? mapMessage(assistant) : null,
        };
      }
      const now = command.now ?? Date.now();
      if (command.contextSummary) {
        this.persistContextSummary(conversation, command.contextSummary, now);
      }
      let sequence = conversation.last_sequence;
      let assistant: MessageRow | undefined;
      if (command.status === "completed") {
        const content = assertMessageContent(command.content ?? "");
        sequence += 1;
        this.db.prepare(`
          INSERT INTO messages
            (id,conversation_id,client_message_id,sequence,role,status,content_text,display_parts_json,created_at,completed_at,metadata_json)
          VALUES (?,?,NULL,?,'assistant','completed',?,?,?,?,?)
        `).run(
          command.assistantMessageId,
          command.conversationId,
          sequence,
          content,
          JSON.stringify(displayParts),
          now,
          now,
          JSON.stringify({ runId: run.id }),
        );
        assistant = this.db.prepare("SELECT * FROM messages WHERE id=?")
          .get(command.assistantMessageId) as MessageRow;
        if (shouldPersistArtifact) {
          this.db.prepare(`
            INSERT INTO run_artifacts
              (id,conversation_id,run_id,message_id,owner_user_id,mime_type,size_bytes,sha256,payload_json,created_at,expires_at)
            VALUES (?,?,?,?,?,'application/json',?,?,?,?,?)
          `).run(
            artifactId,
            command.conversationId,
            run.id,
            command.assistantMessageId,
            command.ownerUserId,
            artifactSizeBytes,
            artifactSha256,
            artifactPayloadJson,
            now,
            now + CONVERSATION_RETENTION_MS,
          );
        }
      }
      const revision = conversation.revision + 1;
      this.db.prepare(`
        UPDATE runs SET status=?, finished_at=?, error_code=?, usage_json=?, summary_json=?,
          trace_id=COALESCE(?,trace_id), terminal_hash=?, terminal_revision=? WHERE id=?
      `).run(
        command.status,
        now,
        command.errorCode ?? null,
        JSON.stringify(command.usage ?? {}),
        JSON.stringify(command.summary ?? {}),
        command.traceId ?? null,
        terminalHash,
        revision,
        run.id,
      );
      this.db.prepare(`
        UPDATE conversations SET revision=?, last_sequence=?, updated_at=?, expires_at=?
        WHERE id=? AND user_id=?
      `).run(
        revision,
        sequence,
        now,
        now + CONVERSATION_RETENTION_MS,
        conversation.id,
        command.ownerUserId,
      );
      this.insertOutbox(conversation.id, "run.terminal", { runId: run.id, status: command.status }, now);
      return {
        conversationId: command.conversationId,
        runId: run.id,
        messageId: run.user_message_id,
        assistantMessageId: run.assistant_message_id,
        status: command.status,
        conversationRevision: revision,
        assistantMessage: assistant ? mapMessage(assistant) : null,
      };
    })();
  }

  requestRunCancellation(input: {
    ownerUserId: string;
    conversationId: string;
    runId: string;
    now?: number;
  }): CancelRunAck {
    return this.db.transaction(() => {
      const conversation = this.ownedConversation(input.ownerUserId, input.conversationId);
      const run = this.db.prepare("SELECT * FROM runs WHERE id=? AND conversation_id=?")
        .get(input.runId, input.conversationId) as RunRow | undefined;
      if (!run) throw new ConversationDomainError("CONVERSATION_NOT_FOUND", "run 不存在");
      const now = input.now ?? Date.now();
      if (run.status === "queued") {
        const revision = conversation.revision + 1;
        this.db.prepare(`
          UPDATE runs SET status='cancelled',cancel_requested_at=?,finished_at=?,
            terminal_revision=?,error_code=NULL,terminal_hash=? WHERE id=?
        `).run(
          now,
          now,
          revision,
          stableHash({ status: "cancelled" }),
          run.id,
        );
        this.db.prepare(`
          UPDATE conversations SET revision=?,updated_at=?,expires_at=? WHERE id=? AND user_id=?
        `).run(
          revision,
          now,
          now + CONVERSATION_RETENTION_MS,
          conversation.id,
          input.ownerUserId,
        );
        this.insertOutbox(
          conversation.id,
          "run.terminal",
          { runId: run.id, status: "cancelled" },
          now,
        );
        return {
          conversationId: input.conversationId,
          runId: run.id,
          status: "cancelled" as const,
          cancelRequested: true as const,
          conversationRevision: revision,
        };
      }
      if (!isTerminalRunStatus(run.status) && run.cancel_requested_at === null) {
        this.db.prepare("UPDATE runs SET cancel_requested_at=? WHERE id=?").run(now, run.id);
      }
      return {
        conversationId: input.conversationId,
        runId: run.id,
        status: run.status,
        cancelRequested: true as const,
        conversationRevision: conversation.revision,
      };
    })();
  }

  retryRun(input: {
    ownerUserId: string;
    conversationId: string;
    userMessageId: string;
    now?: number;
  }): MessageAcceptedAck {
    return this.db.transaction(() => {
      const conversation = this.ownedConversation(input.ownerUserId, input.conversationId);
      const message = this.db.prepare(`
        SELECT * FROM messages WHERE id=? AND conversation_id=? AND role='user' AND status <> 'superseded'
      `).get(input.userMessageId, input.conversationId) as MessageRow | undefined;
      if (!message) throw new ConversationDomainError("CONVERSATION_NOT_FOUND", "user message 不存在");
      const now = input.now ?? Date.now();
      const runId = makeId("run");
      const assistantMessageId = makeId("assistant");
      const revision = conversation.revision + 1;
      const nonterminalRuns = this.db.prepare(`
        SELECT id FROM runs
        WHERE conversation_id=? AND user_message_id=? AND status IN ('queued','running')
      `).all(input.conversationId, message.id) as Array<{ id: string }>;
      for (const existingRun of nonterminalRuns) {
        this.db.prepare(`
          UPDATE runs SET status='interrupted',finished_at=?,error_code='RETRIED',
            terminal_revision=?,terminal_hash=? WHERE id=?
        `).run(
          now,
          revision,
          stableHash({ status: "interrupted", errorCode: "RETRIED" }),
          existingRun.id,
        );
        this.insertOutbox(
          conversation.id,
          "run.terminal",
          { runId: existingRun.id, status: "interrupted" },
          now,
        );
      }
      this.db.prepare(`
        INSERT INTO runs (id,conversation_id,user_message_id,assistant_message_id,status,accepted_revision)
        VALUES (?,?,?,?,'queued',?)
      `).run(runId, input.conversationId, message.id, assistantMessageId, revision);
      this.db.prepare(`
        UPDATE conversations SET revision=?,updated_at=?,expires_at=? WHERE id=? AND user_id=?
      `).run(revision, now, now + CONVERSATION_RETENTION_MS, conversation.id, input.ownerUserId);
      this.insertOutbox(conversation.id, "run.retried", { runId }, now);
      return {
        conversationId: conversation.id,
        messageId: message.id,
        assistantMessageId,
        runId,
        sequence: message.sequence,
        serverCreatedAt: message.created_at,
        conversationRevision: revision,
        status: "accepted" as const,
      };
    })();
  }

  supersede(input: {
    ownerUserId: string;
    conversationId: string;
    afterMessageId: string | null;
    expectedRevision: number;
    now?: number;
  }): ConversationProjection {
    return this.db.transaction(() => {
      const conversation = this.ownedConversation(input.ownerUserId, input.conversationId);
      if (conversation.revision !== input.expectedRevision) {
        throw new ConversationDomainError("CONVERSATION_CONFLICT", "conversation revision 冲突");
      }
      let anchorSequence = 0;
      if (input.afterMessageId) {
        const anchor = this.db.prepare("SELECT sequence FROM messages WHERE id=? AND conversation_id=?")
          .get(input.afterMessageId, input.conversationId) as { sequence: number } | undefined;
        if (!anchor) throw new ConversationDomainError("CONVERSATION_NOT_FOUND", "截断锚点不存在");
        anchorSequence = anchor.sequence;
      }
      const now = input.now ?? Date.now();
      this.db.prepare(`
        UPDATE runs SET status='interrupted', finished_at=?, error_code='SUPERSEDED',
          terminal_hash=COALESCE(terminal_hash, ?)
        WHERE conversation_id=? AND status IN ('queued','running') AND user_message_id IN (
          SELECT id FROM messages WHERE conversation_id=? AND sequence > ?
        )
      `).run(now, stableHash({ status: "interrupted", errorCode: "SUPERSEDED" }), input.conversationId, input.conversationId, anchorSequence);
      this.db.prepare(`
        UPDATE messages SET status='superseded', completed_at=COALESCE(completed_at,?)
        WHERE conversation_id=? AND sequence > ? AND status <> 'superseded'
      `).run(now, input.conversationId, anchorSequence);
      this.db.prepare("DELETE FROM context_summaries WHERE conversation_id=?")
        .run(input.conversationId);
      const revision = conversation.revision + 1;
      this.db.prepare(`
        UPDATE conversations SET revision=?,updated_at=?,expires_at=? WHERE id=? AND user_id=?
      `).run(revision, now, now + CONVERSATION_RETENTION_MS, conversation.id, input.ownerUserId);
      this.insertOutbox(conversation.id, "conversation.superseded", { afterSequence: anchorSequence }, now);
      return this.getProjection(input.ownerUserId, input.conversationId);
    })();
  }

  updateTitle(input: {
    ownerUserId: string;
    conversationId: string;
    title: string;
    now?: number;
  }): ConversationRecord {
    const conversation = this.ownedConversation(input.ownerUserId, input.conversationId);
    const title = input.title.trim().slice(0, 120);
    if (!title) throw new ConversationDomainError("CONVERSATION_INVALID", "标题不能为空");
    const now = input.now ?? Date.now();
    this.db.prepare(`
      UPDATE conversations SET title=?,revision=revision+1,updated_at=?,expires_at=? WHERE id=? AND user_id=?
    `).run(title, now, now + CONVERSATION_RETENTION_MS, conversation.id, input.ownerUserId);
    return mapConversation(this.ownedConversation(input.ownerUserId, input.conversationId));
  }

  markAttachmentDeleted(input: {
    ownerUserId: string;
    conversationId: string;
    storageRefs: string[];
    now?: number;
  }): number {
    return this.db.transaction(() => {
      this.ownedConversation(input.ownerUserId, input.conversationId);
      const refs = [...new Set(input.storageRefs.map((ref) => assertStableId(ref, "attachment storageRef")))];
      if (refs.length === 0) return 0;
      const statement = this.db.prepare(`
        UPDATE attachments SET deleted_at=?
        WHERE conversation_id=? AND owner_user_id=? AND storage_ref=? AND deleted_at IS NULL
      `);
      let changed = 0;
      const now = input.now ?? Date.now();
      for (const storageRef of refs) {
        changed += statement.run(
          now,
          input.conversationId,
          input.ownerUserId,
          storageRef,
        ).changes;
      }
      return changed;
    })();
  }

  deleteConversation(
    ownerUserId: string,
    conversationId: string,
  ): ConversationDeletionScope {
    return this.db.transaction(() => {
      const conversation = this.ownedConversation(ownerUserId, conversationId);
      this.db.prepare("DELETE FROM outbox WHERE aggregate_id=?").run(conversationId);
      this.insertOutbox(conversationId, "conversation.deleted", { reason: "user_request" }, Date.now());
      this.db.prepare("DELETE FROM conversations WHERE id=? AND user_id=?").run(conversationId, ownerUserId);
      return {
        conversationId,
        ownerUserId,
        projectId: conversation.project_id,
      };
    })();
  }

  deleteExpired(now = Date.now()): ConversationDeletionScope[] {
    return this.db.transaction(() => {
      this.db.prepare("DELETE FROM run_artifacts WHERE expires_at <= ?").run(now);
      const conversations = this.db.prepare(`
        SELECT id, user_id, project_id FROM conversations WHERE expires_at <= ?
      `).all(now) as Array<{ id: string; user_id: string; project_id: string }>;
      for (const { id } of conversations) {
        this.db.prepare("DELETE FROM outbox WHERE aggregate_id=?").run(id);
        this.insertOutbox(id, "conversation.deleted", { reason: "retention_expired" }, now);
        this.db.prepare("DELETE FROM conversations WHERE id=?").run(id);
      }
      return conversations.map((conversation) => ({
        conversationId: conversation.id,
        ownerUserId: conversation.user_id,
        projectId: conversation.project_id,
      }));
    })();
  }

  reconcileInterrupted(startedBefore: number, now = Date.now()): number {
    return this.db.transaction(() => {
      const runs = this.db.prepare(`
        SELECT r.*, c.user_id, c.revision, c.last_sequence
        FROM runs r JOIN conversations c ON c.id=r.conversation_id
        WHERE r.status IN ('queued','running') AND COALESCE(r.started_at, 0) < ?
      `).all(startedBefore) as Array<RunRow & { user_id: string; revision: number; last_sequence: number }>;
      for (const run of runs) {
        const currentConversation = this.db.prepare("SELECT revision FROM conversations WHERE id=?")
          .get(run.conversation_id) as { revision: number };
        const terminalRevision = currentConversation.revision + 1;
        const status = run.cancel_requested_at !== null ? "cancelled" : "interrupted";
        const errorCode = run.cancel_requested_at !== null ? "USER_CANCELLED" : "PROCESS_RESTART";
        const terminalHash = stableHash({ status, errorCode });
        this.db.prepare(`
          UPDATE runs SET status=?,finished_at=?,error_code=?,terminal_hash=?,terminal_revision=? WHERE id=?
        `).run(status, now, errorCode, terminalHash, terminalRevision, run.id);
        this.db.prepare(`
          UPDATE conversations SET revision=?,updated_at=? WHERE id=?
        `).run(terminalRevision, now, run.conversation_id);
        this.insertOutbox(run.conversation_id, "run.terminal", { runId: run.id, status }, now);
      }
      return runs.length;
    })();
  }

  listPendingOutbox(limit = 100): ConversationOutboxEvent[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = this.db.prepare(`
      SELECT id, aggregate_id, event_type, schema_version, payload_json, created_at, attempts
      FROM outbox WHERE published_at IS NULL ORDER BY created_at ASC, rowid ASC LIMIT ?
    `).all(boundedLimit) as Array<{
      id: string;
      aggregate_id: string;
      event_type: string;
      schema_version: number;
      payload_json: string;
      created_at: number;
      attempts: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      payload: parseObject(row.payload_json),
      createdAt: row.created_at,
      attempts: row.attempts,
    }));
  }

  markOutboxPublished(eventId: string, publishedAt = Date.now()): void {
    this.db.prepare(`
      UPDATE outbox SET published_at=?, last_error=NULL WHERE id=? AND published_at IS NULL
    `).run(publishedAt, assertStableId(eventId, "eventId"));
  }

  markOutboxFailed(eventId: string, error: string): void {
    this.db.prepare(`
      UPDATE outbox SET attempts=attempts+1,last_error=? WHERE id=? AND published_at IS NULL
    `).run(error.slice(0, 500), assertStableId(eventId, "eventId"));
  }

  quickCheck(): boolean {
    const row = this.db.prepare("PRAGMA quick_check").get() as { quick_check: string };
    return row.quick_check === "ok";
  }

  async backup(destinationPath: string): Promise<void> {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    await this.db.backup(destinationPath);
  }

  close(): void {
    this.db.close();
  }
}

import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

import { getDataDir } from "@/lib/fs-utils";
import {
  type EditorDiagnosticAgentRunLogIndex,
  type EditorDiagnosticEvent,
  type EditorDiagnosticExport,
  type NormalizedEditorDiagnosticEvent,
  isValidEditorSessionId,
  normalizeEditorDiagnosticEvent,
  sanitizeDiagnosticEvent,
} from "./types";

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;
const TRIM_TO_BYTES = 4 * 1024 * 1024;

interface EditorEventRow {
  id: string;
  ts: string;
  schema_version: number;
  source: string;
  level: string;
  event_group: string;
  event_type: string;
  project_id: string | null;
  session_id: string | null;
  workspace_id: string | null;
  editor_session_id: string | null;
  trace_id: string | null;
  operation_id: string | null;
  page_id: string | null;
  resource_path: string | null;
  message: string | null;
  payload_json: string;
}

function getDiagnosticsDir(): string {
  return path.join(getDataDir(), "editor-diagnostics");
}

function getDiagnosticsDbDir(): string {
  return path.join(getDataDir(), "diagnostics");
}

function getDiagnosticsDbPath(): string {
  return path.join(getDiagnosticsDbDir(), "editor-events.db");
}

function getDiagnosticsPath(editorSessionId: string): string {
  if (!isValidEditorSessionId(editorSessionId)) {
    throw new Error("INVALID_EDITOR_SESSION_ID");
  }
  return path.join(getDiagnosticsDir(), `${editorSessionId}.jsonl`);
}

async function ensureDiagnosticsDir(): Promise<void> {
  await fs.promises.mkdir(getDiagnosticsDir(), { recursive: true });
}

function ensureDiagnosticsDb(): Database.Database {
  fs.mkdirSync(getDiagnosticsDbDir(), { recursive: true });
  const db = new Database(getDiagnosticsDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS editor_events (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      source TEXT NOT NULL,
      level TEXT NOT NULL,
      event_group TEXT NOT NULL,
      event_type TEXT NOT NULL,
      project_id TEXT,
      session_id TEXT,
      workspace_id TEXT,
      editor_session_id TEXT,
      trace_id TEXT,
      operation_id TEXT,
      page_id TEXT,
      resource_path TEXT,
      message TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_editor_events_project_ts ON editor_events(project_id, ts);
    CREATE INDEX IF NOT EXISTS idx_editor_events_session_ts ON editor_events(session_id, ts);
    CREATE INDEX IF NOT EXISTS idx_editor_events_editor_session ON editor_events(editor_session_id, ts);
    CREATE INDEX IF NOT EXISTS idx_editor_events_trace ON editor_events(trace_id, ts);
    CREATE INDEX IF NOT EXISTS idx_editor_events_operation ON editor_events(operation_id, ts);
    CREATE INDEX IF NOT EXISTS idx_editor_events_workspace ON editor_events(workspace_id, ts);
    CREATE INDEX IF NOT EXISTS idx_editor_events_type_ts ON editor_events(event_type, ts);
  `);
  return db;
}

async function trimIfNeeded(filePath: string, appendBytes: number): Promise<void> {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat || stat.size + appendBytes <= MAX_LOG_FILE_BYTES) return;

  const current = await fs.promises.readFile(filePath, "utf8");
  const lines = current.trimEnd().split("\n");
  const kept: string[] = [];
  let size = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const lineBytes = Buffer.byteLength(`${line}\n`);
    if (size + lineBytes > TRIM_TO_BYTES) break;
    kept.unshift(line);
    size += lineBytes;
  }
  await fs.promises.writeFile(filePath, `${kept.join("\n")}\n`, "utf8");
}

function insertSqliteEvents(events: NormalizedEditorDiagnosticEvent[]): number {
  const db = ensureDiagnosticsDb();
  try {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO editor_events (
        id,
        ts,
        schema_version,
        source,
        level,
        event_group,
        event_type,
        project_id,
        session_id,
        workspace_id,
        editor_session_id,
        trace_id,
        operation_id,
        page_id,
        resource_path,
        message,
        payload_json
      ) VALUES (
        @id,
        @ts,
        @schemaVersion,
        @source,
        @level,
        @eventGroup,
        @eventType,
        @projectId,
        @sessionId,
        @workspaceId,
        @editorSessionId,
        @traceId,
        @operationId,
        @pageId,
        @resourcePath,
        @message,
        @payloadJson
      )
    `);

    const write = db.transaction((items: NormalizedEditorDiagnosticEvent[]) => {
      let written = 0;
      for (const event of items) {
        const result = insert.run({
          id: event.id,
          ts: event.ts,
          schemaVersion: event.schemaVersion,
          source: event.source,
          level: event.level,
          eventGroup: event.eventGroup,
          eventType: event.eventType,
          projectId: event.projectId ?? null,
          sessionId: event.sessionId ?? null,
          workspaceId: event.workspaceId ?? null,
          editorSessionId: event.editorSessionId ?? null,
          traceId: event.traceId ?? null,
          operationId: event.operationId ?? null,
          pageId: event.pageId ?? null,
          resourcePath: event.resourcePath ?? null,
          message: event.message ?? null,
          payloadJson: JSON.stringify(event.payload),
        });
        written += result.changes;
      }
      return written;
    });

    return write(events) as number;
  } finally {
    db.close();
  }
}

function rowToEvent(row: EditorEventRow): NormalizedEditorDiagnosticEvent {
  return {
    id: row.id,
    ts: row.ts,
    schemaVersion: row.schema_version,
    source: row.source as NormalizedEditorDiagnosticEvent["source"],
    level: row.level as NormalizedEditorDiagnosticEvent["level"],
    eventGroup: row.event_group as NormalizedEditorDiagnosticEvent["eventGroup"],
    eventType: row.event_type,
    projectId: row.project_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    workspaceId: row.workspace_id ?? undefined,
    editorSessionId: row.editor_session_id ?? undefined,
    traceId: row.trace_id ?? undefined,
    operationId: row.operation_id ?? undefined,
    pageId: row.page_id ?? undefined,
    resourcePath: row.resource_path ?? undefined,
    message: row.message ?? undefined,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
}

export async function appendEditorDiagnosticEvents(
  events: EditorDiagnosticEvent[],
): Promise<{
  written: number;
  sqliteWritten: number;
  editorSessionId: string;
  diagnostics: {
    sqliteUsed: boolean;
    jsonlFallbackUsed: boolean;
    dbUnavailable: boolean;
    eventGapDetected: boolean;
    warnings: string[];
  };
}> {
  if (events.length === 0) {
    throw new Error("NO_EVENTS");
  }

  const editorSessionId = events[0].editorSessionId;
  if (!isValidEditorSessionId(editorSessionId)) {
    throw new Error("INVALID_EDITOR_SESSION_ID");
  }
  if (events.some((event) => event.editorSessionId !== editorSessionId)) {
    throw new Error("MIXED_EDITOR_SESSION_ID");
  }

  const sanitized = events.map(sanitizeDiagnosticEvent);
  const payload = sanitized.map((event) => JSON.stringify(event)).join("\n") + "\n";
  const filePath = getDiagnosticsPath(editorSessionId);

  await ensureDiagnosticsDir();
  await trimIfNeeded(filePath, Buffer.byteLength(payload));
  await fs.promises.appendFile(filePath, payload, "utf8");

  const normalized = sanitized.map((event) =>
    normalizeEditorDiagnosticEvent(event, "frontend"),
  );
  const warnings: string[] = [];
  let sqliteWritten = 0;
  let dbUnavailable = false;
  try {
    sqliteWritten = insertSqliteEvents(normalized);
  } catch (error) {
    dbUnavailable = true;
    warnings.push(
      `SQLite 事件库写入失败，已保留 JSONL 兜底: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    written: sanitized.length,
    sqliteWritten,
    editorSessionId,
    diagnostics: {
      sqliteUsed: !dbUnavailable,
      jsonlFallbackUsed: true,
      dbUnavailable,
      eventGapDetected: dbUnavailable,
      warnings,
    },
  };
}

export async function readEditorDiagnosticEvents(
  editorSessionId: string,
): Promise<EditorDiagnosticEvent[]> {
  const filePath = getDiagnosticsPath(editorSessionId);
  const content = await fs.promises.readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  if (!content.trim()) return [];

  const events: EditorDiagnosticEvent[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as EditorDiagnosticEvent);
    } catch {
      events.push({
        id: `invalid-${events.length}`,
        editorSessionId,
        projectId: "unknown",
        timestamp: Date.now(),
        category: "system",
        name: "diagnostic.invalid_jsonl_line",
        level: "warn",
      });
    }
  }
  return events;
}

async function listJsonlDiagnosticEvents(): Promise<NormalizedEditorDiagnosticEvent[]> {
  const dir = getDiagnosticsDir();
  const entries = await fs.promises.readdir(dir).catch(() => []);
  const all: NormalizedEditorDiagnosticEvent[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const editorSessionId = entry.replace(/\.jsonl$/, "");
    const legacyEvents = await readEditorDiagnosticEvents(editorSessionId);
    all.push(
      ...legacyEvents.map((event) => normalizeEditorDiagnosticEvent(event, "frontend")),
    );
  }
  return all;
}

export async function queryEditorDiagnosticEvents(options: {
  projectId?: string;
  sessionId?: string;
  workspaceId?: string;
  editorSessionId?: string;
  traceId?: string;
  operationId?: string;
  eventType?: string;
  since?: string;
  limit?: number;
}): Promise<{
  events: NormalizedEditorDiagnosticEvent[];
  diagnostics: EditorDiagnosticExport["diagnostics"];
}> {
  const warnings: string[] = [];
  let sqliteEvents: NormalizedEditorDiagnosticEvent[] = [];
  let sqliteUsed = false;
  let dbUnavailable = false;

  try {
    const db = ensureDiagnosticsDb();
    try {
      const clauses: string[] = [];
      const params: Record<string, string | number> = {
        limit: Math.max(1, Math.min(options.limit ?? 200, 1000)),
      };
      if (options.projectId) {
        clauses.push("project_id = @projectId");
        params.projectId = options.projectId;
      }
      if (options.sessionId) {
        clauses.push("session_id = @sessionId");
        params.sessionId = options.sessionId;
      }
      if (options.workspaceId) {
        clauses.push("workspace_id = @workspaceId");
        params.workspaceId = options.workspaceId;
      }
      if (options.editorSessionId) {
        clauses.push("editor_session_id = @editorSessionId");
        params.editorSessionId = options.editorSessionId;
      }
      if (options.traceId) {
        clauses.push("trace_id = @traceId");
        params.traceId = options.traceId;
      }
      if (options.operationId) {
        clauses.push("operation_id = @operationId");
        params.operationId = options.operationId;
      }
      if (options.eventType) {
        clauses.push("event_type = @eventType");
        params.eventType = options.eventType;
      }
      if (options.since) {
        clauses.push("ts >= @since");
        params.since = options.since;
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db.prepare(`
        SELECT * FROM editor_events
        ${where}
        ORDER BY ts DESC
        LIMIT @limit
      `).all(params) as EditorEventRow[];
      sqliteEvents = rows.map(rowToEvent).reverse();
      sqliteUsed = true;
    } finally {
      db.close();
    }
  } catch (error) {
    dbUnavailable = true;
    warnings.push(
      `SQLite 事件库不可用，已尝试 JSONL 兜底: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (sqliteUsed && sqliteEvents.length > 0) {
    return {
      events: sqliteEvents,
      diagnostics: {
        sqliteUsed,
        jsonlFallbackUsed: false,
        dbUnavailable,
        eventGapDetected: false,
        warnings,
      },
    };
  }

  const fallback = await listJsonlDiagnosticEvents();
  const filtered = fallback
    .filter((event) => !options.projectId || event.projectId === options.projectId)
    .filter((event) => !options.sessionId || event.sessionId === options.sessionId)
    .filter((event) => !options.workspaceId || event.workspaceId === options.workspaceId)
    .filter((event) => !options.editorSessionId || event.editorSessionId === options.editorSessionId)
    .filter((event) => !options.traceId || event.traceId === options.traceId)
    .filter((event) => !options.operationId || event.operationId === options.operationId)
    .filter((event) => !options.eventType || event.eventType === options.eventType)
    .filter((event) => !options.since || event.ts >= options.since)
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-(options.limit ?? 200));

  return {
    events: filtered,
    diagnostics: {
      sqliteUsed,
      jsonlFallbackUsed: true,
      dbUnavailable,
      eventGapDetected: !sqliteUsed || dbUnavailable,
      warnings,
    },
  };
}

async function listAgentRunLogs(
  sessionIds: string[],
): Promise<EditorDiagnosticAgentRunLogIndex[]> {
  const root = path.join(getDataDir(), "agent-run-logs");
  const result: EditorDiagnosticAgentRunLogIndex[] = [];
  for (const sessionId of sessionIds) {
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(sessionId)) continue;
    const dir = path.join(root, sessionId);
    const entries = await fs.promises.readdir(dir).catch(() => []);
    const messageIds = entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => entry.replace(/\.jsonl$/, ""))
      .sort();
    if (messageIds.length > 0) {
      result.push({ sessionId, messageIds });
    }
  }
  return result;
}

export async function buildEditorDiagnosticExport(
  editorSessionId: string,
): Promise<EditorDiagnosticExport> {
  if (!isValidEditorSessionId(editorSessionId)) {
    throw new Error("INVALID_EDITOR_SESSION_ID");
  }
  const events = await readEditorDiagnosticEvents(editorSessionId);
  const normalizedEvents = events.map((event) =>
    normalizeEditorDiagnosticEvent(event, "frontend"),
  );
  const queried = await queryEditorDiagnosticEvents({ editorSessionId });
  const sessionIds = Array.from(
    new Set(events.map((event) => event.sessionId).filter(Boolean) as string[]),
  );

  return {
    editorSessionId,
    exportedAt: Date.now(),
    events,
    normalizedEvents: queried.events.length > 0 ? queried.events : normalizedEvents,
    agentRunLogs: await listAgentRunLogs(sessionIds),
    diagnostics: queried.diagnostics,
    warnings: [
      ...(events.length === 0 ? ["未找到后端诊断事件"] : []),
      ...queried.diagnostics.warnings,
    ],
  };
}

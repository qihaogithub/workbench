import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

import { outputJson, showInfo, showWarning } from "../utils.js";

type EditorDiagnosticLevel = "debug" | "info" | "warn" | "error";
type EditorDiagnosticSource =
  | "frontend"
  | "author-api"
  | "agent-service"
  | "preview"
  | "ai-run"
  | "cli";
type EditorDiagnosticEventGroup =
  | "collab"
  | "autosave"
  | "ai"
  | "preview"
  | "project"
  | "publish"
  | "page"
  | "ui"
  | "system";

interface EditorDiagnosticEvent {
  id: string;
  schemaVersion: number;
  ts: string;
  source: EditorDiagnosticSource;
  level: EditorDiagnosticLevel;
  eventGroup: EditorDiagnosticEventGroup;
  eventType: string;
  projectId?: string;
  sessionId?: string;
  workspaceId?: string;
  editorSessionId?: string;
  traceId?: string;
  operationId?: string;
  pageId?: string;
  resourcePath?: string;
  message?: string;
  payload: Record<string, unknown>;
}

interface LegacyEditorDiagnosticEvent {
  id: string;
  timestamp: number;
  category: EditorDiagnosticEventGroup;
  name: string;
  editorSessionId: string;
  projectId: string;
  sessionId?: string;
  workspaceId?: string;
  activePageId?: string;
  traceId?: string;
  level?: EditorDiagnosticLevel;
  details?: Record<string, unknown>;
}

interface EditorDiagnosticQueryDiagnostics {
  sqliteUsed: boolean;
  jsonlFallbackUsed: boolean;
  dbUnavailable: boolean;
  eventGapDetected: boolean;
  warnings: string[];
}

interface DiagnosticsOptions {
  project?: string;
  session?: string;
  workspace?: string;
  editorSession?: string;
  trace?: string;
  operation?: string;
  since?: string;
  limit?: string;
  format?: "json" | "text";
  dataDir?: string;
  output?: string;
}

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

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

function getDataDir(options: DiagnosticsOptions): string {
  return path.resolve(
    options.dataDir ||
      process.env.DATA_DIR ||
      path.join(findProjectRoot(process.cwd()), "data"),
  );
}

function parseSince(value: string | undefined, fallbackHours?: number): string | undefined {
  if (!value && fallbackHours === undefined) return undefined;
  if (!value && fallbackHours !== undefined) {
    return new Date(Date.now() - fallbackHours * 60 * 60 * 1000).toISOString();
  }
  const raw = value || "";
  if (/^\d+h$/.test(raw)) {
    const hours = Number(raw.slice(0, -1));
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }
  if (/^\d+d$/.test(raw)) {
    const days = Number(raw.slice(0, -1));
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return undefined;
}

function toLimit(value: string | undefined): number {
  const parsed = Number(value || "200");
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(Math.trunc(parsed), 1000));
}

function rowToEvent(row: EditorEventRow): EditorDiagnosticEvent {
  return {
    id: row.id,
    ts: row.ts,
    schemaVersion: row.schema_version,
    source: row.source as EditorDiagnosticEvent["source"],
    level: row.level as EditorDiagnosticEvent["level"],
    eventGroup: row.event_group as EditorDiagnosticEvent["eventGroup"],
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

function normalizeEditorDiagnosticEvent(
  event: LegacyEditorDiagnosticEvent | EditorDiagnosticEvent,
): EditorDiagnosticEvent {
  if ("schemaVersion" in event && "eventType" in event) return event;
  return {
    id: event.id,
    schemaVersion: 1,
    ts: new Date(event.timestamp).toISOString(),
    source: "frontend",
    level: event.level ?? "info",
    eventGroup: event.category,
    eventType: event.name,
    projectId: event.projectId,
    sessionId: event.sessionId,
    workspaceId: event.workspaceId,
    editorSessionId: event.editorSessionId,
    traceId: event.traceId,
    pageId: event.activePageId,
    payload: event.details ?? {},
  };
}

function readSqliteEvents(dataDir: string, filters: Record<string, string | undefined>, limit: number): {
  events: EditorDiagnosticEvent[];
  warning?: string;
  dbMissing: boolean;
} {
  const dbPath = path.join(dataDir, "diagnostics", "editor-events.db");
  if (!fs.existsSync(dbPath)) {
    return { events: [], dbMissing: true };
  }

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      db.pragma("busy_timeout = 5000");
      const clauses: string[] = [];
      const params: Record<string, string | number> = { limit };
      const mapping: Array<[keyof typeof filters, string, string]> = [
        ["project", "project_id", "project"],
        ["session", "session_id", "session"],
        ["workspace", "workspace_id", "workspace"],
        ["editorSession", "editor_session_id", "editorSession"],
        ["trace", "trace_id", "trace"],
        ["operation", "operation_id", "operation"],
        ["eventType", "event_type", "eventType"],
      ];
      for (const [key, column, param] of mapping) {
        const value = filters[key];
        if (!value) continue;
        clauses.push(`${column} = @${param}`);
        params[param] = value;
      }
      if (filters.since) {
        clauses.push("ts >= @since");
        params.since = filters.since;
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = db.prepare(`
        SELECT * FROM editor_events
        ${where}
        ORDER BY ts DESC
        LIMIT @limit
      `).all(params) as EditorEventRow[];
      return { events: rows.map(rowToEvent).reverse(), dbMissing: false };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      events: [],
      dbMissing: false,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

function readJsonlEvents(dataDir: string): EditorDiagnosticEvent[] {
  const dir = path.join(dataDir, "editor-diagnostics");
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const events: EditorDiagnosticEvent[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const filePath = path.join(dir, entry);
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as LegacyEditorDiagnosticEvent | EditorDiagnosticEvent;
        events.push(normalizeEditorDiagnosticEvent(parsed));
      } catch {
        events.push({
          id: `invalid-${entry}-${events.length}`,
          schemaVersion: 1,
          ts: new Date().toISOString(),
          source: "cli",
          level: "warn",
          eventGroup: "system",
          eventType: "diagnostic.invalid_jsonl_line",
          editorSessionId: entry.replace(/\.jsonl$/, ""),
          payload: { filePath },
        });
      }
    }
  }

  return events;
}

function applyFilters(
  events: EditorDiagnosticEvent[],
  filters: Record<string, string | undefined>,
  limit: number,
): EditorDiagnosticEvent[] {
  return events
    .filter((event) => !filters.project || event.projectId === filters.project)
    .filter((event) => !filters.session || event.sessionId === filters.session)
    .filter((event) => !filters.workspace || event.workspaceId === filters.workspace)
    .filter((event) => !filters.editorSession || event.editorSessionId === filters.editorSession)
    .filter((event) => !filters.trace || event.traceId === filters.trace)
    .filter((event) => !filters.operation || event.operationId === filters.operation)
    .filter((event) => !filters.eventType || event.eventType === filters.eventType)
    .filter((event) => !filters.group || event.eventGroup === filters.group)
    .filter((event) => !filters.since || event.ts >= filters.since)
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);
}

function listAgentRunLogs(dataDir: string, events: EditorDiagnosticEvent[]) {
  const sessionIds = Array.from(new Set(events.map((event) => event.sessionId).filter(Boolean) as string[]));
  const root = path.join(dataDir, "agent-run-logs");
  return sessionIds.flatMap((sessionId) => {
    const dir = path.join(root, sessionId);
    if (!fs.existsSync(dir)) return [];
    const messageIds = fs.readdirSync(dir)
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => entry.replace(/\.jsonl$/, ""))
      .sort();
    return messageIds.length > 0 ? [{ sessionId, messageIds }] : [];
  });
}

function buildResult(kind: string, options: DiagnosticsOptions, filters: Record<string, string | undefined>) {
  const dataDir = getDataDir(options);
  const limit = toLimit(options.limit);
  const sqlite = readSqliteEvents(dataDir, filters, limit);
  const warnings: string[] = [];
  if (sqlite.warning) warnings.push(`SQLite 事件库不可用: ${sqlite.warning}`);
  if (sqlite.dbMissing) warnings.push("SQLite 事件库不存在，已尝试 JSONL 兜底");

  const shouldReadFallback =
    kind === "export" || sqlite.events.length === 0 || Boolean(sqlite.warning) || sqlite.dbMissing;
  const rawJsonlEvents = shouldReadFallback
    ? applyFilters(readJsonlEvents(dataDir), filters, limit)
    : [];
  const sqliteEventIds = new Set(sqlite.events.map((event) => event.id));
  const jsonlEvents = sqliteEventIds.size > 0
    ? rawJsonlEvents.filter((event) => !sqliteEventIds.has(event.id))
    : rawJsonlEvents;
  if (jsonlEvents.length > 0) {
    warnings.push("已读取 JSONL fallback/spool 事件，SQLite 仍是诊断主账本");
  }
  const events = sqlite.events.length > 0 ? sqlite.events : jsonlEvents;
  const eventsForRunLogs =
    sqlite.events.length > 0 ? [...sqlite.events, ...jsonlEvents] : events;

  const diagnostics: EditorDiagnosticQueryDiagnostics = {
    sqliteUsed: sqlite.events.length > 0,
    jsonlFallbackUsed: jsonlEvents.length > 0 || sqlite.dbMissing || Boolean(sqlite.warning),
    dbUnavailable: sqlite.dbMissing || Boolean(sqlite.warning),
    eventGapDetected: jsonlEvents.length > 0 || sqlite.dbMissing || Boolean(sqlite.warning),
    warnings,
  };

  return {
    success: true as const,
    query: {
      kind,
      dataDir,
      ...filters,
      limit,
    },
    diagnostics,
    events,
    fallbackEvents: jsonlEvents.length > 0 ? jsonlEvents : undefined,
    agentRunLogs: listAgentRunLogs(dataDir, eventsForRunLogs),
  };
}

function printTextTimeline(events: EditorDiagnosticEvent[], diagnostics: EditorDiagnosticQueryDiagnostics): void {
  for (const warning of diagnostics.warnings) showWarning(warning);
  if (events.length === 0) {
    showInfo("未找到匹配的诊断事件");
    return;
  }
  for (const event of events) {
    console.log(
      `${event.ts} [${event.level}] ${event.eventType} project=${event.projectId || "-"} session=${event.sessionId || "-"} trace=${event.traceId || "-"}`,
    );
  }
}

export async function queryDiagnostics(kind: string, options: DiagnosticsOptions): Promise<void> {
  const since = parseSince(options.since, kind === "recent" || kind === "project" ? 24 : undefined);
  const filters: Record<string, string | undefined> = {
    project: options.project,
    session: options.session,
    workspace: options.workspace,
    editorSession: options.editorSession,
    trace: options.trace,
    operation: options.operation,
    since,
  };

  if (kind === "autosave") filters.group = "autosave";
  if (kind === "collab") filters.group = "collab";
  if (kind === "preview") filters.group = "preview";
  if (kind === "trace") filters.trace = options.trace;
  if (kind === "operation") filters.operation = options.operation;
  if (kind === "session") filters.editorSession = options.editorSession;

  const result = buildResult(kind, options, filters);

  if (kind === "export" && options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  if (options.format === "text") {
    printTextTimeline(result.events, result.diagnostics);
    return;
  }

  outputJson(result);
}

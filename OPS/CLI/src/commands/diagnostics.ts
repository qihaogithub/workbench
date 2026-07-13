import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

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
  | "workspace"
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

export interface DiagnosticPercentileSummary {
  count: number;
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  average: number | null;
}

export interface WorkspaceDiagnosticFlow {
  workspaceId: string;
  revision: number;
  mutationIds: string[];
  traceIds: string[];
  eventIds: string[];
  eventTypes: string[];
  startedAt: string;
  completedAt: string;
  status:
    | "pending"
    | "committed"
    | "projection_applied"
    | "projection_gap_detected"
    | "projection_failed"
    | "canonical_succeeded"
    | "canonical_failed";
}

const WORKSPACE_FLOW_GROUPS = ["autosave", "collab", "preview", "workspace"] as const;
const CORRELATED_QUERY_KINDS = new Set(["autosave", "collab", "preview", "project", "export"]);

export interface DiagnosticsOptions {
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
  remoteHost?: string;
  remoteUser?: string;
  remotePort?: string;
  remoteDataDir?: string;
  remotePasswordEnv?: string;
}

interface RemoteSnapshot {
  localDataDir: string;
  remoteDataDir: string;
  cleanup: () => void;
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

function getRemoteHost(options: DiagnosticsOptions): string | undefined {
  return options.remoteHost || process.env.OPS_CLI_REMOTE_HOST;
}

function getRemoteUser(options: DiagnosticsOptions): string | undefined {
  return options.remoteUser || process.env.OPS_CLI_REMOTE_USER;
}

function getRemotePort(options: DiagnosticsOptions): string {
  return options.remotePort || process.env.OPS_CLI_REMOTE_PORT || "22";
}

function getRemotePassword(options: DiagnosticsOptions): string | undefined {
  const envName = options.remotePasswordEnv || "OPS_CLI_REMOTE_PASSWORD";
  return process.env[envName] || process.env.SSHPASS;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function remoteTarget(options: DiagnosticsOptions): string {
  const host = getRemoteHost(options);
  if (!host) throw new Error("remote host is required");
  const user = getRemoteUser(options);
  return user ? `${user}@${host}` : host;
}

function buildSshArgs(options: DiagnosticsOptions, remoteCommand: string): string[] {
  return [
    "-p",
    getRemotePort(options),
    "-o",
    "BatchMode=no",
    "-o",
    "StrictHostKeyChecking=accept-new",
    remoteTarget(options),
    `sh -lc ${shellQuote(remoteCommand)}`,
  ];
}

function runRemoteCommand(options: DiagnosticsOptions, remoteCommand: string): Promise<Buffer> {
  const password = getRemotePassword(options);
  const sshArgs = buildSshArgs(options, remoteCommand);
  const command = password ? "sshpass" : "ssh";
  const args = password ? ["-e", "ssh", ...sshArgs] : sshArgs;
  const env = password ? { ...process.env, SSHPASS: password } : process.env;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `ssh exited with code ${code}`));
    });
  });
}

async function detectRemoteDataDir(options: DiagnosticsOptions): Promise<string> {
  const explicit = options.remoteDataDir || process.env.OPS_CLI_REMOTE_DATA_DIR;
  if (explicit) return explicit;

  const command = [
    "for d in",
    "\"$DATA_DIR\"",
    "/opt/opencode-workbench/data",
    "/opt/workbench/data",
    "/app/data",
    "/data",
    "; do",
    "[ -n \"$d\" ] && [ -d \"$d\" ] && printf '%s\\n' \"$d\" && exit 0;",
    "done;",
    "printf '%s\\n' 'No diagnostics data dir found' >&2;",
    "exit 2",
  ].join(" ");
  const output = await runRemoteCommand(options, command);
  const dataDir = output.toString("utf8").trim().split("\n").filter(Boolean).at(-1);
  if (!dataDir) throw new Error("remote data dir detection returned empty output");
  return dataDir;
}

async function createRemoteDiagnosticsSnapshot(options: DiagnosticsOptions): Promise<RemoteSnapshot> {
  const remoteDataDir = await detectRemoteDataDir(options);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-diagnostics-remote-"));
  const archivePath = path.join(tempRoot, "diagnostics.tgz");
  const localDataDir = path.join(tempRoot, "data");
  try {
    fs.mkdirSync(localDataDir, { recursive: true });

    const remoteCommand = [
      "set -eu;",
      `DATA_DIR=${shellQuote(remoteDataDir)};`,
      "[ -d \"$DATA_DIR\" ] || { printf 'Data dir not found: %s\\n' \"$DATA_DIR\" >&2; exit 2; };",
      "cd \"$DATA_DIR\";",
      "tmp_list=$(mktemp);",
      "for p in diagnostics/editor-events.db diagnostics/editor-events.db-wal diagnostics/editor-events.db-shm editor-diagnostics agent-run-logs; do",
      "[ -e \"$p\" ] && printf '%s\\n' \"$p\" >> \"$tmp_list\";",
      "done;",
      "[ -s \"$tmp_list\" ] || { rm -f \"$tmp_list\"; printf 'No diagnostics files found under %s\\n' \"$DATA_DIR\" >&2; exit 3; };",
      "tar -czf - -T \"$tmp_list\";",
      "rm -f \"$tmp_list\";",
    ].join(" ");

    const archive = await runRemoteCommand(options, remoteCommand);
    fs.writeFileSync(archivePath, archive);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("tar", ["-xzf", archivePath, "-C", localDataDir], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      const stderr: Buffer[] = [];
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `tar exited with code ${code}`));
      });
    });

    return {
      localDataDir,
      remoteDataDir,
      cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
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

export function readSqliteEvents(dataDir: string, filters: Record<string, string | undefined>, limit: number): {
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
        ["group", "event_group", "group"],
      ];
      for (const [key, column, param] of mapping) {
        const value = filters[key];
        if (!value) continue;
        clauses.push(`${column} = @${param}`);
        params[param] = value;
      }
      const groups = filters.groups?.split(",").map((group) => group.trim()).filter(Boolean) ?? [];
      if (groups.length > 0) {
        const placeholders = groups.map((group, index) => {
          const param = `group${index}`;
          params[param] = group;
          return `@${param}`;
        });
        clauses.push(`event_group IN (${placeholders.join(", ")})`);
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

export function applyFilters(
  events: EditorDiagnosticEvent[],
  filters: Record<string, string | undefined>,
  limit: number,
): EditorDiagnosticEvent[] {
  const groups = new Set(filters.groups?.split(",").map((group) => group.trim()).filter(Boolean) ?? []);
  return events
    .filter((event) => !filters.project || event.projectId === filters.project)
    .filter((event) => !filters.session || event.sessionId === filters.session)
    .filter((event) => !filters.workspace || event.workspaceId === filters.workspace)
    .filter((event) => !filters.editorSession || event.editorSessionId === filters.editorSession)
    .filter((event) => !filters.trace || event.traceId === filters.trace)
    .filter((event) => !filters.operation || event.operationId === filters.operation)
    .filter((event) => !filters.eventType || event.eventType === filters.eventType)
    .filter((event) => !filters.group || event.eventGroup === filters.group)
    .filter((event) => groups.size === 0 || groups.has(event.eventGroup))
    .filter((event) => !filters.since || event.ts >= filters.since)
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);
}

function numericPayload(event: EditorDiagnosticEvent, key: string): number | undefined {
  const value = event.payload[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null;
}

function summarizeSamples(samples: number[]): DiagnosticPercentileSummary {
  const sorted = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, average: null };
  }
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? null,
    average: Math.round((total / sorted.length) * 100) / 100,
  };
}

function eventRevision(event: EditorDiagnosticEvent): number | undefined {
  return numericPayload(event, "revision");
}

function eventMutationId(event: EditorDiagnosticEvent): string | undefined {
  const mutationId = event.payload.mutationId;
  return typeof mutationId === "string" && mutationId ? mutationId : undefined;
}

function flowStatus(eventTypes: string[]): WorkspaceDiagnosticFlow["status"] {
  if (eventTypes.includes("workspace.canonical_materialization_failed")) return "canonical_failed";
  if (eventTypes.includes("workspace.canonical_materialization_succeeded")) return "canonical_succeeded";
  if (eventTypes.includes("workspace.projection_failed")) return "projection_failed";
  if (eventTypes.includes("workspace.projection_gap_detected")) return "projection_gap_detected";
  if (eventTypes.includes("workspace.projection_applied")) return "projection_applied";
  if (eventTypes.includes("workspace.mutation_committed")) return "committed";
  return "pending";
}

export function buildWorkspaceFlows(events: EditorDiagnosticEvent[]): WorkspaceDiagnosticFlow[] {
  const workspaceEvents = events.filter((event) => event.eventGroup === "workspace" && event.workspaceId);
  const revisionByMutationId = new Map<string, number>();
  for (const event of workspaceEvents) {
    const mutationId = eventMutationId(event);
    const revision = eventRevision(event);
    if (mutationId && revision !== undefined && event.eventType === "workspace.mutation_committed") {
      revisionByMutationId.set(mutationId, revision);
    }
  }

  const grouped = new Map<string, EditorDiagnosticEvent[]>();
  for (const event of workspaceEvents) {
    if (!event.eventType.startsWith("workspace.mutation_") &&
        !event.eventType.startsWith("workspace.projection_") &&
        !event.eventType.startsWith("workspace.canonical_materialization_")) {
      continue;
    }
    const mutationId = eventMutationId(event);
    const revision = eventRevision(event) ?? (mutationId ? revisionByMutationId.get(mutationId) : undefined);
    if (revision === undefined || !event.workspaceId) continue;
    const key = `${event.workspaceId}:${revision}`;
    const current = grouped.get(key) ?? [];
    current.push(event);
    grouped.set(key, current);
  }

  return [...grouped.entries()].map(([key, flowEvents]) => {
    const separator = key.lastIndexOf(":");
    const workspaceId = key.slice(0, separator);
    const revision = Number(key.slice(separator + 1));
    const sorted = [...flowEvents].sort((a, b) => a.ts.localeCompare(b.ts));
    const eventTypes = sorted.map((event) => event.eventType);
    return {
      workspaceId,
      revision,
      mutationIds: [...new Set(sorted.map(eventMutationId).filter(Boolean) as string[])],
      traceIds: [...new Set(sorted.map((event) => event.traceId).filter(Boolean) as string[])],
      eventIds: sorted.map((event) => event.id),
      eventTypes,
      startedAt: sorted[0]?.ts ?? "",
      completedAt: sorted.at(-1)?.ts ?? "",
      status: flowStatus(eventTypes),
    };
  }).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function canonicalLagSamples(events: EditorDiagnosticEvent[]): number[] {
  const committedAt = new Map<string, number>();
  for (const event of events) {
    if (event.eventType !== "workspace.mutation_committed" || !event.workspaceId) continue;
    const revision = eventRevision(event);
    const timestamp = Date.parse(event.ts);
    if (revision === undefined || !Number.isFinite(timestamp)) continue;
    committedAt.set(`${event.workspaceId}:${revision}`, timestamp);
  }
  const samples: number[] = [];
  for (const event of events) {
    if (event.eventType !== "workspace.canonical_materialization_succeeded" || !event.workspaceId) continue;
    const revision = eventRevision(event);
    const timestamp = Date.parse(event.ts);
    if (revision === undefined || !Number.isFinite(timestamp)) continue;
    const committed = committedAt.get(`${event.workspaceId}:${revision}`);
    if (committed !== undefined && timestamp >= committed) samples.push(timestamp - committed);
  }
  return samples;
}

export function summarizeDiagnosticPerformance(events: EditorDiagnosticEvent[]) {
  const collect = (payloadKey: string, predicate?: (event: EditorDiagnosticEvent) => boolean) => events.flatMap((event) => {
    if (predicate && !predicate(event)) return [];
    const value = numericPayload(event, payloadKey);
    return value === undefined ? [] : [value];
  });
  const explicitDebounce = collect("debounceWaitMs");
  const debounceSamples = explicitDebounce.length > 0
    ? explicitDebounce
    : collect("delayMs", (event) => event.eventType === "autosave.flush_debounced");
  const explicitCanonicalLag = collect("canonicalLagMs");
  const canonicalSamples = explicitCanonicalLag.length > 0
    ? explicitCanonicalLag
    : canonicalLagSamples(events);
  return {
    unit: "ms" as const,
    metrics: {
      autosaveDebounceWait: summarizeSamples(debounceSamples),
      queueWait: summarizeSamples(collect("queueWaitMs")),
      commitLatency: summarizeSamples(collect("commitLatencyMs")),
      remoteUpdateLatency: summarizeSamples(collect("remoteUpdateLatencyMs")),
      draftPreviewLatency: summarizeSamples(collect("draftPreviewLatencyMs")),
      projectionLatency: summarizeSamples(collect("projectionLatencyMs")),
      reconnectConvergence: summarizeSamples(collect("reconnectConvergenceMs")),
      canonicalLag: summarizeSamples(canonicalSamples),
    },
  };
}

function mergeEvents(primary: EditorDiagnosticEvent[], fallback: EditorDiagnosticEvent[], limit: number): EditorDiagnosticEvent[] {
  const byId = new Map(primary.map((event) => [event.id, event]));
  for (const event of fallback) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts)).slice(-limit);
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

export function buildDiagnosticsResult(kind: string, options: DiagnosticsOptions, filters: Record<string, string | undefined>) {
  const dataDir = getDataDir(options);
  const limit = toLimit(options.limit);
  const sqlite = readSqliteEvents(dataDir, filters, limit);
  const warnings: string[] = [];
  if (sqlite.warning) warnings.push(`SQLite 事件库不可用: ${sqlite.warning}`);
  if (sqlite.dbMissing) warnings.push("SQLite 事件库不存在，已尝试 JSONL 兜底");

  const shouldReadFallback =
    CORRELATED_QUERY_KINDS.has(kind) || sqlite.events.length === 0 || Boolean(sqlite.warning) || sqlite.dbMissing;
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
  const events = CORRELATED_QUERY_KINDS.has(kind)
    ? mergeEvents(sqlite.events, jsonlEvents, limit)
    : sqlite.events.length > 0 ? sqlite.events : jsonlEvents;
  const eventsForRunLogs = mergeEvents(sqlite.events, jsonlEvents, limit);

  const diagnostics: EditorDiagnosticQueryDiagnostics = {
    sqliteUsed: sqlite.events.length > 0,
    jsonlFallbackUsed: jsonlEvents.length > 0 || sqlite.dbMissing || Boolean(sqlite.warning),
    dbUnavailable: sqlite.dbMissing || Boolean(sqlite.warning),
    eventGapDetected: sqlite.dbMissing || Boolean(sqlite.warning),
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
    workspaceFlows: buildWorkspaceFlows(events),
    performance: summarizeDiagnosticPerformance(events),
    fallbackEvents: jsonlEvents.length > 0 ? jsonlEvents : undefined,
    agentRunLogs: listAgentRunLogs(dataDir, eventsForRunLogs),
  };
}

function isDiagnosticFailure(event: EditorDiagnosticEvent): boolean {
  return event.level === "error" || event.eventType.endsWith("_failed");
}

export function formatDiagnosticFailureDetails(event: EditorDiagnosticEvent): string {
  if (!isDiagnosticFailure(event)) return "";

  const details: string[] = [
    `workspace=${event.workspaceId || "-"}`,
    `page=${event.pageId || "-"}`,
  ];
  const phase = event.payload.phase;
  const errorCode = event.payload.errorCode;
  const httpStatus = event.payload.httpStatus;
  if (typeof phase === "string" && phase) details.push(`phase=${phase}`);
  if (typeof errorCode === "string" && errorCode) details.push(`code=${errorCode}`);
  if (
    typeof httpStatus === "number" ||
    typeof httpStatus === "string"
  ) {
    details.push(`status=${httpStatus}`);
  }
  return details.length > 0 ? ` ${details.join(" ")}` : "";
}

function printTextTimeline(events: EditorDiagnosticEvent[], diagnostics: EditorDiagnosticQueryDiagnostics): void {
  for (const warning of diagnostics.warnings) showWarning(warning);
  if (events.length === 0) {
    showInfo("未找到匹配的诊断事件");
    return;
  }
  for (const event of events) {
    console.log(
      `${event.ts} [${event.level}] ${event.eventType} project=${event.projectId || "-"} session=${event.sessionId || "-"} trace=${event.traceId || "-"}${formatDiagnosticFailureDetails(event)}`,
    );
  }
}

function printTextAnalysis(
  flows: WorkspaceDiagnosticFlow[],
  performance: ReturnType<typeof summarizeDiagnosticPerformance>,
): void {
  if (flows.length > 0) {
    showInfo(`Workspace revision flows: ${flows.length}`);
    for (const flow of flows) {
      console.log(
        `  workspace=${flow.workspaceId} revision=${flow.revision} status=${flow.status} events=${flow.eventTypes.join(",")}`,
      );
    }
  }
  const populated = Object.entries(performance.metrics).filter(([, summary]) => summary.count > 0);
  if (populated.length > 0) {
    showInfo("Performance percentiles (ms)");
    for (const [name, summary] of populated) {
      console.log(`  ${name}: count=${summary.count} p50=${summary.p50} p95=${summary.p95} p99=${summary.p99} max=${summary.max}`);
    }
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

  if (kind === "autosave" || kind === "collab" || kind === "preview") {
    filters.groups = WORKSPACE_FLOW_GROUPS.join(",");
  }
  if (kind === "trace") filters.trace = options.trace;
  if (kind === "operation") filters.operation = options.operation;
  if (kind === "session") filters.editorSession = options.editorSession;

  const remoteHost = getRemoteHost(options);
  const snapshot = remoteHost ? await createRemoteDiagnosticsSnapshot(options) : null;

  try {
    const effectiveOptions = snapshot
      ? { ...options, dataDir: snapshot.localDataDir }
      : options;
    const result = buildDiagnosticsResult(kind, effectiveOptions, filters);
    if (snapshot) {
      const query = result.query as Record<string, unknown>;
      query.dataDir = snapshot.remoteDataDir;
      query.source = "remote";
      query.remote = {
        host: remoteHost,
        user: getRemoteUser(options),
        port: getRemotePort(options),
      };
      result.diagnostics.warnings.push(
        `已从远程 ${remoteTarget(options)}:${snapshot.remoteDataDir} 拉取只读诊断快照`,
      );
    }

    if (kind === "export" && options.output) {
      fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
      fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }

    if (options.format === "text") {
      printTextTimeline(result.events, result.diagnostics);
      printTextAnalysis(result.workspaceFlows, result.performance);
      return;
    }

    outputJson(result);
  } finally {
    snapshot?.cleanup();
  }
}

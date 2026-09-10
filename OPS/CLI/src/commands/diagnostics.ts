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

export interface SandboxDiagnosticSummary {
  eventCount: number;
  executionIssued: number;
  runtimeFailures: number;
  screenshotsCompleted: number;
  runtimeTypes: string[];
  policyVersions: number[];
  renderers: string[];
  failureCodes: Record<string, number>;
  policyMismatch: number;
  expiredTicket: number;
  blockedRequestCount: number;
  timeoutCount: number;
  timeoutMs: DiagnosticPercentileSummary;
  contextRecovery: {
    contextClosed: number;
    browserRestarted: number;
    recovered: number;
  };
}

const WORKSPACE_FLOW_GROUPS = [
  "autosave",
  "collab",
  "preview",
  "workspace",
] as const;
const CORRELATED_QUERY_KINDS = new Set([
  "autosave",
  "collab",
  "preview",
  "project",
  "export",
]);

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

function buildSshArgs(
  options: DiagnosticsOptions,
  remoteCommand: string,
): string[] {
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

function runRemoteCommand(
  options: DiagnosticsOptions,
  remoteCommand: string,
): Promise<Buffer> {
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
      reject(
        new Error(
          Buffer.concat(stderr).toString("utf8").trim() ||
            `ssh exited with code ${code}`,
        ),
      );
    });
  });
}

async function detectRemoteDataDir(
  options: DiagnosticsOptions,
): Promise<string> {
  const explicit = options.remoteDataDir || process.env.OPS_CLI_REMOTE_DATA_DIR;
  if (explicit) return explicit;

  const command = [
    "for d in",
    '"$DATA_DIR"',
    "/opt/opencode-workbench/data",
    "/opt/workbench/data",
    "/app/data",
    "/data",
    "; do",
    '[ -n "$d" ] && [ -d "$d" ] && printf \'%s\\n\' "$d" && exit 0;',
    "done;",
    "printf '%s\\n' 'No diagnostics data dir found' >&2;",
    "exit 2",
  ].join(" ");
  const output = await runRemoteCommand(options, command);
  const dataDir = output
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .at(-1);
  if (!dataDir)
    throw new Error("remote data dir detection returned empty output");
  return dataDir;
}

async function createRemoteDiagnosticsSnapshot(
  options: DiagnosticsOptions,
): Promise<RemoteSnapshot> {
  const remoteDataDir = await detectRemoteDataDir(options);
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "workbench-diagnostics-remote-"),
  );
  const archivePath = path.join(tempRoot, "diagnostics.tgz");
  const localDataDir = path.join(tempRoot, "data");
  try {
    fs.mkdirSync(localDataDir, { recursive: true });

    const remoteCommand = [
      "set -eu;",
      `DATA_DIR=${shellQuote(remoteDataDir)};`,
      '[ -d "$DATA_DIR" ] || { printf \'Data dir not found: %s\\n\' "$DATA_DIR" >&2; exit 2; };',
      'cd "$DATA_DIR";',
      "tmp_list=$(mktemp);",
      "for p in diagnostics/editor-events.db diagnostics/editor-events.db-wal diagnostics/editor-events.db-shm editor-diagnostics agent-run-logs; do",
      '[ -e "$p" ] && printf \'%s\\n\' "$p" >> "$tmp_list";',
      "done;",
      '[ -s "$tmp_list" ] || { rm -f "$tmp_list"; printf \'No diagnostics files found under %s\\n\' "$DATA_DIR" >&2; exit 3; };',
      'tar -czf - -T "$tmp_list";',
      'rm -f "$tmp_list";',
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
        else
          reject(
            new Error(
              Buffer.concat(stderr).toString("utf8").trim() ||
                `tar exited with code ${code}`,
            ),
          );
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

function parseSince(
  value: string | undefined,
  fallbackHours?: number,
): string | undefined {
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

export function readSqliteEvents(
  dataDir: string,
  filters: Record<string, string | undefined>,
  limit: number,
): {
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
      const groups =
        filters.groups
          ?.split(",")
          .map((group) => group.trim())
          .filter(Boolean) ?? [];
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
      const rows = db
        .prepare(
          `
        SELECT * FROM editor_events
        ${where}
        ORDER BY ts DESC
        LIMIT @limit
      `,
        )
        .all(params) as EditorEventRow[];
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
        const parsed = JSON.parse(line) as
          | LegacyEditorDiagnosticEvent
          | EditorDiagnosticEvent;
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
  const groups = new Set(
    filters.groups
      ?.split(",")
      .map((group) => group.trim())
      .filter(Boolean) ?? [],
  );
  return events
    .filter((event) => !filters.project || event.projectId === filters.project)
    .filter((event) => !filters.session || event.sessionId === filters.session)
    .filter(
      (event) => !filters.workspace || event.workspaceId === filters.workspace,
    )
    .filter(
      (event) =>
        !filters.editorSession ||
        event.editorSessionId === filters.editorSession,
    )
    .filter((event) => !filters.trace || event.traceId === filters.trace)
    .filter(
      (event) => !filters.operation || event.operationId === filters.operation,
    )
    .filter(
      (event) => !filters.eventType || event.eventType === filters.eventType,
    )
    .filter((event) => !filters.group || event.eventGroup === filters.group)
    .filter((event) => groups.size === 0 || groups.has(event.eventGroup))
    .filter((event) => !filters.since || event.ts >= filters.since)
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);
}

function numericPayload(
  event: EditorDiagnosticEvent,
  key: string,
): number | undefined {
  const value = event.payload[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null;
}

function summarizeSamples(samples: number[]): DiagnosticPercentileSummary {
  const sorted = samples
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return {
      count: 0,
      min: null,
      p50: null,
      p95: null,
      p99: null,
      max: null,
      average: null,
    };
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
  if (eventTypes.includes("workspace.canonical_materialization_failed"))
    return "canonical_failed";
  if (eventTypes.includes("workspace.canonical_materialization_succeeded"))
    return "canonical_succeeded";
  if (eventTypes.includes("workspace.projection_failed"))
    return "projection_failed";
  if (eventTypes.includes("workspace.projection_gap_detected"))
    return "projection_gap_detected";
  if (eventTypes.includes("workspace.projection_applied"))
    return "projection_applied";
  if (eventTypes.includes("workspace.mutation_committed")) return "committed";
  return "pending";
}

export function buildWorkspaceFlows(
  events: EditorDiagnosticEvent[],
): WorkspaceDiagnosticFlow[] {
  const workspaceEvents = events.filter(
    (event) => event.eventGroup === "workspace" && event.workspaceId,
  );
  const revisionByMutationId = new Map<string, number>();
  for (const event of workspaceEvents) {
    const mutationId = eventMutationId(event);
    const revision = eventRevision(event);
    if (
      mutationId &&
      revision !== undefined &&
      event.eventType === "workspace.mutation_committed"
    ) {
      revisionByMutationId.set(mutationId, revision);
    }
  }

  const grouped = new Map<string, EditorDiagnosticEvent[]>();
  for (const event of workspaceEvents) {
    if (
      !event.eventType.startsWith("workspace.mutation_") &&
      !event.eventType.startsWith("workspace.projection_") &&
      !event.eventType.startsWith("workspace.canonical_materialization_")
    ) {
      continue;
    }
    const mutationId = eventMutationId(event);
    const revision =
      eventRevision(event) ??
      (mutationId ? revisionByMutationId.get(mutationId) : undefined);
    if (revision === undefined || !event.workspaceId) continue;
    const key = `${event.workspaceId}:${revision}`;
    const current = grouped.get(key) ?? [];
    current.push(event);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, flowEvents]) => {
      const separator = key.lastIndexOf(":");
      const workspaceId = key.slice(0, separator);
      const revision = Number(key.slice(separator + 1));
      const sorted = [...flowEvents].sort((a, b) => a.ts.localeCompare(b.ts));
      const eventTypes = sorted.map((event) => event.eventType);
      return {
        workspaceId,
        revision,
        mutationIds: [
          ...new Set(sorted.map(eventMutationId).filter(Boolean) as string[]),
        ],
        traceIds: [
          ...new Set(
            sorted.map((event) => event.traceId).filter(Boolean) as string[],
          ),
        ],
        eventIds: sorted.map((event) => event.id),
        eventTypes,
        startedAt: sorted[0]?.ts ?? "",
        completedAt: sorted.at(-1)?.ts ?? "",
        status: flowStatus(eventTypes),
      };
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function canonicalLagSamples(events: EditorDiagnosticEvent[]): number[] {
  const committedAt = new Map<string, number>();
  for (const event of events) {
    if (
      event.eventType !== "workspace.mutation_committed" ||
      !event.workspaceId
    )
      continue;
    const revision = eventRevision(event);
    const timestamp = Date.parse(event.ts);
    if (revision === undefined || !Number.isFinite(timestamp)) continue;
    committedAt.set(`${event.workspaceId}:${revision}`, timestamp);
  }
  const samples: number[] = [];
  for (const event of events) {
    if (
      event.eventType !== "workspace.canonical_materialization_succeeded" ||
      !event.workspaceId
    )
      continue;
    const revision = eventRevision(event);
    const timestamp = Date.parse(event.ts);
    if (revision === undefined || !Number.isFinite(timestamp)) continue;
    const committed = committedAt.get(`${event.workspaceId}:${revision}`);
    if (committed !== undefined && timestamp >= committed)
      samples.push(timestamp - committed);
  }
  return samples;
}

export function summarizeDiagnosticPerformance(
  events: EditorDiagnosticEvent[],
) {
  const collect = (
    payloadKey: string,
    predicate?: (event: EditorDiagnosticEvent) => boolean,
  ) =>
    events.flatMap((event) => {
      if (predicate && !predicate(event)) return [];
      const value = numericPayload(event, payloadKey);
      return value === undefined ? [] : [value];
    });
  const explicitDebounce = collect("debounceWaitMs");
  const debounceSamples =
    explicitDebounce.length > 0
      ? explicitDebounce
      : collect(
          "delayMs",
          (event) => event.eventType === "autosave.flush_debounced",
        );
  const explicitCanonicalLag = collect("canonicalLagMs");
  const canonicalSamples =
    explicitCanonicalLag.length > 0
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

export interface PreviewObservationMetricsSummary {
  /** Number of Agent runs in the selected log sample, including runs without observations. */
  runCount: number;
  /** Number of selected Agent runs that emitted at least one observation result. */
  observationRunCount: number;
  /** observationRunCount / runCount; null when the selected sample has no runs. */
  observationRate: number | null;
  observationCount: number;
  availability: Record<
    "observed" | "stale" | "unavailable" | "unsupported",
    number
  >;
  assertionStatus: Record<
    "not-requested" | "passed" | "failed" | "uncertain" | "unsupported",
    number
  >;
  assertionResults: {
    count: number;
    passed: number;
    failed: number;
    uncertain: number;
    unsupported: number;
  };
  latencyMs: DiagnosticPercentileSummary;
  latencyP90Ms: number | null;
  payloadBytes: DiagnosticPercentileSummary;
  payloadP90Bytes: number | null;
  evidenceKinds: Record<string, number>;
  precisions: Record<string, number>;
  runtimeTypes: Record<string, number>;
  timeoutCount: number;
  staleCount: number;
  technicalRepair: {
    eligibleRuns: number;
    successfulRuns: number;
    successRate: number | null;
    definition: string;
  };
}

type PreviewObservationLogEntry = {
  sessionId?: string;
  runId?: string;
  timestamp?: string;
  eventType?: string;
  toolCallId?: string;
  payload?: unknown;
};

type PreviewRunAccumulator = {
  started: boolean;
  inScope: boolean;
  projectId?: string;
  mutationCommitted: boolean;
  projectionStatus?: string;
  success?: boolean;
  hasTerminal: boolean;
  pendingObservationCalls: Set<string>;
  observations: Array<{
    availability: "observed" | "stale" | "unavailable" | "unsupported";
    assertionStatus:
      | "not-requested"
      | "passed"
      | "failed"
      | "uncertain"
      | "unsupported";
    assertionResults: Array<{
      status: "passed" | "failed" | "uncertain" | "unsupported";
    }>;
    latencyMs?: number;
    payloadBytes?: number;
    evidenceKind?: string;
    precision?: string;
    runtimeType?: string;
    projectId?: string;
    reasons?: string[];
  }>;
};

const PREVIEW_AVAILABILITY_VALUES = [
  "observed",
  "stale",
  "unavailable",
  "unsupported",
] as const;
const PREVIEW_ASSERTION_STATUS_VALUES = [
  "not-requested",
  "passed",
  "failed",
  "uncertain",
  "unsupported",
] as const;
const PREVIEW_ASSERTION_RESULT_VALUES = [
  "passed",
  "failed",
  "uncertain",
  "unsupported",
] as const;
const PREVIEW_EVIDENCE_KIND_VALUES = [
  "runtime-structure",
  "current-surface-pixels",
  "reference-render",
] as const;
const PREVIEW_PRECISION_VALUES = [
  "layout",
  "runtime-self-reported",
  "painted-bounds",
  "compositor",
  "reference",
] as const;
const PREVIEW_RUNTIME_TYPE_VALUES = [
  "prototype-html-css",
  "high-fidelity-react",
  "sandboxed-html",
  "sketch-scene",
] as const;

function recordCount(target: Record<string, number>, value: unknown): void {
  if (typeof value !== "string" || !value) return;
  target[value] = (target[value] ?? 0) + 1;
}

function recordFiniteSample(target: number[], value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
  target.push(value);
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Agent run_start historically stores the page id in demoId. The workspace
 * path is the only durable project identity for unavailable/stale observations
 * that intentionally omit an identity payload, so recover the project segment
 * without exposing the rest of the absolute path.
 */
function projectIdFromWorkingDir(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const segments = value.split(/[\\/]+/u);
  const projectsIndex = segments.lastIndexOf("projects");
  const projectId =
    projectsIndex >= 0 ? segments[projectsIndex + 1] : undefined;
  return projectId || undefined;
}

function parsePreviewObservationDetails(
  entry: PreviewObservationLogEntry,
): PreviewRunAccumulator["observations"][number] | undefined {
  if (entry.eventType !== "tool_call_update" || !isRecordValue(entry.payload)) {
    return undefined;
  }
  if (entry.payload.toolName !== "observePreview") return undefined;
  const details = isRecordValue(entry.payload.details)
    ? entry.payload.details
    : undefined;
  const unavailable = (reason: string) => ({
    availability: "unavailable" as const,
    assertionStatus: "not-requested" as const,
    assertionResults: [],
    reasons: [reason],
  });
  // A failed tool call or an invalid response is still an observation
  // attempt. Count it as unavailable so the run-level observation rate and
  // failure rate do not silently improve when the terminal details are lost.
  if (!details) return unavailable("missing-response");
  const availability = details.availability;
  const assertionStatus = details.assertionStatus;
  if (
    !PREVIEW_AVAILABILITY_VALUES.includes(
      availability as (typeof PREVIEW_AVAILABILITY_VALUES)[number],
    ) ||
    !PREVIEW_ASSERTION_STATUS_VALUES.includes(
      assertionStatus as (typeof PREVIEW_ASSERTION_STATUS_VALUES)[number],
    )
  ) {
    return unavailable("invalid-response");
  }
  const assertions = Array.isArray(details.assertionTypes)
    ? details.assertionTypes
        .filter(isRecordValue)
        .map((assertion) => assertion.status)
        .filter(
          (
            status,
          ): status is (typeof PREVIEW_ASSERTION_RESULT_VALUES)[number] =>
            PREVIEW_ASSERTION_RESULT_VALUES.includes(
              status as (typeof PREVIEW_ASSERTION_RESULT_VALUES)[number],
            ),
        )
        .map((status) => ({ status }))
    : [];
  const identity = isRecordValue(details.identity)
    ? details.identity
    : undefined;
  const evidence = isRecordValue(details.evidence)
    ? details.evidence
    : undefined;
  const reasons = Array.isArray(details.reasons)
    ? details.reasons
        .filter((reason): reason is string => typeof reason === "string")
        .slice(0, 16)
    : undefined;
  return {
    availability: availability as (typeof PREVIEW_AVAILABILITY_VALUES)[number],
    assertionStatus:
      assertionStatus as (typeof PREVIEW_ASSERTION_STATUS_VALUES)[number],
    assertionResults: assertions,
    latencyMs:
      typeof details.latencyMs === "number" &&
      Number.isFinite(details.latencyMs)
        ? details.latencyMs
        : undefined,
    payloadBytes:
      typeof details.payloadBytes === "number" &&
      Number.isFinite(details.payloadBytes)
        ? details.payloadBytes
        : undefined,
    evidenceKind:
      typeof evidence?.kind === "string" &&
      PREVIEW_EVIDENCE_KIND_VALUES.includes(
        evidence.kind as (typeof PREVIEW_EVIDENCE_KIND_VALUES)[number],
      )
        ? evidence.kind
        : undefined,
    precision:
      typeof evidence?.precision === "string" &&
      PREVIEW_PRECISION_VALUES.includes(
        evidence.precision as (typeof PREVIEW_PRECISION_VALUES)[number],
      )
        ? evidence.precision
        : undefined,
    runtimeType:
      typeof identity?.runtimeType === "string" &&
      PREVIEW_RUNTIME_TYPE_VALUES.includes(
        identity.runtimeType as (typeof PREVIEW_RUNTIME_TYPE_VALUES)[number],
      )
        ? identity.runtimeType
        : undefined,
    projectId:
      typeof identity?.projectId === "string" ? identity.projectId : undefined,
    reasons,
  };
}

function readAgentPreviewObservationLogs(
  dataDir: string,
  filters: Record<string, string | undefined>,
  limit: number,
): PreviewRunAccumulator[] {
  const root = path.join(dataDir, "agent-run-logs");
  if (!fs.existsSync(root)) return [];
  const sinceMs = filters.since ? Date.parse(filters.since) : Number.NaN;
  const runs = new Map<string, PreviewRunAccumulator>();
  let filesRead = 0;
  const maxFiles = Math.max(
    1,
    Math.floor(Number.isFinite(limit) && limit > 0 ? limit : 200) * 4,
  );
  const sessionEntries = fs.readdirSync(root, { withFileTypes: true });
  for (const sessionEntry of sessionEntries) {
    if (!sessionEntry.isDirectory()) continue;
    if (filters.session && sessionEntry.name !== filters.session) continue;
    const sessionDir = path.join(root, sessionEntry.name);
    for (const fileEntry of fs.readdirSync(sessionDir, {
      withFileTypes: true,
    })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(".jsonl")) continue;
      if (filesRead >= maxFiles) return [...runs.values()];
      filesRead += 1;
      const filePath = path.join(sessionDir, fileEntry.name);
      let content = "";
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      let runId = "";
      let run: PreviewRunAccumulator | undefined;
      for (const line of content.split(/\r?\n/u)) {
        if (!line.trim()) continue;
        let entry: PreviewObservationLogEntry;
        try {
          entry = JSON.parse(line) as PreviewObservationLogEntry;
        } catch {
          continue;
        }
        if (typeof entry.runId === "string" && entry.runId) runId = entry.runId;
        if (!runId) runId = `${sessionEntry.name}:${fileEntry.name}`;
        if (!run) {
          run = {
            started: false,
            inScope: false,
            mutationCommitted: false,
            hasTerminal: false,
            pendingObservationCalls: new Set(),
            observations: [],
          };
          runs.set(runId, run);
        }
        if (entry.eventType === "run_start" && isRecordValue(entry.payload)) {
          run.started = true;
          const explicitProjectId =
            typeof entry.payload.projectId === "string" &&
            entry.payload.projectId.trim()
              ? entry.payload.projectId
              : undefined;
          run.projectId =
            explicitProjectId ??
            projectIdFromWorkingDir(entry.payload.workingDir);
          // Older logs use demoId for the page id. Preserve it only when no
          // workspace-derived project identity is available (test fixtures and
          // legacy callers may still supply the project id there).
          if (!run.projectId && typeof entry.payload.demoId === "string") {
            run.projectId = entry.payload.demoId;
          }
        }
        const timestampMs =
          typeof entry.timestamp === "string"
            ? Date.parse(entry.timestamp)
            : Number.NaN;
        if (
          Number.isFinite(sinceMs) &&
          (!Number.isFinite(timestampMs) || timestampMs < sinceMs)
        ) {
          continue;
        }
        run.inScope = true;
        if (entry.eventType === "finish") {
          run.hasTerminal = true;
          if (isRecordValue(entry.payload)) {
            run.success = entry.payload.success === true;
            const metrics = isRecordValue(entry.payload.metrics)
              ? entry.payload.metrics
              : undefined;
            run.mutationCommitted = metrics?.mutationCommitted === true;
            run.projectionStatus =
              typeof metrics?.projectionStatus === "string"
                ? metrics.projectionStatus
                : undefined;
          }
        }
        if (entry.eventType === "error" || entry.eventType === "cancel") {
          run.hasTerminal = true;
        }
        if (entry.eventType === "tool_call" && isRecordValue(entry.payload)) {
          const toolCallId =
            entry.toolCallId ??
            (typeof entry.payload.toolCallId === "string"
              ? entry.payload.toolCallId
              : undefined);
          if (entry.payload.toolName === "observePreview" && toolCallId) {
            run.pendingObservationCalls.add(toolCallId);
          }
        }
        if (
          entry.eventType === "tool_call_update" &&
          isRecordValue(entry.payload)
        ) {
          const toolCallId =
            entry.toolCallId ??
            (typeof entry.payload.toolCallId === "string"
              ? entry.payload.toolCallId
              : undefined);
          if (entry.payload.toolName === "observePreview" && toolCallId) {
            run.pendingObservationCalls.delete(toolCallId);
          }
        }
        const observation = parsePreviewObservationDetails(entry);
        if (observation) {
          run.observations.push(observation);
        }
      }
      if (!run || !run.started || !run.inScope) {
        runs.delete(runId);
        continue;
      }
      // A run can be truncated after an observePreview tool_call (for
      // example, a disconnect before tool_call_update). Once the run has a
      // terminal event, account for each unmatched call as unavailable so
      // adoption and failure metrics cannot be silently inflated.
      if (run.hasTerminal && run.pendingObservationCalls.size > 0) {
        for (const _toolCallId of run.pendingObservationCalls) {
          run.observations.push({
            availability: "unavailable",
            assertionStatus: "not-requested",
            assertionResults: [],
            reasons: ["missing-terminal"],
          });
        }
        run.pendingObservationCalls.clear();
      }
      if (filters.project) {
        const runMatchesProject = run.projectId === filters.project;
        const observationMatchesProject = run.observations.some(
          (observation) => observation.projectId === filters.project,
        );
        if (!runMatchesProject && !observationMatchesProject) {
          runs.delete(runId);
        } else if (!runMatchesProject) {
          // Keep a project-scoped result fail-closed when only an observed
          // identity can establish the project; stale/unavailable entries
          // without identity must not leak into another project's summary.
          run.observations = run.observations.filter(
            (observation) => observation.projectId === filters.project,
          );
        } else {
          // A run-start project is the fallback identity for unavailable or
          // stale observations, but an explicit observation project must still
          // agree with the requested scope.
          run.observations = run.observations.filter(
            (observation) =>
              !observation.projectId ||
              observation.projectId === filters.project,
          );
        }
      }
    }
  }
  return [...runs.values()];
}

export function summarizeAgentPreviewObservations(
  dataDir: string,
  filters: Record<string, string | undefined> = {},
  limit = 200,
): PreviewObservationMetricsSummary {
  const runs = readAgentPreviewObservationLogs(dataDir, filters, limit);
  const availability = {
    observed: 0,
    stale: 0,
    unavailable: 0,
    unsupported: 0,
  };
  const assertionStatus = {
    "not-requested": 0,
    passed: 0,
    failed: 0,
    uncertain: 0,
    unsupported: 0,
  };
  const assertionResults = {
    count: 0,
    passed: 0,
    failed: 0,
    uncertain: 0,
    unsupported: 0,
  };
  const latencySamples: number[] = [];
  const payloadSamples: number[] = [];
  const evidenceKinds: Record<string, number> = {};
  const precisions: Record<string, number> = {};
  const runtimeTypes: Record<string, number> = {};
  let timeoutCount = 0;
  let staleCount = 0;
  let eligibleRuns = 0;
  let successfulRuns = 0;
  let observationRunCount = 0;

  for (const run of runs) {
    if (run.observations.length > 0) observationRunCount += 1;
    let runPassed = false;
    let runEligible = false;
    for (const observation of run.observations) {
      availability[observation.availability] += 1;
      assertionStatus[observation.assertionStatus] += 1;
      for (const assertion of observation.assertionResults) {
        assertionResults.count += 1;
        assertionResults[assertion.status] += 1;
        if (assertion.status === "passed") runPassed = true;
      }
      recordFiniteSample(latencySamples, observation.latencyMs);
      recordFiniteSample(payloadSamples, observation.payloadBytes);
      recordCount(evidenceKinds, observation.evidenceKind);
      recordCount(precisions, observation.precision);
      recordCount(runtimeTypes, observation.runtimeType);
      if (observation.availability === "stale") {
        staleCount += 1;
      }
      if (observation.reasons?.some((reason) => reason.includes("timeout")))
        timeoutCount += 1;
      if (
        run.mutationCommitted &&
        observation.assertionStatus !== "not-requested"
      ) {
        runEligible = true;
      }
    }
    if (runEligible) {
      eligibleRuns += 1;
      if (
        run.success === true &&
        run.projectionStatus === "applied" &&
        runPassed
      ) {
        successfulRuns += 1;
      }
    }
  }

  return {
    runCount: runs.length,
    observationRunCount,
    observationRate: runs.length > 0 ? observationRunCount / runs.length : null,
    observationCount: Object.values(availability).reduce(
      (sum, count) => sum + count,
      0,
    ),
    availability,
    assertionStatus,
    assertionResults,
    latencyMs: summarizeSamples(latencySamples),
    latencyP90Ms: percentile(
      latencySamples
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b),
      0.9,
    ),
    payloadBytes: summarizeSamples(payloadSamples),
    payloadP90Bytes: percentile(
      payloadSamples
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b),
      0.9,
    ),
    evidenceKinds,
    precisions,
    runtimeTypes,
    timeoutCount,
    staleCount,
    technicalRepair: {
      eligibleRuns,
      successfulRuns,
      successRate: eligibleRuns > 0 ? successfulRuns / eligibleRuns : null,
      definition:
        "mutationCommitted + explicit assertion + successful finish + applied projection + at least one passed assertion",
    },
  };
}

function incrementCount(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function stringPayload(
  event: EditorDiagnosticEvent,
  key: string,
): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value ? value : undefined;
}

function booleanPayload(event: EditorDiagnosticEvent, key: string): boolean {
  return event.payload[key] === true;
}

/**
 * Summarize sandbox execution failures without exposing source, execution IDs,
 * channel IDs, or any other raw correlation token. The event sanitizer is the
 * first boundary; this aggregate is the CLI's second, stable presentation
 * boundary for text and machine consumers.
 */
export function summarizeSandboxDiagnostics(
  events: EditorDiagnosticEvent[],
): SandboxDiagnosticSummary {
  const sandboxEvents = events.filter(
    (event) =>
      event.eventType === "preview.sandbox_execution_issued" ||
      event.eventType === "preview.sandbox_runtime_failed" ||
      event.eventType === "preview.sandbox_screenshot_completed",
  );
  const runtimeTypes = new Set<string>();
  const policyVersions = new Set<number>();
  const renderers = new Set<string>();
  const failureCodes: Record<string, number> = {};
  const timeoutSamples: number[] = [];
  let executionIssued = 0;
  let runtimeFailures = 0;
  let screenshotsCompleted = 0;
  let policyMismatch = 0;
  let expiredTicket = 0;
  let blockedRequestCount = 0;
  let timeoutCount = 0;
  let contextClosed = 0;
  let browserRestarted = 0;
  let recovered = 0;

  for (const event of sandboxEvents) {
    const runtimeType = stringPayload(event, "runtimeType");
    if (runtimeType) runtimeTypes.add(runtimeType);
    const policy = event.payload.sandboxPolicyVersion;
    if (typeof policy === "number" && Number.isFinite(policy))
      policyVersions.add(policy);
    const renderer = stringPayload(event, "renderer");
    if (renderer) renderers.add(renderer);

    if (event.eventType === "preview.sandbox_execution_issued") {
      executionIssued += 1;
      continue;
    }
    if (event.eventType === "preview.sandbox_screenshot_completed") {
      screenshotsCompleted += 1;
      if (booleanPayload(event, "contextClosed")) contextClosed += 1;
      if (booleanPayload(event, "browserRestarted")) {
        browserRestarted += 1;
        recovered += 1;
      }
      const blocked = numericPayload(event, "blockedRequestCount");
      if (blocked !== undefined) blockedRequestCount += blocked;
      continue;
    }

    runtimeFailures += 1;
    const errorCode = stringPayload(event, "errorCode");
    if (errorCode) {
      incrementCount(failureCodes, errorCode);
      const normalized = errorCode.toLowerCase().replace(/[- ]/g, "_");
      if (normalized.includes("policy") && normalized.includes("mismatch"))
        policyMismatch += 1;
      if (normalized.includes("expired") && normalized.includes("ticket"))
        expiredTicket += 1;
      if (normalized.includes("timeout") || normalized === "timed_out")
        timeoutCount += 1;
    }
    const timeoutMs = numericPayload(event, "timeoutMs");
    if (timeoutMs !== undefined) timeoutSamples.push(timeoutMs);
    const blocked = numericPayload(event, "blockedRequestCount");
    if (blocked !== undefined) blockedRequestCount += blocked;
    if (booleanPayload(event, "contextClosed")) contextClosed += 1;
    if (booleanPayload(event, "browserRestarted")) {
      browserRestarted += 1;
      recovered += 1;
    }
  }

  return {
    eventCount: sandboxEvents.length,
    executionIssued,
    runtimeFailures,
    screenshotsCompleted,
    runtimeTypes: [...runtimeTypes].sort(),
    policyVersions: [...policyVersions].sort((a, b) => a - b),
    renderers: [...renderers].sort(),
    failureCodes,
    policyMismatch,
    expiredTicket,
    blockedRequestCount,
    timeoutCount,
    timeoutMs: summarizeSamples(timeoutSamples),
    contextRecovery: { contextClosed, browserRestarted, recovered },
  };
}

function mergeEvents(
  primary: EditorDiagnosticEvent[],
  fallback: EditorDiagnosticEvent[],
  limit: number,
): EditorDiagnosticEvent[] {
  const byId = new Map(primary.map((event) => [event.id, event]));
  for (const event of fallback)
    if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);
}

function listAgentRunLogs(dataDir: string, events: EditorDiagnosticEvent[]) {
  const sessionIds = Array.from(
    new Set(events.map((event) => event.sessionId).filter(Boolean) as string[]),
  );
  const root = path.join(dataDir, "agent-run-logs");
  return sessionIds.flatMap((sessionId) => {
    const dir = path.join(root, sessionId);
    if (!fs.existsSync(dir)) return [];
    const messageIds = fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => entry.replace(/\.jsonl$/, ""))
      .sort();
    return messageIds.length > 0 ? [{ sessionId, messageIds }] : [];
  });
}

export function buildDiagnosticsResult(
  kind: string,
  options: DiagnosticsOptions,
  filters: Record<string, string | undefined>,
) {
  const dataDir = getDataDir(options);
  const limit = toLimit(options.limit);
  const sqlite = readSqliteEvents(dataDir, filters, limit);
  const warnings: string[] = [];
  if (sqlite.warning) warnings.push(`SQLite 事件库不可用: ${sqlite.warning}`);
  if (sqlite.dbMissing) warnings.push("SQLite 事件库不存在，已尝试 JSONL 兜底");

  const shouldReadFallback =
    CORRELATED_QUERY_KINDS.has(kind) ||
    sqlite.events.length === 0 ||
    Boolean(sqlite.warning) ||
    sqlite.dbMissing;
  const rawJsonlEvents = shouldReadFallback
    ? applyFilters(readJsonlEvents(dataDir), filters, limit)
    : [];
  const sqliteEventIds = new Set(sqlite.events.map((event) => event.id));
  const jsonlEvents =
    sqliteEventIds.size > 0
      ? rawJsonlEvents.filter((event) => !sqliteEventIds.has(event.id))
      : rawJsonlEvents;
  if (jsonlEvents.length > 0) {
    warnings.push("已读取 JSONL fallback/spool 事件，SQLite 仍是诊断主账本");
  }
  const events = CORRELATED_QUERY_KINDS.has(kind)
    ? mergeEvents(sqlite.events, jsonlEvents, limit)
    : sqlite.events.length > 0
      ? sqlite.events
      : jsonlEvents;
  const eventsForRunLogs = mergeEvents(sqlite.events, jsonlEvents, limit);

  const diagnostics: EditorDiagnosticQueryDiagnostics = {
    sqliteUsed: sqlite.events.length > 0,
    jsonlFallbackUsed:
      jsonlEvents.length > 0 || sqlite.dbMissing || Boolean(sqlite.warning),
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
    previewObservations: summarizeAgentPreviewObservations(
      dataDir,
      filters,
      limit,
    ),
    sandbox: summarizeSandboxDiagnostics(events),
    fallbackEvents: jsonlEvents.length > 0 ? jsonlEvents : undefined,
    agentRunLogs: listAgentRunLogs(dataDir, eventsForRunLogs),
  };
}

function isDiagnosticFailure(event: EditorDiagnosticEvent): boolean {
  return event.level === "error" || event.eventType.endsWith("_failed");
}

export function formatDiagnosticFailureDetails(
  event: EditorDiagnosticEvent,
): string {
  if (!isDiagnosticFailure(event)) return "";

  const details: string[] = [
    `workspace=${event.workspaceId || "-"}`,
    `page=${event.pageId || "-"}`,
  ];
  const phase = event.payload.phase;
  const errorCode = event.payload.errorCode;
  const httpStatus = event.payload.httpStatus;
  if (typeof phase === "string" && phase) details.push(`phase=${phase}`);
  if (typeof errorCode === "string" && errorCode)
    details.push(`code=${errorCode}`);
  if (typeof httpStatus === "number" || typeof httpStatus === "string") {
    details.push(`status=${httpStatus}`);
  }
  return details.length > 0 ? ` ${details.join(" ")}` : "";
}

function printTextTimeline(
  events: EditorDiagnosticEvent[],
  diagnostics: EditorDiagnosticQueryDiagnostics,
): void {
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
  sandbox: SandboxDiagnosticSummary,
  previewObservations: PreviewObservationMetricsSummary,
): void {
  if (flows.length > 0) {
    showInfo(`Workspace revision flows: ${flows.length}`);
    for (const flow of flows) {
      console.log(
        `  workspace=${flow.workspaceId} revision=${flow.revision} status=${flow.status} events=${flow.eventTypes.join(",")}`,
      );
    }
  }
  if (previewObservations.observationCount > 0) {
    const summary = previewObservations;
    showInfo("Preview observation summary");
    console.log(
      `  runs=${summary.runCount} observationRuns=${summary.observationRunCount} observationRate=${summary.observationRate === null ? "-" : `${(summary.observationRate * 100).toFixed(1)}%`} observations=${summary.observationCount} observed=${summary.availability.observed} stale=${summary.staleCount} timeout=${summary.timeoutCount}`,
    );
    console.log(
      `  latencyP50Ms=${summary.latencyMs.p50 ?? "-"} latencyP90Ms=${summary.latencyP90Ms ?? "-"} payloadP50Bytes=${summary.payloadBytes.p50 ?? "-"} payloadP90Bytes=${summary.payloadP90Bytes ?? "-"}`,
    );
    console.log(
      `  assertions=${summary.assertionResults.count} passed=${summary.assertionResults.passed} failed=${summary.assertionResults.failed} uncertain=${summary.assertionResults.uncertain} unsupported=${summary.assertionResults.unsupported}`,
    );
    console.log(
      `  technicalRepair=${summary.technicalRepair.successRate === null ? "-" : `${(summary.technicalRepair.successRate * 100).toFixed(1)}%`} eligible=${summary.technicalRepair.eligibleRuns}`,
    );
  }
  const populated = Object.entries(performance.metrics).filter(
    ([, summary]) => summary.count > 0,
  );
  if (populated.length > 0) {
    showInfo("Performance percentiles (ms)");
    for (const [name, summary] of populated) {
      console.log(
        `  ${name}: count=${summary.count} p50=${summary.p50} p95=${summary.p95} p99=${summary.p99} max=${summary.max}`,
      );
    }
  }
  if (sandbox.eventCount > 0) {
    showInfo("Sandbox runtime summary");
    console.log(
      `  events=${sandbox.eventCount} issued=${sandbox.executionIssued} failures=${sandbox.runtimeFailures} screenshots=${sandbox.screenshotsCompleted}`,
    );
    console.log(
      `  runtime=${sandbox.runtimeTypes.join(",") || "-"} policy=${sandbox.policyVersions.join(",") || "-"} renderer=${sandbox.renderers.join(",") || "-"}`,
    );
    console.log(
      `  policyMismatch=${sandbox.policyMismatch} expiredTicket=${sandbox.expiredTicket} blockedRequests=${sandbox.blockedRequestCount}`,
    );
    console.log(
      `  timeoutCount=${sandbox.timeoutCount} timeoutP95Ms=${sandbox.timeoutMs.p95 ?? "-"} contextClosed=${sandbox.contextRecovery.contextClosed} browserRestarted=${sandbox.contextRecovery.browserRestarted} recovered=${sandbox.contextRecovery.recovered}`,
    );
    const failureCodes = Object.entries(sandbox.failureCodes)
      .map(([code, count]) => `${code}=${count}`)
      .join(", ");
    if (failureCodes) console.log(`  failureCodes=${failureCodes}`);
  }
}

export async function queryDiagnostics(
  kind: string,
  options: DiagnosticsOptions,
): Promise<void> {
  const since = parseSince(
    options.since,
    kind === "recent" || kind === "project" ? 24 : undefined,
  );
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
  const snapshot = remoteHost
    ? await createRemoteDiagnosticsSnapshot(options)
    : null;

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
      fs.mkdirSync(path.dirname(path.resolve(options.output)), {
        recursive: true,
      });
      fs.writeFileSync(
        path.resolve(options.output),
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8",
      );
    }

    if (options.format === "text") {
      printTextTimeline(result.events, result.diagnostics);
      printTextAnalysis(
        result.workspaceFlows,
        result.performance,
        result.sandbox,
        result.previewObservations,
      );
      return;
    }

    outputJson(result);
  } finally {
    snapshot?.cleanup();
  }
}

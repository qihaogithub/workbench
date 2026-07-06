export const EDITOR_DIAGNOSTIC_SCHEMA_VERSION = 1;

export type EditorDiagnosticSource =
  | "frontend"
  | "author-api"
  | "agent-service"
  | "preview"
  | "ai-run"
  | "cli";

export type EditorDiagnosticLevel = "debug" | "info" | "warn" | "error";

export type EditorDiagnosticEventGroup =
  | "collab"
  | "autosave"
  | "ai"
  | "preview"
  | "project"
  | "publish"
  | "page"
  | "ui"
  | "system";

export interface LegacyEditorDiagnosticContext {
  editorSessionId: string;
  projectId: string;
  sessionId?: string;
  workspaceId?: string;
  activePageId?: string;
  previewMode?: "single" | "canvas";
}

export interface LegacyEditorDiagnosticEvent extends LegacyEditorDiagnosticContext {
  id: string;
  timestamp: number;
  category: EditorDiagnosticEventGroup;
  name: string;
  traceId?: string;
  level?: EditorDiagnosticLevel;
  details?: Record<string, unknown>;
}

export interface EditorDiagnosticEvent {
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

export interface EditorDiagnosticQueryDiagnostics {
  sqliteUsed: boolean;
  jsonlFallbackUsed: boolean;
  dbUnavailable: boolean;
  eventGapDetected: boolean;
  warnings: string[];
}

export interface EditorDiagnosticQueryResult {
  success: true;
  query: Record<string, unknown>;
  diagnostics: EditorDiagnosticQueryDiagnostics;
  events: EditorDiagnosticEvent[];
}

const SENSITIVE_KEY_PATTERN =
  /(authorization|password|passwd|secret|token|api[-_]?key|apikey|access[-_]?key|private[-_]?key|cookie)/i;

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "code",
  "content",
  "schema",
  "prompt",
  "response",
  "diff",
  "toolResult",
  "tool_result",
  "databaseSnapshot",
]);

const DEFAULT_ALLOWED_PAYLOAD_KEYS = new Set([
  "activeWorkspaceId",
  "baseVersion",
  "baseVersionAfter",
  "baseVersionBefore",
  "candidateResourcePaths",
  "changedFiles",
  "compileHash",
  "contentHash",
  "contentHashAfter",
  "contentHashBefore",
  "contentLength",
  "contentLengthAfter",
  "contentLengthBefore",
  "diagnosticCodes",
  "dirty",
  "durationMs",
  "enabled",
  "errorCode",
  "errorMessage",
  "errorName",
  "fileChangeCount",
  "fileCount",
  "hash",
  "kind",
  "latestVersionId",
  "line",
  "matchedRooms",
  "messageId",
  "method",
  "model",
  "mtime",
  "normalizedPaths",
  "pageId",
  "path",
  "previewMode",
  "publishTarget",
  "resourcePath",
  "revision",
  "runId",
  "sessionExpiresAt",
  "stackHash",
  "status",
  "success",
  "syncStatus",
  "toolCallId",
  "toolName",
  "traceId",
  "versionId",
  "versionType",
  "workspacePath",
]);

const EVENT_PAYLOAD_ALLOWLIST: Record<string, readonly string[]> = {
  "ai.message_submitted": ["messageId", "contentLength", "model"],
  "ai.run_started": ["messageId", "runId", "contentLength", "model", "workingDir", "demoId", "logPath"],
  "ai.tool_call_started": ["messageId", "runId", "toolCallId", "toolName", "kind", "status"],
  "ai.tool_call_finished": [
    "messageId",
    "runId",
    "toolCallId",
    "toolName",
    "status",
    "durationMs",
    "errorMessage",
    "fileChangeCount",
    "changedFiles",
  ],
  "ai.file_change_detected": ["messageId", "runId", "method", "path", "contentLength"],
  "ai.run_finished": [
    "messageId",
    "runId",
    "success",
    "finishContentLength",
    "accumulatedStreamLength",
    "toolResultCount",
    "subagentResultCount",
    "fileOperationCount",
    "fileCount",
  ],
  "ai.run_failed": ["messageId", "runId", "errorCode", "errorMessage"],
  "preview.compile_started": ["compileHash", "pageId", "resourcePath"],
  "preview.compile_succeeded": ["compileHash", "durationMs", "runtimeValidationOk"],
  "preview.compile_failed": ["compileHash", "errorName", "errorMessage", "line", "column"],
  "preview.runtime_event": ["level", "stage", "sinceStart", "requestId", "pageId"],
  "preview.error": [
    "source",
    "stage",
    "errorCode",
    "errorName",
    "errorMessage",
    "file",
    "message",
    "instruction",
    "pageId",
    "moduleName",
    "importName",
    "moduleHash",
    "codeHash",
  ],
  "preview.runtime_error": ["errorName", "errorMessage", "line", "column", "stackHash"],
  "page.sketch_patch_rejected": [
    "reason",
    "status",
    "success",
    "operationCount",
    "hasBaseSceneKey",
    "currentNodeCount",
    "targetNodeCount",
    "targetSource",
  ],
  "page.sketch_patch_validated": [
    "status",
    "success",
    "operationCount",
    "hasBaseSceneKey",
    "currentNodeCount",
    "targetNodeCount",
    "targetSource",
  ],
};

function truncateText(value: string, limit = 500): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...[truncated:${value.length}]`;
}

function summarizeForbiddenValue(value: unknown): unknown {
  if (typeof value === "string") {
    return { length: value.length, redacted: true };
  }
  if (Array.isArray(value)) {
    return { items: value.length, redacted: true };
  }
  if (value && typeof value === "object") {
    return { keys: Object.keys(value as Record<string, unknown>).length, redacted: true };
  }
  return "[redacted]";
}

function sanitizeAllowedValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateText(value.message),
    };
  }
  if (depth >= 5) return "[max-depth]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeAllowedValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[redacted]";
      } else if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
        result[key] = summarizeForbiddenValue(nested);
      } else {
        result[key] = sanitizeAllowedValue(nested, depth + 1);
      }
    }
    return result;
  }
  return String(value);
}

export function sanitizeDiagnosticPayload(
  eventType: string,
  payload?: Record<string, unknown>,
): Record<string, unknown> {
  if (!payload) return {};

  const allowed = new Set([
    ...DEFAULT_ALLOWED_PAYLOAD_KEYS,
    ...(EVENT_PAYLOAD_ALLOWLIST[eventType] ?? []),
  ]);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      result[key] = summarizeForbiddenValue(value);
      continue;
    }
    if (!allowed.has(key)) continue;
    result[key] = sanitizeAllowedValue(value, 0);
  }

  return result;
}

export function sanitizeDiagnosticDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return sanitizeAllowedValue(details, 0) as Record<string, unknown>;
}

export function sanitizeLegacyEditorDiagnosticEvent(
  event: LegacyEditorDiagnosticEvent,
): LegacyEditorDiagnosticEvent {
  return {
    ...event,
    details: sanitizeDiagnosticDetails(event.details),
  };
}

export function isValidEditorSessionId(editorSessionId: string): boolean {
  return /^[a-zA-Z0-9._:-]{8,120}$/.test(editorSessionId);
}

export function normalizeEditorDiagnosticEvent(
  event: LegacyEditorDiagnosticEvent | EditorDiagnosticEvent,
  source: EditorDiagnosticSource = "frontend",
): EditorDiagnosticEvent {
  if ("schemaVersion" in event && "eventType" in event) {
    return {
      ...event,
      schemaVersion: event.schemaVersion || EDITOR_DIAGNOSTIC_SCHEMA_VERSION,
      payload: sanitizeDiagnosticPayload(event.eventType, event.payload),
    };
  }

  return {
    id: event.id,
    schemaVersion: EDITOR_DIAGNOSTIC_SCHEMA_VERSION,
    ts: new Date(event.timestamp).toISOString(),
    source,
    level: event.level ?? "info",
    eventGroup: event.category,
    eventType: event.name,
    projectId: event.projectId,
    sessionId: event.sessionId,
    workspaceId: event.workspaceId,
    editorSessionId: event.editorSessionId,
    traceId: event.traceId,
    pageId: event.activePageId,
    payload: sanitizeDiagnosticPayload(event.name, event.details),
  };
}

export function createEditorDiagnosticEvent(
  input: Omit<EditorDiagnosticEvent, "schemaVersion" | "ts" | "payload"> & {
    ts?: string;
    payload?: Record<string, unknown>;
  },
): EditorDiagnosticEvent {
  return {
    ...input,
    schemaVersion: EDITOR_DIAGNOSTIC_SCHEMA_VERSION,
    ts: input.ts ?? new Date().toISOString(),
    payload: sanitizeDiagnosticPayload(input.eventType, input.payload),
  };
}

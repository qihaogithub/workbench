export type EditorDiagnosticCategory =
  | "collab"
  | "autosave"
  | "ai"
  | "preview"
  | "ui"
  | "system";

export type EditorDiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface EditorDiagnosticContext {
  editorSessionId: string;
  projectId: string;
  sessionId?: string;
  workspaceId?: string;
  activePageId?: string;
  previewMode?: "single" | "canvas";
}

export interface EditorDiagnosticEvent extends EditorDiagnosticContext {
  id: string;
  timestamp: number;
  category: EditorDiagnosticCategory;
  name: string;
  traceId?: string;
  level?: EditorDiagnosticLevel;
  details?: Record<string, unknown>;
}

export interface EditorDiagnosticAgentRunLogIndex {
  sessionId: string;
  messageIds: string[];
}

export interface EditorDiagnosticExport {
  editorSessionId: string;
  exportedAt: number;
  events: EditorDiagnosticEvent[];
  localEvents?: EditorDiagnosticEvent[];
  snapshot?: Record<string, unknown>;
  agentRunLogs: EditorDiagnosticAgentRunLogIndex[];
  warnings: string[];
}

const SENSITIVE_KEY_PATTERN =
  /(authorization|password|passwd|secret|token|api[-_]?key|apikey|access[-_]?key|private[-_]?key)/i;
const LONG_TEXT_LIMIT = 500;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 80;
const MAX_DEPTH = 5;

function truncateText(value: string): string {
  if (value.length <= LONG_TEXT_LIMIT) return value;
  return `${value.slice(0, LONG_TEXT_LIMIT)}...[truncated:${value.length}]`;
}

function sanitizeUnknown(value: unknown, depth: number): unknown {
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
  if (depth >= MAX_DEPTH) return "[max-depth]";
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeUnknown(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_OBJECT_KEYS,
    );
    for (const [key, nested] of entries) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[redacted]";
        continue;
      }
      if (key === "code" || key === "schema" || key === "content" || key === "prompt") {
        result[key] =
          typeof nested === "string"
            ? { length: nested.length, redacted: true }
            : "[redacted]";
        continue;
      }
      result[key] = sanitizeUnknown(nested, depth + 1);
    }
    return result;
  }
  return String(value);
}

export function sanitizeDiagnosticDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return sanitizeUnknown(details, 0) as Record<string, unknown>;
}

export function sanitizeDiagnosticEvent(
  event: EditorDiagnosticEvent,
): EditorDiagnosticEvent {
  return {
    ...event,
    details: sanitizeDiagnosticDetails(event.details),
  };
}

export function isValidEditorSessionId(editorSessionId: string): boolean {
  return /^[a-zA-Z0-9._:-]{8,120}$/.test(editorSessionId);
}

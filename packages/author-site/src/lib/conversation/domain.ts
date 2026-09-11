export const CONVERSATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_MESSAGE_CONTENT_BYTES = 256 * 1024;
export const MAX_DISPLAY_PARTS_BYTES = 64 * 1024;
export const MAX_RUN_ARTIFACT_BYTES = 512 * 1024;
export const MAX_CONTEXT_SUMMARY_BYTES = 64 * 1024;
export const MAX_CONTEXT_SUMMARY_TAIL_MESSAGES = 24;
export const MAX_CONTEXT_SUMMARY_TAIL_BYTES = 48 * 1024;
export const MAX_RUN_TRACE_EVENTS = 500;
export const MAX_RUN_TRACE_BYTES = 256 * 1024;

export type ConversationStatus = "active" | "archived" | "deleted";
export type ConversationMessageRole = "user" | "assistant";
export type ConversationMessageStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "superseded";
export type ConversationRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export type ConversationTerminalStatus = Exclude<
  ConversationRunStatus,
  "queued" | "running"
>;

export interface ConversationRecord {
  id: string;
  userId: string;
  projectId: string;
  workspaceId: string | null;
  title: string | null;
  status: ConversationStatus;
  revision: number;
  lastSequence: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  deletedAt: number | null;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  clientMessageId: string | null;
  sequence: number;
  role: ConversationMessageRole;
  kind: string | null;
  status: ConversationMessageStatus;
  content: string;
  displayParts: unknown[];
  createdAt: number;
  completedAt: number | null;
  metadata: Record<string, unknown>;
}

export interface ConversationRunRecord {
  id: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: ConversationRunStatus;
  modelProvider: string | null;
  modelId: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  errorCode: string | null;
  usage: Record<string, unknown>;
  summary: Record<string, unknown>;
  traceId: string | null;
}

export type ConversationTraceEventSource =
  | "model"
  | "tool"
  | "subagent"
  | "system";

export interface ConversationTraceFileChange {
  path: string;
  action: "created" | "modified" | "deleted";
}

export interface ConversationTraceEventInput {
  occurredAt: number;
  source: ConversationTraceEventSource;
  eventType: string;
  title: string;
  status?: string;
  toolName?: string;
  toolCallId?: string;
  durationMs?: number;
  errorCode?: string;
  summary?: string;
  metrics?: Record<string, unknown>;
  files?: ConversationTraceFileChange[];
}

export interface ConversationTraceEventRecord
  extends ConversationTraceEventInput {
  id: string;
  conversationId: string;
  runId: string;
  sequence: number;
}

export interface ConversationContextSummaryTailMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationContextSummaryRecord {
  schemaVersion: number;
  summaryVersion: number;
  conversationId: string;
  sourceRevision: number;
  coveredThroughSequence: number;
  summaryText: string;
  tailMessages: ConversationContextSummaryTailMessage[];
  summaryHash: string;
  createdAt: number;
}

export interface ConversationContextSummaryInput {
  schemaVersion: 1;
  reason: "preflight" | "overflow_recovery";
  sourceRevision: number;
  coveredThroughSequence: number;
  summaryText: string;
  tailMessages: ConversationContextSummaryTailMessage[];
}

export interface ConversationRunArtifactRecord {
  id: string;
  conversationId: string;
  runId: string;
  messageId: string;
  mimeType: "application/json";
  sizeBytes: number;
  sha256: string;
  payload: unknown[];
  createdAt: number;
  expiresAt: number;
}

export interface ConversationReliabilitySnapshot {
  generatedAt: number;
  staleRunThresholdMs: number;
  totals: {
    conversations: number;
    messages: number;
    acceptedUserMessages: number;
    runs: number;
    terminalRuns: number;
    nonterminalRuns: number;
    staleNonterminalRuns: number;
    contextSummaries: number;
    runArtifacts: number;
  };
  terminalCompletenessRate: number | null;
  runStatus: Record<ConversationRunStatus, number>;
  outbox: {
    pending: number;
    retried: number;
  };
}

export interface ConversationProjection {
  conversation: ConversationRecord;
  messages: ConversationMessageRecord[];
  runs: ConversationRunRecord[];
}

export interface AdminConversationFilter {
  projectId?: string;
  userId?: string;
  from?: number;
  to?: number;
  cursor?: { updatedAt: number; id: string };
  limit?: number;
}

export interface AdminConversationSummary {
  conversation: ConversationRecord;
  messageCount: number;
  runCount: number;
  lastRunStatus: ConversationRunStatus | null;
  lastModelId: string | null;
}

export interface AdminConversationListResult {
  items: AdminConversationSummary[];
  nextCursor: { updatedAt: number; id: string } | null;
}

export interface AdminConversationProjection extends ConversationProjection {
  traceEvents: ConversationTraceEventRecord[];
}

export interface ConversationAttachmentInput {
  storageRef: string;
  sha256?: string;
  mimeType?: string;
  sizeBytes: number;
}

export interface ConversationDeletionScope {
  conversationId: string;
  ownerUserId: string;
  projectId: string;
}

export interface AppendUserMessageCommand {
  conversationId: string;
  ownerUserId: string;
  clientMessageId: string;
  content: string;
  displayParts?: unknown[];
  attachments?: ConversationAttachmentInput[];
  kind?: string;
  now?: number;
}

export interface MessageAcceptedAck {
  conversationId: string;
  messageId: string;
  assistantMessageId: string;
  runId: string;
  sequence: number;
  serverCreatedAt: number;
  conversationRevision: number;
  status: "accepted";
}

export interface StartRunCommand {
  conversationId: string;
  runId: string;
  messageId: string;
  assistantMessageId: string;
  ownerUserId: string;
  projectId: string;
  agentSessionId: string;
  modelProvider?: string;
  modelId?: string;
  traceId?: string;
  now?: number;
}

export interface RunStartAck {
  conversationId: string;
  runId: string;
  messageId: string;
  assistantMessageId: string;
  conversationRevision: number;
  historyBaseRevision: number;
  historyBeforeRun: ConversationMessageRecord[];
  currentUserMessage: ConversationMessageRecord;
  contextSummary: ConversationContextSummaryRecord | null;
}

export interface CommitRunTerminalCommand {
  conversationId: string;
  runId: string;
  messageId: string;
  assistantMessageId: string;
  ownerUserId: string;
  projectId: string;
  status: ConversationTerminalStatus;
  content?: string;
  displayParts?: unknown[];
  errorCode?: string;
  usage?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  traceId?: string;
  traceEvents?: ConversationTraceEventInput[];
  contextSummary?: ConversationContextSummaryInput;
  now?: number;
}

export interface RunTerminalAck {
  conversationId: string;
  runId: string;
  messageId: string;
  assistantMessageId: string;
  status: ConversationTerminalStatus;
  conversationRevision: number;
  assistantMessage: ConversationMessageRecord | null;
}

export interface CancelRunAck {
  conversationId: string;
  runId: string;
  status: ConversationRunStatus;
  cancelRequested: true;
  conversationRevision: number;
}

export type ConversationErrorCode =
  | "CONVERSATION_NOT_FOUND"
  | "CONVERSATION_FORBIDDEN"
  | "CONVERSATION_CONFLICT"
  | "CONVERSATION_INVALID"
  | "CONVERSATION_TOO_LARGE"
  | "CONVERSATION_STORE_UNAVAILABLE";

export class ConversationDomainError extends Error {
  constructor(
    readonly code: ConversationErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConversationDomainError";
  }
}

export function assertStableId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new ConversationDomainError(
      "CONVERSATION_INVALID",
      `${field} 格式无效`,
    );
  }
  return normalized;
}

export function assertMessageContent(content: string): string {
  if (typeof content !== "string" || !content.trim()) {
    throw new ConversationDomainError(
      "CONVERSATION_INVALID",
      "消息内容不能为空",
    );
  }
  if (Buffer.byteLength(content, "utf8") > MAX_MESSAGE_CONTENT_BYTES) {
    throw new ConversationDomainError(
      "CONVERSATION_TOO_LARGE",
      "消息内容超出大小限制",
    );
  }
  return content;
}

const FORBIDDEN_DISPLAY_KEYS = new Set([
  "result",
  "parameters",
  "prompt",
  "reply",
  "systemPrompt",
  "apiKey",
  "token",
  "cookie",
]);

function sanitizeDisplayValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    if (value.startsWith("data:")) return "[omitted-data-url]";
    return value.slice(0, 8_000);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeDisplayValue(item, depth + 1));
  }
  if (typeof value !== "object") return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_DISPLAY_KEYS.has(key)) continue;
    const next = sanitizeDisplayValue(child, depth + 1);
    if (next !== undefined) sanitized[key] = next;
  }
  return sanitized;
}

export function sanitizeDisplayPartsPayload(parts: unknown): unknown[] {
  if (!Array.isArray(parts)) return [];
  return sanitizeDisplayValue(parts) as unknown[];
}

export function sanitizeDisplayParts(parts: unknown): unknown[] {
  const sanitized = sanitizeDisplayPartsPayload(parts);
  const serialized = JSON.stringify(sanitized);
  if (Buffer.byteLength(serialized, "utf8") > MAX_DISPLAY_PARTS_BYTES) {
    return [{ type: "artifact", status: "omitted", reason: "display_parts_too_large" }];
  }
  return sanitized;
}

const TRACE_SOURCES = new Set<ConversationTraceEventSource>([
  "model",
  "tool",
  "subagent",
  "system",
]);

const TRACE_METRIC_KEYS = new Set([
  "activeToolCount",
  "capabilityGroups",
  "contentLength",
  "contextWindow",
  "done",
  "droppedEvents",
  "fileCount",
  "mutationCommitted",
  "mutationCount",
  "observationCount",
  "previousActiveToolCount",
  "projectionStatus",
  "projectionCount",
  "reason",
  "restoredMessageCount",
  "runtimeValidationOk",
  "success",
  "thoughtEventCount",
  "tokensBefore",
  "toolCallCount",
  "toolKind",
  "toolResultCount",
  "totalContentLength",
]);

function boundedTraceString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function sanitizeTraceMetrics(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!TRACE_METRIC_KEYS.has(key)) continue;
    if (
      item === null ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      result[key] = item;
    } else if (typeof item === "string") {
      result[key] = item.slice(0, 160);
    } else if (
      Array.isArray(item) &&
      item.every((entry) => typeof entry === "string")
    ) {
      result[key] = item.slice(0, 32).map((entry) => entry.slice(0, 80));
    }
  }
  return result;
}

function sanitizeTraceFiles(value: unknown): ConversationTraceFileChange[] {
  if (!Array.isArray(value)) return [];
  const result: ConversationTraceFileChange[] = [];
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const action = record.action;
    if (action !== "created" && action !== "modified" && action !== "deleted") continue;
    const rawPath = boundedTraceString(record.path, 240);
    if (!rawPath) continue;
    const normalizedPath = rawPath.replace(/\\/g, "/");
    if (normalizedPath.startsWith("/") || /^[A-Za-z]:\//.test(normalizedPath)) continue;
    if (!normalizedPath || normalizedPath.split("/").includes("..")) continue;
    result.push({ path: normalizedPath, action });
  }
  return result;
}

function normalizeTraceEvent(
  value: unknown,
): ConversationTraceEventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!TRACE_SOURCES.has(record.source as ConversationTraceEventSource)) return null;
  const eventType = boundedTraceString(record.eventType, 80);
  const title = boundedTraceString(record.title, 160);
  const occurredAt = record.occurredAt;
  if (!eventType || !title || typeof occurredAt !== "number" || !Number.isFinite(occurredAt)) {
    return null;
  }
  const durationMs =
    typeof record.durationMs === "number" &&
    Number.isFinite(record.durationMs) &&
    record.durationMs >= 0
      ? Math.round(record.durationMs)
      : undefined;
  const metrics = sanitizeTraceMetrics(record.metrics);
  const files = sanitizeTraceFiles(record.files);
  return {
    occurredAt: Math.round(occurredAt),
    source: record.source as ConversationTraceEventSource,
    eventType,
    title,
    ...(boundedTraceString(record.status, 40)
      ? { status: boundedTraceString(record.status, 40) }
      : {}),
    ...(boundedTraceString(record.toolName, 120)
      ? { toolName: boundedTraceString(record.toolName, 120) }
      : {}),
    ...(boundedTraceString(record.toolCallId, 160)
      ? { toolCallId: boundedTraceString(record.toolCallId, 160) }
      : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(boundedTraceString(record.errorCode, 120)
      ? { errorCode: boundedTraceString(record.errorCode, 120) }
      : {}),
    ...(boundedTraceString(record.summary, 500)
      ? { summary: boundedTraceString(record.summary, 500) }
      : {}),
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
    ...(files.length > 0 ? { files } : {}),
  };
}

export function normalizeConversationTraceEvents(
  value: unknown,
): ConversationTraceEventInput[] {
  if (!Array.isArray(value)) return [];
  const inputOverflow = Math.max(0, value.length - 2_000);
  const normalized = value
    .slice(0, 2_000)
    .map(normalizeTraceEvent)
    .filter((event): event is ConversationTraceEventInput => event !== null)
    .sort((left, right) => left.occurredAt - right.occurredAt);

  let droppedEvents = inputOverflow + Math.max(
    0,
    normalized.length > MAX_RUN_TRACE_EVENTS
      ? normalized.length - (MAX_RUN_TRACE_EVENTS - 1)
      : 0,
  );
  let selected = normalized.length > MAX_RUN_TRACE_EVENTS
    ? [
        ...normalized.slice(0, 249),
        ...normalized.slice(-(MAX_RUN_TRACE_EVENTS - 250)),
      ]
    : [...normalized];

  const withTruncationMarker = (events: ConversationTraceEventInput[]) => {
    if (droppedEvents <= 0) return events;
    const markerIndex = Math.min(249, events.length);
    const marker: ConversationTraceEventInput = {
      occurredAt:
        events[Math.min(markerIndex, Math.max(0, events.length - 1))]?.occurredAt ?? 0,
      source: "system",
      eventType: "trace_truncated",
      title: "部分高频运行事件已合并",
      status: "truncated",
      metrics: { droppedEvents },
    };
    return [...events.slice(0, markerIndex), marker, ...events.slice(markerIndex)].slice(
      0,
      MAX_RUN_TRACE_EVENTS,
    );
  };

  selected = withTruncationMarker(selected);
  while (
    selected.length > 2 &&
    Buffer.byteLength(JSON.stringify(selected), "utf8") > MAX_RUN_TRACE_BYTES
  ) {
    const removable = selected.findIndex(
      (event, index) =>
        index > 0 &&
        index < selected.length - 1 &&
        event.eventType !== "trace_truncated",
    );
    if (removable < 0) break;
    selected.splice(removable, 1);
    droppedEvents += 1;
  }
  if (droppedEvents > 0) {
    selected = selected.filter((event) => event.eventType !== "trace_truncated");
    selected = withTruncationMarker(selected);
    while (
      selected.length > 2 &&
      Buffer.byteLength(JSON.stringify(selected), "utf8") > MAX_RUN_TRACE_BYTES
    ) {
      const removable = selected.findIndex(
        (event, index) =>
          index > 0 &&
          index < selected.length - 1 &&
          event.eventType !== "trace_truncated",
      );
      if (removable < 0) break;
      selected.splice(removable, 1);
      droppedEvents += 1;
      const marker = selected.find((event) => event.eventType === "trace_truncated");
      if (marker?.metrics) marker.metrics.droppedEvents = droppedEvents;
    }
  }
  return selected;
}

export function isTerminalRunStatus(
  status: ConversationRunStatus,
): status is ConversationTerminalStatus {
  return status !== "queued" && status !== "running";
}

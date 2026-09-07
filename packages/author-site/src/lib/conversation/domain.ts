export const CONVERSATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_MESSAGE_CONTENT_BYTES = 256 * 1024;
export const MAX_DISPLAY_PARTS_BYTES = 64 * 1024;
export const MAX_RUN_ARTIFACT_BYTES = 512 * 1024;
export const MAX_CONTEXT_SUMMARY_BYTES = 64 * 1024;
export const MAX_CONTEXT_SUMMARY_TAIL_MESSAGES = 24;
export const MAX_CONTEXT_SUMMARY_TAIL_BYTES = 48 * 1024;

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

export function isTerminalRunStatus(
  status: ConversationRunStatus,
): status is ConversationTerminalStatus {
  return status !== "queued" && status !== "running";
}

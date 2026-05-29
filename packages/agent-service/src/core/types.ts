// ============================================================
// 基础类型
// ============================================================

export type AgentType = "opencode" | "opencode-http" | "claude" | "codex" | "gemini" | "pi-agent" | string;

export type AgentStatus =
  | "initializing"
  | "ready"
  | "processing"
  | "error"
  | "destroyed";

export type ErrorCode =
  | "INVALID_PARAMS"
  | "SESSION_NOT_FOUND"
  | "AGENT_NOT_INITIALIZED"
  | "BACKEND_UNAVAILABLE"
  | "MESSAGE_SEND_ERROR"
  | "MESSAGE_TIMEOUT"
  | "FILE_ACCESS_DENIED"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

// ============================================================
// 配置类型
// ============================================================

export interface AgentConfig {
  sessionId: string;
  backend?: AgentType;
  workingDir?: string;
  demoId?: string;
  model?: string;
  timeout?: number;

  opencode?: OpenCodeConfig;
  claude?: ClaudeConfig;
  codex?: CodexConfig;
  gemini?: GeminiConfig;
  piAgent?: PiAgentConfig;
}

export interface OpenCodeConfig {
  serverUrl?: string;
  timeout?: number;
}

export interface ClaudeConfig {
  apiKey?: string;
  model?: string;
  timeout?: number;
}

export interface CodexConfig {
  apiKey?: string;
  model?: string;
  timeout?: number;
}

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  timeout?: number;
}

export interface PiAgentConfig {
  apiKey?: string;
  model?: string;
  provider?: string;  // "anthropic" | "openai" | "google"
  baseUrl?: string;   // 自定义 API 基础地址（OpenAI 兼容格式）
  timeout?: number;
}

// ============================================================
// 消息类型
// ============================================================

export interface SendMessageOptions {
  timeout?: number;
  stream?: boolean;
  images?: ImageAttachment[];
  context?: MessageContext;
}

export interface ImageAttachment {
  data: string;
  mimeType: string;
  name: string;
}

export interface MessageContext {
  files?: string[];
  presetRules?: string;
}

export interface AgentResult {
  success: boolean;
  content?: string;
  files?: FileChange[];
  error?: AgentError;
  metadata?: ResultMetadata;
}

export interface FileChange {
  path: string;
  action: "created" | "modified" | "deleted";
  content?: string;
}

export interface AgentError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export interface ResultMetadata {
  model?: string;
  tokens?: {
    prompt: number;
    completion: number;
  };
  duration?: number;
}

// ============================================================
// 事件类型
// ============================================================

export type EventType =
  | "stream"
  | "thought"
  | "tool_call"
  | "tool_call_update"
  | "plan"
  | "error"
  | "finish"
  | "status";

export interface StreamEvent {
  type: "stream";
  sessionId: string;
  content: string;
  done: boolean;
}

export interface ThoughtEvent {
  type: "thought";
  sessionId: string;
  content: string;
  done: boolean;
}

export interface ToolCallEvent {
  type: "tool_call";
  sessionId: string;
  toolCallId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  title: string;
  kind: "read" | "edit" | "execute";
}

export interface ToolCallUpdateEvent {
  type: "tool_call_update";
  sessionId: string;
  toolCallId: string;
  status: "completed" | "failed";
}

export interface ErrorEvent {
  type: "error";
  sessionId: string;
  error: AgentError;
}

export interface FinishEvent {
  type: "finish";
  sessionId: string;
  result: AgentResult;
}

export interface StatusEvent {
  type: "status";
  sessionId: string;
  status: AgentStatus;
}

export interface FileOperationEvent {
  type: "file_operation";
  sessionId: string;
  fileOperation: {
    method: string;
    path: string;
    content?: string;
  };
}

export interface PlanEvent {
  type: "plan";
  sessionId: string;
  content: string;
}

export type AgentEvent =
  | StreamEvent
  | ThoughtEvent
  | ToolCallEvent
  | ToolCallUpdateEvent
  | PlanEvent
  | ErrorEvent
  | FinishEvent
  | StatusEvent
  | FileOperationEvent;

export type EventHandler<T extends AgentEvent = AgentEvent> = (
  event: T,
) => void;

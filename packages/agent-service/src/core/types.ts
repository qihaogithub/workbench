import type { BackendProvidersConfig } from "@opencode-workbench/shared";

// ============================================================
// 基础类型
// ============================================================

export type AgentType = "pi-agent";

// 权限配置类型（PI-1 已实现，路径和命令的白/黑名单）
// 实际定义在 backends/pi-tools/permissions.ts（避免循环引用），
// 这里以 type alias 方式复用
export type { PermissionConfig } from "../backends/pi-tools/permissions";

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
  workingDir?: string;
  demoId?: string;
  model?: string;
  toolMode?: "workbench" | "viewer-readonly";
  toolVersion?: number;
  timeout?: number;
  permissions?: import("../backends/pi-tools/permissions").PermissionConfig;
  backendProviders?: BackendProvidersConfig;

  piAgent?: PiAgentConfig;
}

export interface PiAgentConfig {
  apiKey?: string;
  model?: string;
  provider?: string;  // "anthropic" | "openai" | "google"
  baseUrl?: string;   // 自定义 API 基础地址（OpenAI 兼容格式）
  timeout?: number;
  subagentsEnabled?: boolean;
  subagentTimeout?: number;
  thinkingLevel?: string;  // "off" | "low" | "medium" | "high" — AgentHarness 思考级别
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

export type PlanItemStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface PlanItem {
  id: string;
  title: string;
  status: PlanItemStatus;
}

export interface AgentError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export interface ResultMetadata {
  model?: string;
  emptyResponseDebug?: unknown;
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
  | "status"
  | "permission_request";

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
  parameters?: Record<string, unknown>;
}

export interface ToolCallUpdateEvent {
  type: "tool_call_update";
  sessionId: string;
  toolCallId: string;
  status: "completed" | "failed";
  content?: string;
  result?: unknown;
  details?: unknown;
  durationMs?: number;
  error?: {
    message?: string;
  };
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

export interface PermissionRequestEvent {
  type: "permission_request";
  sessionId: string;
  permissionRequest: {
    sessionId: string;
    options: Array<{
      optionId: string;
      name: string;
    }>;
    toolCall: {
      toolCallId: string;
      title?: string;
      kind?: string;
      summary?: string;
      planId?: string;
      approvalKind?: "delete" | "plan_approval";
      editable?: boolean;
      initialContent?: string;
    };
  };
}

export interface ConfigUpdatedEvent {
  type: "config_updated";
  sessionId: string;
  config: AgentConfig;
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
  | FileOperationEvent
  | PermissionRequestEvent
  | ConfigUpdatedEvent;

export type EventHandler<T extends AgentEvent = AgentEvent> = (
  event: T,
) => void;

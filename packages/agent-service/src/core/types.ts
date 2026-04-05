// ============================================================
// 基础类型
// ============================================================

export type AgentType = 'opencode' | 'claude' | 'codex' | 'gemini' | string;

export type AgentStatus =
  | 'initializing'
  | 'ready'
  | 'processing'
  | 'error'
  | 'destroyed';

export type ErrorCode =
  | 'INVALID_PARAMS'
  | 'SESSION_NOT_FOUND'
  | 'AGENT_NOT_INITIALIZED'
  | 'BACKEND_UNAVAILABLE'
  | 'MESSAGE_SEND_ERROR'
  | 'FILE_ACCESS_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

// ============================================================
// 配置类型
// ============================================================

export interface AgentConfig {
  sessionId: string;
  backend?: AgentType;
  workingDir?: string;
  demoId?: string;

  opencode?: OpenCodeConfig;
  claude?: ClaudeConfig;
}

export interface OpenCodeConfig {
  serverUrl?: string;
  timeout?: number;
}

export interface ClaudeConfig {
  apiKey?: string;
  model?: string;
}

// ============================================================
// 消息类型
// ============================================================

export interface SendMessageOptions {
  timeout?: number;
  stream?: boolean;
  context?: MessageContext;
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
  action: 'created' | 'modified' | 'deleted';
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

export type EventType = 'stream' | 'error' | 'finish' | 'status';

export interface StreamEvent {
  type: 'stream';
  sessionId: string;
  content: string;
  done: boolean;
}

export interface ErrorEvent {
  type: 'error';
  sessionId: string;
  error: AgentError;
}

export interface FinishEvent {
  type: 'finish';
  sessionId: string;
  result: AgentResult;
}

export interface StatusEvent {
  type: 'status';
  sessionId: string;
  status: AgentStatus;
}

export type AgentEvent = StreamEvent | ErrorEvent | FinishEvent | StatusEvent;

export type EventHandler<T extends AgentEvent = AgentEvent> = (event: T) => void;

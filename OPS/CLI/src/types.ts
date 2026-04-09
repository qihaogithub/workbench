/**
 * CLI 测试工具 - 类型定义
 */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AgentResult {
  success: boolean;
  content?: string;
  files?: FileChange[];
  error?: AgentError;
  metadata?: Record<string, unknown>;
}

export interface FileChange {
  path: string;
  action: "created" | "modified" | "deleted";
  content?: string;
}

export interface AgentError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AgentInfo {
  sessionId: string;
  status: string;
  backend: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  workingDir?: string;
}

export interface SessionInfo {
  sessionId: string;
  status: string;
  messageCount: number;
  workingDir?: string;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  uptime: number;
  agents: number;
}

export interface HttpMessageOptions {
  sessionId: string;
  message: string;
  demoId?: string;
  workingDir?: string;
  backend?: string;
  timeout?: number;
}

export interface WebSocketStreamOptions {
  sessionId: string;
  message: string;
  workingDir?: string;
  timeout?: number;
  wait?: boolean;
}

export interface InteractiveModeOptions {
  sessionId: string;
  workingDir?: string;
  useWebSocket?: boolean;
}

export interface DiagnoseOptions {
  sessionId?: string;
  testMessage?: string;
}

export interface StreamEvent {
  type:
    | "stream"
    | "thought"
    | "tool_call"
    | "tool_call_update"
    | "error"
    | "finish"
    | "pong"
    | "status"
    | "permission_request"
    | "file_operation"
    | "models";
  id?: string;
  content?: string;
  done?: boolean;
  error?: { code: string; message: string };
  files?: FileChange[];
  metadata?: Record<string, unknown>;
  timestamp?: number;
  status?: string;
  toolCallId?: string;
  title?: string;
  kind?: "read" | "edit" | "execute";
  toolCallStatus?: "pending" | "in_progress" | "completed" | "failed";
  permissionRequest?: {
    sessionId: string;
    options: Array<{
      optionId: string;
      name: string;
    }>;
    toolCall: {
      toolCallId: string;
      title?: string;
      kind?: string;
    };
  };
  fileOperation?: {
    method: string;
    path: string;
    content?: string;
  };
  models?: Array<{
    id: string;
    label: string;
  }>;
  currentModelId?: string;
  canSwitch?: boolean;
}

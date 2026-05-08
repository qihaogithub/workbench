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
  model?: string;
  timeout?: number;
}

export interface WebSocketStreamOptions {
  sessionId: string;
  message: string;
  workingDir?: string;
  backend?: string;
  model?: string;
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

export interface SystemCheckResult {
  timestamp: string;
  runtime: {
    node: { version: string; available: boolean };
    pnpm: { version: string; available: boolean };
    typescript: { version: string; available: boolean };
  };
  agentService: {
    running: boolean;
    port: number;
    pid: string | null;
    processCommand: string | null;
    healthOk: boolean | null;
    uptime: number | null;
    activeAgents: number | null;
    backends: string[] | null;
  };
  cliBackends: Record<string, { available: boolean; path: string | null }>;
  project: {
    rootDir: string;
    packageJsonExists: boolean;
    envFileExists: boolean;
    agentServiceDir: boolean;
    webDir: boolean;
    sharedDir: boolean;
  };
  ports: {
    [port: number]: {
      inUse: boolean;
      process: string | null;
    };
  };
}

export interface LogsOptions {
  level?: string;
  pattern?: string;
  lines?: number;
  sessionId?: string;
}

export interface LogsResult {
  source: string;
  totalLines: number;
  filteredLines: number;
  logs: Array<{
    level: string;
    time: string;
    msg: string;
    [key: string]: unknown;
  }>;
}

export interface StreamEvent {
  type:
    | "stream"
    | "thought"
    | "tool_call"
    | "tool_call_update"
    | "plan"
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

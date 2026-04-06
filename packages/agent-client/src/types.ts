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

export interface FileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  content?: string;
}

export interface FileChangeInfo {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  status: 'staged' | 'unstaged';
}

export interface FilesResponse {
  sessionId: string;
  files: FileChangeInfo[];
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
}

export interface WorkspaceInfo {
  sessionId: string;
  workingDir: string;
  displayName: string;
  customWorkspace: boolean;
  workspaceType: 'user' | 'temp';
  snapshotMode: 'git-repo' | 'snapshot' | null;
  snapshotBranch: string | null;
}

export interface UpdateWorkspaceOptions {
  workingDir: string;
  customWorkspace?: boolean;
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

export interface AgentResult {
  success: boolean;
  content?: string;
  files?: FileChange[];
  error?: AgentError;
  metadata?: ResultMetadata;
}

export interface SendMessageOptions {
  timeout?: number;
  stream?: boolean;
  context?: {
    files?: string[];
    presetRules?: string;
  };
}

export interface AgentInfo {
  sessionId: string;
  status: AgentStatus;
  backend: AgentType;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  workingDir?: string;
}

export interface SessionListResponse {
  sessions: AgentInfo[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

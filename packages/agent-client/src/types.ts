export type AgentType = 'pi-agent';

/** Agent 行为模式：workbench 为创作端全量工具，viewer-readonly 为浏览端只读工具 */
export type AgentMode = 'workbench' | 'viewer-readonly';

/** viewer-readonly 模式下随消息上报的浏览端上下文 */
export interface ViewerContext {
  activePageId?: string;
  activeConfig?: Record<string, unknown>;
}

export type AgentStatus =
  | 'initializing'
  | 'ready'
  | 'processing'
  | 'awaiting_approval'
  | 'cancelling'
  | 'error'
  | 'destroyed';

export type ErrorCode =
  | 'INVALID_PARAMS'
  | 'SESSION_NOT_FOUND'
  | 'AGENT_NOT_INITIALIZED'
  | 'BACKEND_UNAVAILABLE'
  | 'MESSAGE_SEND_ERROR'
  | 'CANCELLED'
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
  runSummary?: RunSummary;
}

export interface RunSummary {
  mutations: Array<{
    mutationId: string;
    revision: number;
    status: 'committed' | 'conflicted' | 'rolled_back';
    resources: Array<{
      path: string;
      action: 'created' | 'modified' | 'deleted' | 'moved';
    }>;
    actor: string;
  }>;
  projections: Array<{
    revision: number;
    surface: string;
    status: 'pending' | 'applied' | 'failed';
  }>;
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
  model?: string;
  workingDir?: string;
  projectId?: string;
  demoId?: string;
  /** 当前消息引用的跨项目（引用项目） */
  referencedProjects?: Array<{ projectId: string; label?: string }>;
  images?: ImageAttachment[];
  files?: FileAttachment[];
  /** 调用方提供的项目规则；服务端会置于不可覆盖的安全骨架之后。 */
  projectRules?: string;
  /** 行为模式；通常由 AgentClient/AgentStream 按配置自动注入，无需手动传 */
  mode?: AgentMode;
  /** viewer-readonly 模式下的浏览端上下文（服务端用于拼接只读问答上下文） */
  viewerContext?: ViewerContext;
  context?: {
    files?: string[];
    presetRules?: string;
  };
  /** 用于服务端 canonical checkpoint 记录的助手消息 ID。 */
  conversation?: { assistantMessageId?: string };
}

/** 图片附件，Base64 编码 */
export interface ImageAttachment {
  /** Base64 数据（不含 data URI 前缀） */
  data: string;
  /** MIME 类型，如 image/png */
  mimeType: string;
  /** 原始文件名 */
  name: string;
}

/** 只读文件附件，内容由服务端按 attachment id 读取 */
export interface FileAttachment {
  /** 会话内附件 ID */
  id: string;
  /** 原始文件名 */
  name: string;
  /** MIME 类型 */
  mimeType: string;
  /** 原始文件大小 */
  size: number;
  /** 是否已提取出可供 AI 读取的文本 */
  textExtracted: boolean;
  /** 提取文本预览 */
  textPreview?: string;
  /** 提取文本行数 */
  lineCount?: number;
  /** 提取文本是否被截断 */
  truncated?: boolean;
}

export interface AgentInfo {
  sessionId: string;
  status: AgentStatus;
  backend: "pi-agent";
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

/** 控制台日志条目（agent-service 侧缓冲） */
export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string;
  timestamp: number;
}

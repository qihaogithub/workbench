export interface DemoMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

export interface DemoFiles {
  code: string;
  schema: string;
}

export interface SessionMeta {
  sessionId: string;
  demoId: string;
  userId?: string;
  createdAt: number;
  expiresAt: number;
  status?: 'editing' | 'saved' | 'discarded';
  basedOnVersion?: string;
  opencodeSessionId?: string | null;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export const ErrorCode = {
  DEMO_NOT_FOUND: "DEMO_NOT_FOUND",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  INVALID_REQUEST: "INVALID_REQUEST",
  FILE_READ_ERROR: "FILE_READ_ERROR",
  FILE_WRITE_ERROR: "FILE_WRITE_ERROR",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AGENT_SERVICE_ERROR: "AGENT_SERVICE_ERROR",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  VERSION_NOT_FOUND: "VERSION_NOT_FOUND",
  SESSION_NOT_EDITING: "SESSION_NOT_EDITING",
  WORKSPACE_CREATE_ERROR: "WORKSPACE_CREATE_ERROR",
  SNAPSHOT_CREATE_ERROR: "SNAPSHOT_CREATE_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UPLOAD_FAILED: "UPLOAD_FAILED",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_MESSAGES: Record<ErrorCodeType, string> = {
  DEMO_NOT_FOUND: "Demo 不存在",
  SESSION_NOT_FOUND: "Session 不存在",
  INVALID_REQUEST: "请求参数无效",
  FILE_READ_ERROR: "文件读取失败",
  FILE_WRITE_ERROR: "文件写入失败",
  SESSION_EXPIRED: "Session 已过期",
  VALIDATION_ERROR: "数据校验失败",
  AGENT_SERVICE_ERROR: "Agent 服务请求失败",
  PROJECT_NOT_FOUND: "项目不存在",
  VERSION_NOT_FOUND: "版本不存在",
  SESSION_NOT_EDITING: "会话不在编辑状态",
  WORKSPACE_CREATE_ERROR: "工作空间创建失败",
  SNAPSHOT_CREATE_ERROR: "快照创建失败",
  UNAUTHORIZED: "未授权访问",
  FORBIDDEN: "无权访问",
  INTERNAL_ERROR: "内部服务器错误",
  INVALID_FILE_TYPE: "不支持的文件类型",
  FILE_TOO_LARGE: "文件大小超过限制",
  UPLOAD_FAILED: "文件上传失败",
};

export * from "./workspace";

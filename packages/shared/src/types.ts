export interface DemoMeta {
  id: string;
  name: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  demoCount?: number;
}

export interface DemoFiles {
  code: string;
  schema: string;
}

export interface SessionMeta {
  sessionId: string;
  demoId: string;
  userId?: string;
  title?: string;
  createdAt: number;
  expiresAt: number;
  status?: 'editing' | 'saved' | 'discarded' | 'archived';
  basedOnVersion?: string;
  opencodeSessionId?: string | null;
  workspaceId?: string;
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

export type ErrorCode =
  | "DEMO_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "INVALID_REQUEST"
  | "FILE_READ_ERROR"
  | "FILE_WRITE_ERROR"
  | "SESSION_EXPIRED"
  | "VALIDATION_ERROR"
  | "AGENT_SERVICE_ERROR"
  | "WORKSPACE_STALE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "PROJECT_NOT_FOUND"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "UPLOAD_FAILED";

export type ErrorCodeType = ErrorCode;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  DEMO_NOT_FOUND: "Demo 不存在",
  SESSION_NOT_FOUND: "Session 不存在",
  INVALID_REQUEST: "请求参数无效",
  FILE_READ_ERROR: "文件读取失败",
  FILE_WRITE_ERROR: "文件写入失败",
  SESSION_EXPIRED: "Session 已过期",
  VALIDATION_ERROR: "数据校验失败",
  AGENT_SERVICE_ERROR: "Agent 服务请求失败",
  WORKSPACE_STALE: "当前工作区已过期，请刷新项目后重试",
  UNAUTHORIZED: "未授权访问",
  FORBIDDEN: "无权访问",
  INTERNAL_ERROR: "内部服务器错误",
  PROJECT_NOT_FOUND: "项目不存在",
  INVALID_FILE_TYPE: "不支持的文件类型",
  FILE_TOO_LARGE: "文件大小超过限制",
  UPLOAD_FAILED: "文件上传失败",
};

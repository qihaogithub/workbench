import type { ProjectAuthoringPreferences } from "./workspace";

export interface DemoMeta {
  id: string;
  name: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  authoringPreferences?: ProjectAuthoringPreferences;
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
  /** 最后一次会话活动时间，按此计算历史保留期。 */
  lastActivityAt?: number;
  expiresAt: number;
  status?: 'editing' | 'saved' | 'discarded' | 'archived';
  basedOnVersion?: string;
  workbenchSessionId?: string | null;
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
  | "UPLOAD_FAILED"
  | "PUBLISH_RUNTIME_UNSUPPORTED"
  | "SANDBOX_ORIGIN_NOT_CONFIGURED"
  | "SANDBOX_MANIFEST_INVALID"
  | "HTML_IMPORT_INVALID"
  | "HTML_IMPORT_TOO_LARGE"
  | "HTML_IMPORT_NOT_RENDERABLE"
  | "HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED"
  | "HTML_IMPORT_EMBED_UNSUPPORTED"
  | "HTML_IMPORT_CAPABILITY_RESTRICTED"
  | "HTML_IMPORT_INTERACTIVE_NOT_YET_SUPPORTED"
  | "HTML_IMPORT_RUNTIME_MISMATCH"
  | "HTML_RUNTIME_FAILED"
  | "CONFIG_READONLY";

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
  PUBLISH_RUNTIME_UNSUPPORTED: "页面运行时不支持发布",
  SANDBOX_ORIGIN_NOT_CONFIGURED: "HTML 隔离运行域未配置",
  SANDBOX_MANIFEST_INVALID: "HTML 隔离运行清单无效",
  HTML_IMPORT_INVALID: "无法读取有效 HTML",
  HTML_IMPORT_TOO_LARGE: "HTML 文件过大，请压缩后重试",
  HTML_IMPORT_NOT_RENDERABLE: "HTML 未包含可渲染内容",
  HTML_IMPORT_EXTERNAL_RESOURCE_UNSUPPORTED: "当前仅支持自包含的单文件资源",
  HTML_IMPORT_EMBED_UNSUPPORTED: "当前不支持页面内嵌第三方内容",
  HTML_IMPORT_CAPABILITY_RESTRICTED: "页面依赖当前不支持的浏览器能力",
  HTML_IMPORT_INTERACTIVE_NOT_YET_SUPPORTED:
    "交互 HTML 将在隔离运行时启用后支持",
  HTML_IMPORT_RUNTIME_MISMATCH: "HTML 产物与页面运行时不匹配",
  HTML_RUNTIME_FAILED: "HTML 交互预览运行失败",
  CONFIG_READONLY: "当前配置不可编辑",
};

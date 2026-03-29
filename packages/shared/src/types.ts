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
  createdAt: number;
  expiresAt: number;
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
  | 'DEMO_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'FILE_READ_ERROR'
  | 'FILE_WRITE_ERROR'
  | 'SESSION_EXPIRED'
  | 'VALIDATION_ERROR';

export type ErrorCodeType = ErrorCode;

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  DEMO_NOT_FOUND: 'Demo 不存在',
  SESSION_NOT_FOUND: 'Session 不存在',
  INVALID_REQUEST: '请求参数无效',
  FILE_READ_ERROR: '文件读取失败',
  FILE_WRITE_ERROR: '文件写入失败',
  SESSION_EXPIRED: 'Session 已过期',
  VALIDATION_ERROR: '数据校验失败',
};

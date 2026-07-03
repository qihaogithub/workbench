import type { DemoPageRuntimeType } from "./workspace";

export type { DemoPageRuntimeType } from "./workspace";

export interface PrototypePageMeta {
  width?: number;
  height?: number;
  generatedBy?: string;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface DemoMeta {
  id: string;
  name: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  demoCount?: number;
  demoPages?: Array<{ id: string; name: string; routeKey?: string; runtimeType?: DemoPageRuntimeType; order: number; parentId: string | null }>;
  locked?: boolean;
}

export interface ProjectTemplateMeta {
  id: string;
  sourceProjectId: string;
  category: string;
  name: string;
  description: string;
  thumbnail?: string;
  scope?: "personal" | "team" | "official";
  official?: boolean;
  demoCount: number;
  demoPages?: Array<{ id: string; name: string; routeKey?: string; runtimeType?: DemoPageRuntimeType; order: number; parentId: string | null }>;
  createdAt: number;
  updatedAt: number;
}

export interface DemoFiles {
  code: string;
  schema: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: PrototypePageMeta;
}

/**
 * 多页面文件集合（取代旧的单页 DemoFiles 顶层结构）
 *
 * - demos: demoId -> 单页 { code, schema } 对
 * - projectConfigSchema: workspace/project.config.schema.json 内容（不存在时为 undefined）
 *   是否存在项目级配置由该字段是否为 undefined 判定，不引入额外标记字段。
 */
export interface MultiDemoFiles {
  demos: Record<string, DemoFiles>;
  projectConfigSchema?: string;
}

/**
 * 运行时合并后传入 iframe 组件的 Props
 *
 * 由项目配置 Schema + 页面配置 Schema 的 default 值合并而成。
 * - 字段必须互斥不重名（写入时已强校验，运行时再兜底检测）
 * - 配置面板展示合并后的所有字段供用户填写
 */
export type MergedComponentProps = Record<string, unknown>;

export interface SessionMeta {
  sessionId: string;
  demoId: string;
  userId?: string;
  createdAt: number;
  expiresAt: number;
  status?: "editing" | "saved" | "discarded" | "archived";
  basedOnVersion?: string;
  opencodeSessionId?: string | null;
  workspaceId?: string;
}

export type CollabResourceKind =
  | "page-code"
  | "page-schema"
  | "project-schema"
  | "workspace-tree"
  | "canvas-layout"
  | "knowledge-document";

export type CollabSyncStatus =
  | "connecting"
  | "synced"
  | "saving"
  | "offline"
  | "error";

export interface CollabSelectionRange {
  anchor: number;
  head: number;
}

export interface CollabPresence {
  userId: string;
  username: string;
  color: string;
  activePageId?: string;
  resourcePath: string;
  cursor?: number;
  selection?: CollabSelectionRange;
  lastActiveAt: number;
}

export interface CollabRoomDescriptor {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  resourcePath: string;
  kind: CollabResourceKind;
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
  WORKSPACE_STALE: "WORKSPACE_STALE",
  SNAPSHOT_CREATE_ERROR: "SNAPSHOT_CREATE_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  COVER_UPLOAD_FAILED: "COVER_UPLOAD_FAILED",
  DEMO_PAGE_NOT_FOUND: "DEMO_PAGE_NOT_FOUND",
  SCHEMA_CONFLICT: "SCHEMA_CONFLICT",
  FOLDER_NOT_FOUND: "FOLDER_NOT_FOUND",
  FOLDER_DEPTH_EXCEEDED: "FOLDER_DEPTH_EXCEEDED",
  CIRCULAR_REFERENCE: "CIRCULAR_REFERENCE",
  NO_CONTENT_TO_PUBLISH: "NO_CONTENT_TO_PUBLISH",
  PUBLISH_FAILED: "PUBLISH_FAILED",
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
  WORKSPACE_STALE: "当前工作区已过期，请刷新项目后重试",
  SNAPSHOT_CREATE_ERROR: "快照创建失败",
  UNAUTHORIZED: "未授权访问",
  FORBIDDEN: "无权访问",
  INTERNAL_ERROR: "内部服务器错误",
  INVALID_FILE_TYPE: "不支持的文件类型",
  FILE_TOO_LARGE: "文件大小超过限制",
  UPLOAD_FAILED: "文件上传失败",
  COVER_UPLOAD_FAILED: "封面图上传失败",
  DEMO_PAGE_NOT_FOUND: "Demo 页面不存在",
  SCHEMA_CONFLICT: "Schema 字段命名冲突",
  FOLDER_NOT_FOUND: "文件夹不存在",
  FOLDER_DEPTH_EXCEEDED: "文件夹嵌套不能超过 3 层",
  CIRCULAR_REFERENCE: "不能将文件夹移动到自身或其子文件夹中",
  NO_CONTENT_TO_PUBLISH: "项目没有可发布的Demo页面",
  PUBLISH_FAILED: "发布失败",
};

export * from "./workspace";
export * from "./validator";
export * from "./agent-config";
export * from "./knowledge";
export * from "./external-auth";
export * from "./diagnostics";

/** 图片附件，Base64 编码 */
export interface ImageAttachment {
  /** Base64 数据（不含 data URI 前缀） */
  data: string;
  /** MIME 类型，如 image/png */
  mimeType: string;
  /** 原始文件名 */
  name: string;
}

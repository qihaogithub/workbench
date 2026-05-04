export interface WorkspaceInfo {
  path: string;
  customWorkspace: boolean;
  type: 'user' | 'temp';
  createdAt: number;
}

export interface CreateWorkspaceOptions {
  backend: string;
  workspace?: string;
  customWorkspace?: boolean;
}

export interface FileChangeInfo {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  status: 'staged' | 'unstaged';
}

export interface SnapshotInfo {
  mode: 'git-repo' | 'snapshot';
  branch: string | null;
}

export interface CompareResult {
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
}

export interface WorkspaceMeta {
  workingDir: string;
  customWorkspace: boolean;
  workspaceType: 'user' | 'temp';
  snapshotMode: 'git-repo' | 'snapshot' | null;
  snapshotBranch: string | null;
}

// ============================================
// 项目工作空间与版本管理相关类型
// ============================================

/**
 * 版本信息（每次保存自动生成）
 */
export interface VersionInfo {
  versionId: string;           // 例如 "v1", "v2", "v3"
  savedAt: number;             // 保存时间戳
  savedBy: string;             // 保存者用户名
  sessionId: string;           // 关联的编辑会话 ID
  snapshotPath: string;        // 备份文件夹路径（绝对路径）
  fileCount: number;           // 文件数量
  note?: string;               // 用户备注（可选）
}

/**
 * Demo 页面元数据
 *
 * 持久化在 workspace/demos/{id}/.demo.json 中。
 * 保存项目时由后端扫描 demos/ 目录 + 读取各 .demo.json 合并到 Project.demoPages。
 */
export interface DemoPageMeta {
  id: string;                  // 唯一标识，格式 "demo_{timestamp}_{random6}"，同时作为目录名
  name: string;                // 显示名称，如 "首页"、"详情页"
  order: number;               // 在页面列表中的展示顺序（小者在前）
  createdAt: number;           // 创建时间戳
  updatedAt: number;           // 最后更新时间戳
}

/**
 * 项目定义
 */
export interface Project {
  id: string;                  // 项目唯一标识
  name: string;                // 项目名称
  description?: string;        // 项目描述
  workspacePath: string;       // 正式工作空间绝对路径
  demoPages: DemoPageMeta[];   // Demo 页面列表（按 order 升序）
  versions: VersionInfo[];     // 版本历史（最多 50 个）
  createdAt: number;           // 创建时间戳
  updatedAt: number;           // 最后更新时间戳
  lockedDependencies?: Record<string, string>; // 依赖版本锁定：包名 -> CDN URL
  thumbnail?: string;          // 缩略图路径
}

/**
 * Demo 页面完整数据（含代码和页面级配置内容）
 */
export interface DemoPageDetail {
  meta: DemoPageMeta;
  code: string;                // index.tsx 内容
  schema: string;              // config.schema.json 内容
}

/**
 * 创建 Demo 页面请求
 */
export interface CreateDemoPageRequest {
  name: string;
}

/**
 * 更新 Demo 代码/配置请求（按职责拆分）
 */
export interface UpdateDemoPageFilesRequest {
  code?: string;               // index.tsx 内容
  schema?: string;             // config.schema.json 内容
}

/**
 * 更新 Demo 页面元数据请求
 */
export interface PatchDemoPageMetaRequest {
  name?: string;
  order?: number;
}

/**
 * 项目级共享配置
 *
 * 是否存在项目级配置由 fs.existsSync(workspace/project.config.schema.json) 实时判定，
 * 不在 Project 上持久化任何标记字段。
 */
export interface ProjectConfig {
  schema: string;              // project.config.schema.json 内容
  exists: boolean;             // 是否存在项目级配置
}

/**
 * 创建/更新项目级共享配置请求
 */
export interface UpdateProjectConfigRequest {
  schema: string;
}

/**
 * 编辑会话
 */
export interface EditSession {
  sessionId: string;           // 会话唯一标识
  projectId: string;           // 关联的项目 ID
  username: string;            // 当前编辑者用户名
  tempWorkspace: string;       // 临时工作空间绝对路径
  basedOnVersion: string;      // 基于的版本号
  status: 'editing' | 'saved' | 'discarded';
  createdAt: number;           // 创建时间戳
}

/**
 * 项目创建请求参数
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspacePath?: string;      // 可选：指定初始工作空间路径
}

/**
 * 打开项目编辑请求参数
 */
export interface OpenProjectEditRequest {
  username: string;            // 用户名
}

/**
 * 打开项目编辑响应
 */
export interface OpenProjectEditResponse {
  sessionId: string;           // 编辑会话 ID
  tempWorkspace: string;       // 临时工作空间路径
  basedOnVersion: string;      // 基于的版本号
  warning?: string;            // 警告信息（如多人编辑）
}

/**
 * 保存项目变更请求参数
 */
export interface SaveProjectChangesRequest {
  note?: string;               // 备注信息
}

/**
 * 保存项目变更响应
 */
export interface SaveProjectChangesResponse {
  success: boolean;
  version: string;             // 新版本号
  savedAt: number;             // 保存时间
}

/**
 * 恢复版本请求参数
 */
export interface RestoreVersionRequest {
  versionId: string;           // 要恢复的版本号
  username: string;            // 操作用户名
}

/**
 * 恢复版本响应
 */
export interface RestoreVersionResponse {
  success: boolean;
  newVersionId: string;        // 新创建的版本号
  restoredAt: number;          // 恢复时间
}

/**
 * 版本历史响应
 */
export interface VersionHistoryResponse {
  projectId: string;
  currentVersion: string;      // 当前最新版本
  versions: VersionInfo[];     // 版本列表（倒序）
  totalVersions: number;       // 总版本数
}

/**
 * 项目列表响应
 */
export interface ProjectListResponse {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    currentVersion: string;    // 当前版本
    lastSavedAt: number;       // 最后保存时间
    lastSavedBy: string;       // 最后保存者
    fileCount: number;         // 文件数量
    demoCount?: number;        // 页面数量
    createdAt: number;
    updatedAt: number;
  }>;
  total: number;
}

/**
 * 项目详情响应
 */
export interface ProjectDetailResponse {
  project: Project;
  currentVersion: string;
  fileCount: number;
}

// 最大版本保留数量
export const MAX_VERSIONS_KEEP = 50;

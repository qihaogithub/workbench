export interface WorkspaceInfo {
  path: string;
  customWorkspace: boolean;
  type: "user" | "temp";
  createdAt: number;
}

export interface CreateWorkspaceOptions {
  workspace?: string;
  customWorkspace?: boolean;
}

export interface FileChangeInfo {
  path: string;
  operation: "create" | "modify" | "delete";
  status: "staged" | "unstaged";
}

export interface SnapshotInfo {
  mode: "git-repo" | "snapshot";
  branch: string | null;
}

export interface CompareResult {
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
}

export interface WorkspaceMeta {
  workingDir: string;
  customWorkspace: boolean;
  workspaceType: "user" | "temp";
  snapshotMode: "git-repo" | "snapshot" | null;
  snapshotBranch: string | null;
}

// ============================================
// 项目工作空间与版本管理相关类型
// ============================================

export type VersionHistoryEntryType =
  | "auto_checkpoint"
  | "named_version"
  | "publish_snapshot"
  | "restore_snapshot";

/**
 * 历史记录条目。
 *
 * 旧数据可能没有 type，读取时应按普通命名版本兼容。
 */
export interface VersionInfo {
  versionId: string; // 例如 "v1", "v2", "v3"
  type?: VersionHistoryEntryType; // 历史记录类型
  savedAt: number; // 保存时间戳
  savedBy: string; // 保存者用户名
  sessionId: string; // 关联的编辑会话 ID
  snapshotPath: string; // 备份文件夹路径（绝对路径）
  fileCount: number; // 文件数量
  workspaceId?: string; // 生成该历史记录时消费的 Workspace ID
  workspaceRevision?: WorkspaceRevision; // 生成该历史记录时消费的 Workspace Authority revision
  workspaceRootHash?: string; // 生成该历史记录时消费的 Workspace Authority root hash
  note?: string; // 用户备注（可选）
}

/**
 * 页面级版本信息。
 *
 * 页面级快照只包含单个 Demo 页面的 index.tsx 与 config.schema.json。
 */
export interface PageVersionInfo extends VersionInfo {
  demoId: string;
  demoName?: string;
  resourceVersion?: ResourceVersion;
  commitId?: string;
}

export type ProjectResourceKind =
  | "page"
  | "knowledge_document"
  | "canvas"
  | "asset"
  | "project_config";

export interface ResourcePointer {
  kind: ProjectResourceKind;
  resourceId: string;
  versionId?: string;
  deleted?: boolean;
}

export interface ResourceVersion {
  id: string;
  projectId: string;
  kind: ProjectResourceKind;
  resourceId: string;
  workspaceId?: string;
  workspaceRevision?: WorkspaceRevision;
  workspaceRootHash?: string;
  previousVersionId?: string;
  restoredFromVersionId?: string;
  contentHash: string;
  blobRefs: string[];
  metadata: Record<string, unknown>;
  runtime: {
    schemaVersion: number;
    runtimeType?: string;
    previewContractVersion?: string;
    materializerVersion: string;
    migrationStatus?: "native";
  };
  createdAt: number;
  createdBy: string;
  source: "user" | "ai" | "import" | "restore" | "publish" | "system";
  note?: string;
}

export interface ProjectCommit {
  id: string;
  projectId: string;
  parentCommitId?: string;
  visibility: "draft_checkpoint" | "semantic" | "protected";
  intent:
    | "edit"
    | "checkpoint"
    | "restore"
    | "publish"
    | "import"
    | "ai"
    | "system";
  title: string;
  resourcePointers: ResourcePointer[];
  changedResources: Array<{
    kind: ProjectResourceKind;
    resourceId: string;
    fromVersionId?: string;
    toVersionId?: string;
    deleted?: boolean;
  }>;
  createdAt: number;
  createdBy: string;
  audit: {
    actorType: "user" | "ai" | "system" | "cli";
    sessionId?: string;
    workspaceId?: string;
    workspaceRevision?: WorkspaceRevision;
    workspaceRootHash?: string;
    bypassedValidation?: boolean;
  };
}

export interface ProjectContentState {
  projectId: string;
  headCommitId: string;
  materializationStatus?: "ready" | "pending" | "failed";
  materializedCommitId?: string;
  updatedAt: number;
}

export interface ResourceReference {
  from: { kind: ProjectResourceKind; resourceId: string };
  to: { kind: ProjectResourceKind; resourceId: string };
  reason: "canvas_node" | "asset_usage" | "config_route" | "knowledge_context";
}

/**
 * Demo 页面元数据
 *
 * 持久化在 workspace/workspace-tree.json 的 pages 数组中。
 * 保存项目时由后端读取 workspace-tree.json 合并到 Project.demoPages。
 */
export type DemoPageRuntimeType =
  | "prototype-html-css"
  | "high-fidelity-react"
  | "sketch-scene";

export interface DemoPageMeta {
  id: string; // 唯一标识，格式 "demo_{timestamp}_{random6}"，同时作为目录名
  name: string; // 显示名称，如 "首页"、"详情页"
  routeKey?: string; // 页面稳定语义标识，供应用逻辑图、AI 和工程交接使用
  order: number; // 在页面列表中的展示顺序（小者在前）
  parentId: string | null; // 所属文件夹 ID，null 表示根级
}

export interface AppGraphPageNode {
  pageId: string;
  title: string;
}

export interface AppGraphAction {
  from: string;
  event: string;
  to?: string;
  params?: string[];
  setState?: Record<string, string>;
  condition?: string;
  fallback?: string;
}

export interface AppGraph {
  version: 1;
  entry: string;
  pages: Record<string, AppGraphPageNode>;
  actions: AppGraphAction[];
  state: Record<string, unknown>;
}

export type AppGraphValidationSeverity = "error" | "warning";

export interface AppGraphValidationIssue {
  code:
    | "ENTRY_MISSING"
    | "PAGE_TARGET_MISSING"
    | "PAGE_ROUTE_KEY_INVALID"
    | "ACTION_FROM_MISSING"
    | "ACTION_TO_MISSING"
    | "ACTION_FALLBACK_MISSING"
    | "ACTION_DUPLICATE";
  message: string;
  severity: AppGraphValidationSeverity;
  routeKey?: string;
  event?: string;
}

export interface AppGraphValidationResult {
  valid: boolean;
  issues: AppGraphValidationIssue[];
}

/**
 * 虚拟文件夹元数据
 *
 * 文件夹仅存在于元数据层，物理 demos/ 目录保持扁平结构。
 * 持久化在 workspace/workspace-tree.json 的 folders 数组中，保存时合并到 Project.demoFolders。
 */
export interface DemoFolderMeta {
  id: string; // 唯一标识，格式 "folder_{timestamp}_{random6}"
  name: string; // 文件夹显示名称
  parentId: string | null; // 父文件夹 ID，null 表示根级
  order: number; // 同级内的排序（小者在前）
}

/**
 * Workspace 统一清单结构，包含文件夹和页面的完整树结构。
 * 持久化在 workspace/workspace-tree.json 中。
 */
export interface WorkspaceTree {
  folders: DemoFolderMeta[];
  pages: DemoPageMeta[];
}

/**
 * 统一树节点类型（页面或文件夹）
 */
export type DemoPageItem = DemoFolderMeta | DemoPageMeta;

/**
 * 类型守卫：判断树节点是否为文件夹
 */
export function isDemoFolder(item: DemoPageItem): item is DemoFolderMeta {
  return item.id.startsWith("folder_");
}

/**
 * 项目定义
 */
export type ProjectType = "standard" | "template";

export interface ProjectTemplateSettings {
  description: string;
  scope: "personal" | "team" | "official";
  official: boolean;
}

export interface Project {
  id: string; // 项目唯一标识
  name: string; // 项目名称
  projectType: ProjectType; // 模板是项目类型，不是独立快照实体
  templateSettings?: ProjectTemplateSettings; // 仅模板项目使用的展示与范围信息
  sourceTemplateProjectId?: string; // 从哪个模板项目创建
  category?: string; // 首页项目分类
  description?: string; // 项目描述
  workspacePath: string; // 项目基准工作区绝对路径（canonical Workspace）
  activeWorkspaceId?: string; // 项目级共享当前工作空间 ID
  activeWorkspaceUpdatedAt?: number; // 项目级共享当前工作空间更新时间
  canonicalSyncedWorkspaceId?: string; // 最近同步到项目基准工作区的 Workspace ID
  canonicalSyncedRevision?: CanonicalSyncedRevision; // 仅在 canonical materialize 成功后推进，不代表 Authority 当前 revision
  canonicalSyncedRootHash?: string; // 最近同步到项目基准工作区的 Authority root hash
  canonicalSyncedAt?: number; // 最近同步到项目基准工作区的时间
  demoPages: DemoPageMeta[]; // Demo 页面列表（按 order 升序）
  demoFolders: DemoFolderMeta[]; // 虚拟文件夹列表
  versions: VersionInfo[]; // 版本历史（最多 50 个）
  createdAt: number; // 创建时间戳
  updatedAt: number; // 最后更新时间戳
  lockedDependencies?: Record<string, string>; // 依赖版本锁定：包名 -> CDN URL
  authoringPreferences?: ProjectAuthoringPreferences; // 创作端项目级编辑偏好
  thumbnail?: string; // 缩略图路径
  publishedVersion?: string; // 已发布的版本ID，如 "v3"；undefined 表示从未发布
  publishedAt?: number; // 最后发布时间戳
}

/**
 * 手绘页面编辑引擎偏好
 *
 * 该字段只影响创作端编辑态；底层 runtimeType 仍保持 sketch-scene。
 */
export type SketchEditorEnginePreference = "native";

export interface ProjectAuthoringPreferences {
  sketchEditorEngine?: SketchEditorEnginePreference;
}

export interface UserAuthoringPreferences {
  sketchEditorEngine?: SketchEditorEnginePreference;
}

/**
 * Demo 页面完整数据（含代码和页面级配置内容）
 */
export interface DemoPageDetail {
  meta: DemoPageMeta;
  code: string; // index.tsx 内容
  schema: string; // config.schema.json 内容
}

/**
 * 创建 Demo 页面请求
 */
export interface CreateDemoPageRequest {
  name: string;
  parentId?: string | null; // 创建时指定所属文件夹
}

/**
 * 更新 Demo 代码/配置请求（按职责拆分）
 */
export interface UpdateDemoPageFilesRequest {
  code?: string; // index.tsx 内容
  schema?: string; // config.schema.json 内容
}

/**
 * 更新 Demo 页面元数据请求
 */
export interface PatchDemoPageMetaRequest {
  name?: string;
  order?: number;
  parentId?: string | null; // 移动到其他文件夹
}

/**
 * 创建文件夹请求
 */
export interface CreateDemoFolderRequest {
  name: string;
  parentId?: string | null; // 父文件夹 ID，null 为根级
}

/**
 * 更新文件夹元数据请求
 */
export interface PatchDemoFolderRequest {
  name?: string;
  parentId?: string | null;
  order?: number;
}

/**
 * 批量排序请求
 */
export interface ReorderDemoPagesRequest {
  pages: Array<{
    id: string;
    order: number;
    parentId: string | null;
  }>;
  folders?: Array<{
    id: string;
    order: number;
    parentId: string | null;
  }>;
}

/**
 * 项目级共享配置
 *
 * 是否存在项目级配置由 fs.existsSync(workspace/project.config.schema.json) 实时判定，
 * 不在 Project 上持久化任何标记字段。
 */
export interface ProjectConfig {
  schema: string; // project.config.schema.json 内容
  exists: boolean; // 是否存在项目级配置
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
  sessionId: string; // 会话唯一标识
  projectId: string; // 关联的项目 ID
  username: string; // 当前编辑者用户名
  workspacePath?: string; // 工作区绝对路径
  tempWorkspace: string; // @deprecated 兼容旧调用方，等同于 workspacePath
  basedOnVersion: string; // 基于的版本号
  status: "editing" | "saved" | "discarded";
  createdAt: number; // 创建时间戳
}

/**
 * 项目创建请求参数
 */
export interface CreateProjectRequest {
  name: string;
  category?: string;
  description?: string;
  workspacePath?: string; // 可选：指定初始工作空间路径
}

/**
 * 打开项目编辑请求参数
 */
export interface OpenProjectEditRequest {
  username: string; // 用户名
}

/**
 * 打开项目编辑响应
 */
export interface OpenProjectEditResponse {
  sessionId: string; // 编辑会话 ID
  workspaceId?: string; // 工作空间 ID，新链路优先使用
  workspaceScope?: "live" | "branch" | "snapshot-source" | "legacy";
  workspacePath?: string; // 工作空间绝对路径
  isSharedWorkspace?: boolean; // 是否为项目级共享工作空间
  tempWorkspace: string; // @deprecated 兼容旧调用方，等同于 workspacePath
  basedOnVersion: string; // 基于的版本号
  warning?: string; // 警告信息（如多人编辑）
}

/**
 * 保存项目变更请求参数
 */
export interface SaveProjectChangesRequest {
  note?: string; // 备注信息
}

/**
 * 保存项目变更响应
 */
export interface SaveProjectChangesResponse {
  success: boolean;
  version: string; // 新版本号
  savedAt: number; // 保存时间
}

/**
 * 版本历史响应
 */
export interface VersionHistoryResponse {
  projectId: string;
  currentVersion: string; // 当前最新版本
  versions: VersionInfo[]; // 版本列表（倒序）
  totalVersions: number; // 总版本数
}

export interface PageVersionHistoryResponse {
  projectId: string;
  demoId: string;
  currentVersion: string;
  versions: PageVersionInfo[];
  totalVersions: number;
}

export interface CreatePageVersionRequest {
  sessionId?: string;
  note?: string;
}

export interface RestorePageVersionRequest {
  versionId: string;
  sessionId?: string;
}

export interface RestorePageVersionResponse {
  success: boolean;
  newVersionId: string;
  restoredAt: number;
  files: {
    code: string;
    schema: string;
  };
}

/**
 * 项目列表响应
 */
export interface ProjectListResponse {
  projects: Array<{
    id: string;
    name: string;
    category?: string;
    description?: string;
    authoringPreferences?: ProjectAuthoringPreferences;
    thumbnail?: string;
    currentVersion: string;
    lastSavedAt: number;
    lastSavedBy: string;
    fileCount: number;
    demoCount?: number;
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
/**
 * Three version axes that must never be compared or advanced as if they were
 * interchangeable. The optional semantic tag keeps number/string literals
 * source-compatible while preventing an already-typed axis from being passed
 * as another axis accidentally.
 */
export type ProjectBaseVersion = string & {
  readonly __versionAxis?: "project-base-version";
};
export type WorkspaceRevision = number & {
  readonly __versionAxis?: "workspace-revision";
};
export type CanonicalSyncedRevision = number & {
  readonly __versionAxis?: "canonical-synced-revision";
};

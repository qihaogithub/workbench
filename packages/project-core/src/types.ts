import type {
  DemoFiles,
  DemoPageRuntimeType,
  DemoFolderMeta,
  DemoMeta,
  PrototypePageMeta,
  DemoPageMeta,
  AppGraph,
  PageVersionInfo,
  ProjectCommit,
  ProjectContentState,
  ProjectResourceKind,
  ResourceVersion,
  Project,
  ProjectAuthoringPreferences,
  ProjectTemplateMeta,
  ProjectBaseVersion,
  VersionInfo,
  WorkspaceRevision,
  WorkspaceMutationActor,
  WorkspaceMutationRequest,
  WorkspaceMutationReceipt,
  WorkspaceMutationOperation,
} from "@workbench/shared/contracts";

export type { ProjectResourceKind } from "@workbench/shared/contracts";

export type ProjectAdminRole = "admin" | "creator" | "readonly";

export interface ProjectAdminActor {
  id: string;
  name: string;
  role: ProjectAdminRole;
  source?: string;
  allowedProjectIds?: string[];
}

export interface ProjectAdminError {
  code: string;
  message: string;
  recoverable?: boolean;
  details?: unknown;
}

export interface ValidationIssue {
  code: string;
  message: string;
  resourceId?: string;
  pageId?: string;
  stage?:
    | "source_contract"
    | "dependency_import"
    | "component_export"
    | "render_contract"
    | "schema_contract"
    | "compile_transform"
    | "module_parse"
    | "prototype_contract";
  instruction?: string;
  severity: "blocking" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface RuntimeValidationIssue {
  pageId: string;
  severity: "error" | "warning";
  stage:
    | "source_contract"
    | "dependency_import"
    | "component_export"
    | "render_contract"
    | "schema_contract"
    | "compile_transform"
    | "module_parse"
    | "prototype_contract";
  code: string;
  message: string;
  instruction: string;
  moduleName?: string;
  importName?: string;
}

export type PrototypeGateDecision =
  | "accept_prototype"
  | "repair_prototype"
  | "upgrade_to_high_fidelity";

export interface PrototypeGateResult {
  decision: PrototypeGateDecision;
  reasonCodes: string[];
  summary: string;
}

export interface RuntimeValidationResult {
  ok: boolean;
  issues: RuntimeValidationIssue[];
  pageIds: string[];
  prototypeGate?: PrototypeGateResult;
}

export interface DiffSummary {
  created?: string[];
  updated?: string[];
  deleted?: string[];
  unchanged?: string[];
  notes?: string[];
}

export interface ProjectAdminResult<T> {
  ok: boolean;
  data?: T;
  error?: ProjectAdminError;
  warnings?: string[];
  diffSummary?: DiffSummary;
  validation?: ValidationResult;
  runtimeValidation?: RuntimeValidationResult;
  nextActions?: string[];
  auditId?: string;
}

export interface WorkspaceMutationPort {
  commitMutation(
    request: WorkspaceMutationRequest,
  ): Promise<WorkspaceMutationReceipt>;
  getState(workspaceId: string): Promise<WorkspaceAuthorityPortState>;
}

export interface WorkspaceAuthorityPortState {
  workspaceId: string;
  projectId: string;
  revision: number;
  rootHash: string;
  resourceHashes: Record<string, string>;
  updatedAt: number;
}

export type {
  WorkspaceMutationRequest,
  WorkspaceMutationReceipt,
  WorkspaceMutationOperation,
};

export interface ProjectAdminConfig {
  dataDir?: string;
  auditDir?: string;
  requireConfirm?: boolean;
  maxBatchSize?: number;
  workspaceAuthorityPort?: WorkspaceMutationPort;
}

export type { ProjectAuthoringPreferences };

export interface ProjectSummary extends DemoMeta {
  description?: string;
  publishedVersion?: string;
  publishedAt?: number;
}

export interface ProjectDetail {
  project: Project;
  pages: DemoPageMeta[];
  folders: DemoFolderMeta[];
  versions: VersionInfo[];
  projectConfigSchema?: string;
  projectConfigValues?: Record<string, unknown>;
  locked?: boolean;
}

export interface PageDetail {
  meta: DemoPageMeta;
  files: DemoFiles;
}

export interface PageVersionHistory {
  projectId: string;
  pageId: string;
  currentVersion: string;
  versions: PageVersionInfo[];
  totalVersions: number;
}

export interface PageVersionDetail {
  projectId: string;
  pageId: string;
  version: PageVersionInfo;
  files: DemoFiles;
}

export interface PageVersionCreateInput {
  projectId: string;
  pageId: string;
  editId?: string;
  sourceWorkspacePath?: string;
  workspaceId?: string;
  workspaceRevision?: WorkspaceRevision;
  workspaceRootHash?: string;
  note?: string;
  sketchPatchSummary?: SketchPatchVersionSummary;
}

export interface SketchPatchVersionSummary {
  operationCount: number;
  hasBaseSceneKey: boolean;
  currentNodeCount?: number;
  targetNodeCount?: number;
}

export interface ResourceVersionHistory {
  projectId: string;
  kind: ProjectResourceKind;
  resourceId: string;
  currentVersion?: string;
  versions: ResourceVersion[];
  totalVersions: number;
}

export interface ResourceVersionDetail {
  projectId: string;
  kind: ProjectResourceKind;
  resourceId: string;
  version: ResourceVersion;
  content?: unknown;
}

export interface ResourceVersionCreateInput {
  projectId: string;
  kind: ProjectResourceKind;
  resourceId: string;
  editId?: string;
  sourceWorkspacePath?: string;
  workspaceId?: string;
  workspaceRevision?: WorkspaceRevision;
  workspaceRootHash?: string;
  note?: string;
  sketchPatchSummary?: SketchPatchVersionSummary;
  visibility?: ProjectCommit["visibility"];
  source?: ResourceVersion["source"];
}

export interface ResourceRestoreInput {
  projectId: string;
  kind: ProjectResourceKind;
  resourceId: string;
  versionId: string;
  workspaceId?: string;
  workspaceRevision?: WorkspaceRevision;
  workspaceRootHash?: string;
  sessionId?: string;
}

export interface ProjectCommitHistory {
  projectId: string;
  headCommitId?: string;
  commits: ProjectCommit[];
  totalCommits: number;
}

export interface ProjectPublishCommitInput {
  projectId: string;
  publishedVersion: string;
  title?: string;
}

export interface MaterializationResult {
  projectId: string;
  commitId?: string;
  status: ProjectContentState["materializationStatus"];
  checked: boolean;
  writtenFiles: string[];
  missingBlobs: string[];
}

export interface BlobGarbageCollectResult {
  projectId: string;
  dryRun: boolean;
  removableBlobs: string[];
  removedBlobs: string[];
}

export interface ExportedAsset {
  path: string;
  dataBase64: string;
  size: number;
}

export interface ExportedKnowledgeFile {
  path: string;
  dataBase64: string;
  size: number;
}

export interface ProjectPackageExport {
  project: Project;
  pages: PageDetail[];
  folders: DemoFolderMeta[];
  versions: VersionInfo[];
  projectConfigSchema?: string;
  projectConfigValues?: Record<string, unknown>;
  appGraph?: AppGraph;
  assets: ExportedAsset[];
  knowledgeFiles: ExportedKnowledgeFile[];
  baseVersion: ProjectBaseVersion;
  workspaceId?: string;
  workspaceRevision?: WorkspaceRevision;
  workspaceRootHash?: string;
}

export interface PageRestoreResult {
  success: true;
  newVersionId: string;
  commitId?: string;
  restoredAt: number;
  files: DemoFiles;
}

export interface PreviewPlan {
  planId: string;
  operation: string;
  resourceId: string;
  impact: string[];
  reversible: boolean;
  confirmToken: string;
}

export interface EditTransaction {
  editId: string;
  projectId: string;
  workspaceId: string;
  workspacePath: string;
  workspaceScope?: "live" | "branch" | "snapshot-source" | "legacy";
  baseVersion: ProjectBaseVersion;
  actor: ProjectAdminActor;
  createdAt: number;
  expiresAt: number;
  status: "editing" | "committed" | "discarded" | "expired";
}

export interface EditStatus {
  transaction: EditTransaction;
  changedFiles: string[];
}

export interface PublishStatus {
  projectId: string;
  published: boolean;
  publishedVersion?: string;
  commitId?: string;
  publishedAt?: number;
  artifactPath?: string;
  artifactSummary?: {
    demoCount: number;
    projectJsonPath?: string;
    indexJsonPath?: string;
    entryPaths: string[];
  };
  accessUrls?: {
    viewerUrl?: string;
    dataUrl?: string;
    embedUrls?: Array<{ pageId: string; url: string }>;
  };
}

export type AssetSourceType =
  | "browser_blob"
  | "upload"
  | "session_asset"
  | "workspace_asset"
  | "r2_worker"
  | "remote_url";

export type AssetCreatedBy = "user" | "ai" | "figma" | "system";

export interface AssetSummary {
  path: string;
  size: number;
  references: string[];
  assetId?: string;
  contentHash?: string;
  mimeType?: string;
  originalUrl?: string;
  sourceType?: AssetSourceType;
  createdBy?: AssetCreatedBy;
  createdAt?: number;
}

export interface AssetUploadInput {
  editId: string;
  filename: string;
  dataBase64: string;
  mimeType?: string;
  targetPath?: string;
  originalUrl?: string;
  sourceType?: AssetSourceType;
  createdBy?: AssetCreatedBy;
  dryRun?: boolean;
}

export interface AssetReplaceInput extends AssetUploadInput {
  oldPath: string;
}

export interface VerifySummary {
  pages: number;
  runtimeTypes: Record<string, number>;
  projectConfig: {
    exists: boolean;
  };
  assets: {
    total: number;
    totalBytes: number;
    referenced: number;
    unreferenced: number;
  };
  prototypePlaceholders: Array<{
    pageId: string;
    markers: string[];
  }>;
  metadataIssues: ValidationIssue[];
  missingAssetReferences: Array<{
    pageId: string;
    reference: string;
  }>;
  runtimeIssues: RuntimeValidationIssue[];
}

export interface VisualCheckInput {
  projectId: string;
  pages?: string[];
  viewport?: string;
  checks?: string[];
  outputDir: string;
}

export interface VisualCheckPageResult {
  pageId: string;
  runtimeType: DemoPageRuntimeType;
  screenshotPath: string;
  nonblank: boolean;
  failedRequests: string[];
  consoleErrors: string[];
  issues: ValidationIssue[];
}

export interface VisualCheckResult {
  projectId: string;
  viewport: string;
  checks: string[];
  outputDir: string;
  reportPath: string;
  pages: VisualCheckPageResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    screenshots: number;
    failedRequests: number;
    consoleErrors: number;
  };
}

export interface AgentRunReportInput {
  projectId?: string;
  editId?: string;
  versionId?: string;
  auditId?: string;
  visualReportPath?: string;
}

export interface AgentRunReport {
  projectId?: string;
  projectName?: string;
  editId?: string;
  versionId?: string;
  auditId?: string;
  diffSummary?: DiffSummary;
  validationSummary?: {
    ok: boolean;
    issues: number;
    blocking: number;
    warnings: number;
  };
  visualCheckSummary?: {
    reportPath: string;
  };
  artifacts: Array<{
    kind: string;
    path?: string;
    id?: string;
  }>;
  rollback: {
    restoreCommand?: string;
    projectGetCommand?: string;
  };
}

export interface CapabilitySummary {
  actor: ProjectAdminActor;
  mode: "cli" | "local" | "readonly";
  writable: boolean;
  maxBatchSize: number;
  tools: string[];
}

export interface AiSessionSummary {
  sessionId: string;
  projectId: string;
  userId?: string;
  workspaceId?: string;
  status?: string;
  createdAt?: number;
  expiresAt?: number;
  path: string;
}

export interface AiSendMessageInput {
  sessionId: string;
  content: string;
  projectId?: string;
  workingDir?: string;
  model?: string;
  stream?: boolean;
  timeout?: number;
}

export interface AiSendMessageResult {
  sessionId: string;
  content: string;
  files?: unknown;
  metadata?: unknown;
}

export type TemplateScope = "personal" | "team" | "official";

export interface TemplateListFilter {
  scope?: TemplateScope;
  official?: boolean;
}

export interface TemplateHealthItem {
  templateId: string;
  name?: string;
  scope?: TemplateScope;
  official?: boolean;
  ok: boolean;
  issues: ValidationIssue[];
}

export interface TemplateHealthReport {
  checkedAt: number;
  total: number;
  ok: boolean;
  items: TemplateHealthItem[];
}

export type AuditLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export interface AuditEvent {
  auditId: string;
  at: number;
  actor: ProjectAdminActor;
  level: AuditLevel;
  tool: string;
  projectId?: string;
  resourceId?: string;
  inputSummary?: Record<string, unknown>;
  ok: boolean;
  diffSummary?: DiffSummary;
  validation?: ValidationResult;
  error?: ProjectAdminError;
}

export interface CreateProjectInput {
  name: string;
  category?: string;
  templateId?: string;
  description?: string;
  authoringPreferences?: ProjectAuthoringPreferences;
  dryRun?: boolean;
}

export interface UpdateProjectInput {
  projectId: string;
  name?: string;
  category?: string;
  description?: string;
  authoringPreferences?: ProjectAuthoringPreferences;
  dryRun?: boolean;
}

export interface PageCreateInput {
  editId: string;
  name: string;
  pageId?: string;
  routeKey?: string;
  runtimeType?: DemoPageRuntimeType;
  parentId?: string | null;
  order?: number;
  code?: string;
  schema?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: PrototypePageMeta;
  sketchScene?: string;
  sketchMeta?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface PageUpdateInput {
  editId: string;
  pageId: string;
  code?: string;
  schema?: string;
  name?: string;
  routeKey?: string;
  parentId?: string | null;
  order?: number;
  dryRun?: boolean;
}

export interface PageUpdatePrototypeInput {
  editId: string;
  pageId: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: PrototypePageMeta;
  sketchScene?: string;
  sketchMeta?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface PageSwitchRuntimeInput {
  editId: string;
  pageId: string;
  targetRuntimeType: DemoPageRuntimeType;
  code?: string;
  schema?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: PrototypePageMeta;
  sketchScene?: string;
  sketchMeta?: Record<string, unknown>;
  reason?: string;
  dryRun?: boolean;
}

export interface FolderUpdateInput {
  editId: string;
  folderId: string;
  name?: string;
  parentId?: string | null;
  order?: number;
  dryRun?: boolean;
}

export interface ConfigUpdateInput {
  editId: string;
  schema?: string;
  dryRun?: boolean;
}

export type TemplateMetaInput = Pick<
  ProjectTemplateMeta,
  "category" | "name" | "description"
> & {
  thumbnail?: string;
  scope?: TemplateScope;
  official?: boolean;
};

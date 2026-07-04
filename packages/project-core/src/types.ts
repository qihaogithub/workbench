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
  ProjectTemplateMeta,
  VersionInfo,
} from "@opencode-workbench/shared/contracts";

export type { ProjectResourceKind } from "@opencode-workbench/shared/contracts";

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

export interface ProjectAdminConfig {
  dataDir?: string;
  auditDir?: string;
  requireConfirm?: boolean;
  maxBatchSize?: number;
}

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
  note?: string;
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
  note?: string;
  visibility?: ProjectCommit["visibility"];
  source?: ResourceVersion["source"];
}

export interface ResourceRestoreInput {
  projectId: string;
  kind: ProjectResourceKind;
  resourceId: string;
  versionId: string;
  workspaceId?: string;
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
  appGraph?: AppGraph;
  assets: ExportedAsset[];
  knowledgeFiles: ExportedKnowledgeFile[];
  baseVersion: string;
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
  workspaceScope?: "branch";
  baseVersion: string;
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

export interface AssetSummary {
  path: string;
  size: number;
  references: string[];
}

export interface AssetUploadInput {
  editId: string;
  filename: string;
  dataBase64: string;
  mimeType?: string;
  targetPath?: string;
  dryRun?: boolean;
}

export interface AssetReplaceInput extends AssetUploadInput {
  oldPath: string;
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
  dryRun?: boolean;
}

export interface UpdateProjectInput {
  projectId: string;
  name?: string;
  category?: string;
  description?: string;
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

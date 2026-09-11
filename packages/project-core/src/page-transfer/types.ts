import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";

import type { WorkspaceResourceRegistry } from "../workspace-resource-registry.js";

export type PageTransferMode = "copy" | "reference";
export type PageTransferJobStatus =
  | "prepared"
  | "executing"
  | "partial"
  | "completed"
  | "failed"
  | "revoked";
export type PageTransferItemStatus =
  | "pending"
  | "committed"
  | "conflict"
  | "failed"
  | "skipped";
export type ReferenceGrantStatus =
  | "pending"
  | "active"
  | "revoked"
  | "source_deleted";

export interface PageTransferResource {
  path: string;
  content: string | Buffer;
  contentHash: string;
  kind: string;
  size: number;
}

export interface PageTransferPageMeta {
  id: string;
  name: string;
  routeKey?: string;
  parentId?: string | null;
  order?: number;
  runtimeType:
    | "prototype-html-css"
    | "sandboxed-html"
    | "high-fidelity-react"
    | "sketch-scene";
  [key: string]: unknown;
}

export interface PagePackage {
  pageId: string;
  meta: PageTransferPageMeta;
  resources: readonly PageTransferResource[];
  packageHash: string;
  referenceMeta?: Readonly<Record<string, unknown>>;
}

export interface PagePackageBuildInput {
  pageId: string;
  meta: PageTransferPageMeta;
  resources: Readonly<Record<string, string | Buffer>>;
  registry: WorkspaceResourceRegistry;
  referenceMeta?: Readonly<Record<string, unknown>>;
}

export interface PageTransferStoreOptions {
  dataDir: string;
  dbPath?: string;
  now?: () => number;
  idFactory?: () => string;
}

export interface PageTransferJob {
  id: string;
  sourceProjectId: string;
  sourceWorkspaceId: string;
  targetProjectId: string;
  targetWorkspaceId: string;
  mode: PageTransferMode;
  status: PageTransferJobStatus;
  createdAt: number;
  updatedAt: number;
  idempotencyKey: string;
  sourceRevision: number;
  sourceRootHash: string;
  targetBaseRevision: number;
  targetBaseRootHash?: string;
  targetFolderId: string | null;
  placement?: { anchorX: number; anchorY: number };
  pagePlacements?: Readonly<Record<string, { x: number; y: number }>>;
  createdBy: string;
  topologyStatus: "pending" | "committed" | "failed";
  lastError?: string;
}

export interface PageTransferItem {
  jobId: string;
  sourcePageId: string;
  targetPageId: string;
  status: PageTransferItemStatus;
  packageHash: string;
  mutationId: string;
  referenceGrantId?: string;
  conflict?: PageTransferConflict;
  warning?: string;
  receipt?: WorkspaceMutationReceipt;
}

export interface ReferenceGrant {
  id: string;
  sourceProjectId: string;
  sourcePageId: string;
  targetProjectId: string;
  targetPageId: string;
  status: ReferenceGrantStatus;
  sourceHeadHash?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReferenceHead {
  grantId: string;
  sourcePageVersionId: string;
  sourceContentHash: string;
  status: "pending" | "ready" | "failed" | "invalid";
  materializationId?: string;
  lastKnownGoodMaterializationId?: string;
  errorCode?: string;
  updatedAt: number;
}

export interface PageTransferOutboxRecord {
  id: string;
  jobId: string;
  kind: "topology" | "grant";
  payload: Readonly<Record<string, unknown>>;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PageTransferConflict {
  code: string;
  message: string;
  sourcePageId?: string;
  key?: string;
  sourceValue?: unknown;
  targetValue?: unknown;
  allowedActions?: readonly (
    | "reuse_target"
    | "replace_target"
    | "map_to_target"
    | "omit_relation"
  )[];
  resourcePath?: string;
  expectedHash?: string;
  actualHash?: string;
}

export interface PageTransferWarning {
  code: string;
  message: string;
  pageId?: string;
}

export interface SourceSnapshotAuthPort {
  authorize(input: {
    sourceProjectId: string;
    sourceWorkspaceId: string;
    pageIds: readonly string[];
    actorId: string;
  }): Promise<void>;
  getPage(input: {
    sourceProjectId: string;
    sourceWorkspaceId: string;
    pageId: string;
  }): Promise<PagePackageBuildInput>;
}

export interface TargetMutationPort {
  preflightPage?(input: {
    targetProjectId: string;
    targetWorkspaceId: string;
    targetPageId: string;
    page: PagePackage;
    mode: PageTransferMode;
    targetFolderId: string | null;
  }): Promise<readonly PageTransferConflict[]>;
  commitPage(input: {
    mutationId: string;
    targetProjectId: string;
    targetWorkspaceId: string;
    targetPageId: string;
    page: PagePackage;
    mode: PageTransferMode;
    referenceGrantId?: string;
    targetFolderId: string | null;
    placement?: { anchorX: number; anchorY: number };
    pagePlacement?: { x: number; y: number };
    resolutions?: readonly PageTransferResolution[];
  }): Promise<WorkspaceMutationReceipt>;
  commitTopology?(input: {
    mutationId: string;
    targetProjectId: string;
    targetWorkspaceId: string;
    jobId: string;
    sourceProjectId: string;
    sourceWorkspaceId: string;
    items: readonly PageTransferItem[];
  }): Promise<WorkspaceMutationReceipt>;
}

export interface PreparePageTransferInput {
  transferId?: string;
  idempotencyKey: string;
  sourceProjectId: string;
  sourceWorkspaceId: string;
  sourcePageIds: readonly string[];
  targetProjectId: string;
  targetWorkspaceId: string;
  mode: PageTransferMode;
  actorId: string;
  sourceRevision: number;
  sourceRootHash: string;
  targetBaseRevision: number;
  targetBaseRootHash?: string;
  targetFolderId?: string | null;
  placement?: { anchorX: number; anchorY: number };
  pagePlacements?: Readonly<Record<string, { x: number; y: number }>>;
}

export interface ExecutePageTransferInput {
  transferId: string;
  actorId: string;
  resolutions?: readonly PageTransferResolution[];
}

export interface PageTransferResolution {
  sourcePageId: string;
  code: string;
  key?: string;
  action: "reuse_target" | "replace_target" | "map_to_target" | "omit_relation";
  targetKey?: string;
}

export interface PageTransferResult {
  job: PageTransferJob;
  items: readonly PageTransferItem[];
  conflicts: readonly PageTransferConflict[];
  warnings: readonly PageTransferWarning[];
}

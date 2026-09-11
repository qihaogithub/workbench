import type { WorkspaceMutationReceipt } from "./contracts";
import type {
  DemoPageMeta,
  DemoPageRuntimeType,
  WorkspaceRevision,
} from "./workspace";

export type PageTransferMode = "copy" | "reference";

export type PageTransferJobStatus =
  | "preparing"
  | "needs_resolution"
  | "running"
  | "partial"
  | "completed"
  | "failed";

export type PageTransferItemStatus =
  | "ready"
  | "needs_resolution"
  | "running"
  | "completed"
  | "failed";

export type PageTransferConflictKind =
  | "project_config_definition"
  | "project_config_value"
  | "route_key"
  | "external_page_relation"
  | "dynamic_config_dependency"
  | "unsupported_runtime_dependency"
  | "source_version_changed"
  | "target_changed";

export type PageTransferResolutionAction =
  | "reuse_target"
  | "replace_target"
  | "map_to_target"
  | "omit_relation";

export interface PageTransferResolution {
  conflictId: string;
  action: PageTransferResolutionAction;
  targetKey?: string;
}

export interface PageTransferConflict {
  id: string;
  sourcePageId: string;
  kind: PageTransferConflictKind;
  key?: string;
  message: string;
  sourceValue?: unknown;
  targetValue?: unknown;
  allowedActions: PageTransferResolutionAction[];
}

export interface PageTransferPlacement {
  anchorX: number;
  anchorY: number;
}

export interface PageTransferRequest {
  sourceProjectId: string;
  sourcePageIds: string[];
  mode: PageTransferMode;
  targetFolderId?: string | null;
  placement?: PageTransferPlacement;
  pagePlacements?: Record<string, { x: number; y: number }>;
  resolutions?: PageTransferResolution[];
  idempotencyKey: string;
}

export interface PagePackageResource {
  path: string;
  hash: string;
  size: number;
  encoding: "utf8" | "base64";
}

export interface PagePackageManifest {
  version: 1;
  sourceProjectId: string;
  sourcePageId: string;
  sourceWorkspaceId: string;
  sourceRevision: WorkspaceRevision;
  sourceRootHash: string;
  sourcePageVersionId: string;
  runtimeType: DemoPageRuntimeType;
  page: DemoPageMeta;
  contentHash: string;
  resources: PagePackageResource[];
  projectConfigKeys: string[];
  whiteboardIds: string[];
  designSpecIds: string[];
  assetHashes: string[];
  relatedPageIds: string[];
  warnings: string[];
}

export interface PageTransferItem {
  sourcePageId: string;
  sourcePageVersionId: string;
  targetPageId: string;
  status: PageTransferItemStatus;
  conflicts: PageTransferConflict[];
  warnings: string[];
  referenceGrantId?: string;
  receipt?: WorkspaceMutationReceipt;
  errorCode?: string;
}

export interface PageTransferJob {
  id: string;
  targetProjectId: string;
  targetWorkspaceId: string;
  sourceProjectId: string;
  mode: PageTransferMode;
  idempotencyKey: string;
  status: PageTransferJobStatus;
  sourceRevision: WorkspaceRevision;
  sourceRootHash: string;
  targetBaseRevision: WorkspaceRevision;
  targetBaseRootHash?: string;
  targetFolderId: string | null;
  placement?: PageTransferPlacement;
  pagePlacements?: Record<string, { x: number; y: number }>;
  items: PageTransferItem[];
  topologyStatus: "pending" | "completed" | "failed" | "not_applicable";
  warnings: string[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type PageReferenceGrantStatus =
  | "pending"
  | "active"
  | "revoked"
  | "source_deleted";

export interface PageReferenceGrant {
  id: string;
  sourceProjectId: string;
  sourcePageId: string;
  targetProjectId: string;
  targetPageId: string;
  status: PageReferenceGrantStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  revokedBy?: string;
  revokedAt?: number;
}

export interface PageReferenceHead {
  grantId: string;
  sourcePageVersionId: string;
  sourceContentHash: string;
  status: "pending" | "ready" | "failed" | "invalid";
  materializationId?: string;
  lastKnownGoodMaterializationId?: string;
  errorCode?: string;
  updatedAt: number;
}

export interface ResolvedReferencePage {
  grant: PageReferenceGrant;
  head: PageReferenceHead;
  manifest: PagePackageManifest;
  resources: Record<string, string>;
  executionTicket?: string;
}

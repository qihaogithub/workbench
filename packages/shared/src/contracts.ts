export * from "./index";

import type { WorkspaceRevision } from "./workspace";
import type { DemoPageRuntimeType, PagePresentationProfile } from "./index";

/**
 * Durable, single-writer contract for an active (live) Workspace.
 * A receipt is the only proof that a mutation has reached disk; preview state
 * is deliberately modelled separately so callers cannot mistake a tool return
 * value for either a commit or a rendered preview.
 */
export type WorkspaceMutationActor =
  | "collab"
  | "ai"
  | "subagent"
  | "author-site"
  | "project-cli"
  | "import"
  | "system";

export type WorkspaceMutationErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_AUTHORITY_NOT_READY"
  | "WORKSPACE_RESOURCE_CONFLICT"
  | "WORKSPACE_MUTATION_ID_REUSED"
  | "WORKSPACE_INVALID_OPERATION"
  | "WORKSPACE_EXTERNAL_DRIFT"
  | "WORKSPACE_AUTHORITY_BACKUP_MISSING"
  | "WORKSPACE_WRITE_LEASE_UNAVAILABLE";

export type WorkspaceAuthorityApiErrorCode =
  | WorkspaceMutationErrorCode
  | "INVALID_REQUEST"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "PROJECT_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "WORKSPACE_PROJECT_MISMATCH"
  | "WORKSPACE_RESOURCE_NOT_FOUND"
  | "WORKSPACE_MUTATION_FAILED";

export const WORKSPACE_AUTHORITY_API_ERROR_CODES = [
  "INVALID_REQUEST",
  "SESSION_NOT_FOUND",
  "SESSION_EXPIRED",
  "PROJECT_MISMATCH",
  "WORKSPACE_MISMATCH",
  "WORKSPACE_PROJECT_MISMATCH",
  "WORKSPACE_NOT_FOUND",
  "WORKSPACE_RESOURCE_NOT_FOUND",
  "WORKSPACE_AUTHORITY_NOT_READY",
  "WORKSPACE_RESOURCE_CONFLICT",
  "WORKSPACE_MUTATION_ID_REUSED",
  "WORKSPACE_INVALID_OPERATION",
  "WORKSPACE_EXTERNAL_DRIFT",
  "WORKSPACE_AUTHORITY_BACKUP_MISSING",
  "WORKSPACE_WRITE_LEASE_UNAVAILABLE",
  "WORKSPACE_MUTATION_FAILED",
] as const satisfies readonly WorkspaceAuthorityApiErrorCode[];

export function isWorkspaceAuthorityApiErrorCode(value: unknown): value is WorkspaceAuthorityApiErrorCode {
  return typeof value === "string" && (WORKSPACE_AUTHORITY_API_ERROR_CODES as readonly string[]).includes(value);
}

export interface WorkspaceMutationPutTextOperation {
  type: "put_text";
  path: string;
  content: string;
  expectedHash?: string;
  expectedAbsent?: boolean;
}

/** Binary payloads are uploaded to Authority staging first. Their bytes never
 * travel in a mutation JSON body or enter the editable Workspace before commit. */
export interface WorkspaceMutationPutBinaryOperation {
  type: "put_binary";
  path: string;
  stagingId: string;
  hash: string;
  size: number;
  expectedHash?: string;
  expectedAbsent?: boolean;
}

/** Text payloads may also be staged when their JSON representation would exceed
 * the Authority mutation endpoint limit. The Authority validates UTF-8 and the
 * normal managed-text path policy before the atomic commit. */
export interface WorkspaceMutationPutStagedTextOperation {
  type: "put_staged_text";
  path: string;
  stagingId: string;
  hash: string;
  size: number;
  expectedHash?: string;
  expectedAbsent?: boolean;
}

/** Atomically merges a partial JSON object into page/project runtime config.
 * Authority expands this command inside the workspace serial section. */
export interface WorkspaceMutationPatchConfigValuesOperation {
  type: "patch_config_values";
  path: string;
  patch: Record<string, unknown>;
}

export interface WorkspaceMutationDeletePathOperation {
  type: "delete_path";
  path: string;
  expectedHash: string;
}

export interface WorkspaceMutationMovePathOperation {
  type: "move_path";
  from: string;
  to: string;
  expectedHash: string;
  expectedTargetAbsent?: boolean;
}

/** A declarative import command. Authority expands it only after entering its
 * workspace serial section, so page id/route/order are allocated from the
 * current tree rather than a caller's stale snapshot. */
export interface WorkspaceMutationCommitHtmlImportOperation {
  type: "commit_html_import";
  /** Compatibility placeholders; Authority consumes this command before the
   * generic resource-operation pipeline observes these fields. */
  path: "";
  from: "";
  to: "";
  stagingId: string;
  hash: string;
  size: number;
  name: string;
  parentId: string | null;
  runtimeType: Extract<DemoPageRuntimeType, "prototype-html-css" | "sandboxed-html">;
  analysisVersion: number;
  sourceHash: string;
  normalizedHash: string;
  presentation: PagePresentationProfile;
}

export type WorkspaceMutationOperation =
  | WorkspaceMutationPutTextOperation
  | WorkspaceMutationPutBinaryOperation
  | WorkspaceMutationPutStagedTextOperation
  | WorkspaceMutationPatchConfigValuesOperation
  | WorkspaceMutationDeletePathOperation
  | WorkspaceMutationMovePathOperation
  | WorkspaceMutationCommitHtmlImportOperation;

export interface WorkspaceMutationRequest {
  mutationId: string;
  projectId: string;
  workspaceId: string;
  sessionId?: string;
  baseRevision: WorkspaceRevision;
  actor: WorkspaceMutationActor;
  reason: string;
  operations: WorkspaceMutationOperation[];
}

export interface WorkspaceMutationReceipt {
  committed: true;
  mutationId: string;
  projectId: string;
  workspaceId: string;
  baseRevision: WorkspaceRevision;
  revision: WorkspaceRevision;
  rootHash: string;
  actor: WorkspaceMutationActor;
  resources: Array<{
    path: string;
    action: "created" | "modified" | "deleted" | "moved";
    beforeHash: string | null;
    afterHash: string | null;
  }>;
  committedAt: number;
}

export interface WorkspaceMutationCommittedEvent {
  type: "workspace_mutation_committed";
  receipt: WorkspaceMutationReceipt;
}

export interface WorkspaceProjectionAck {
  projectId: string;
  workspaceId: string;
  revision: WorkspaceRevision;
  mutationId?: string;
  clientId: string;
  surface: "active-preview" | "canvas-preview" | "screenshot";
  status: "applied" | "failed";
  runtimeError?: { code: string; message: string };
  acknowledgedAt: number;
}

export interface WorkspaceProjectionAcknowledgedEvent {
  type: "workspace_projection_acknowledged";
  ack: WorkspaceProjectionAck;
}

export interface WorkspaceAuthorityReadyEvent {
  type: "workspace_authority_ready";
  projectId: string;
  workspaceId: string;
  revision: WorkspaceRevision;
  rootHash: string;
}

export interface WorkspaceRevisionGapEvent {
  type: "workspace_revision_gap";
  projectId: string;
  workspaceId: string;
  expectedRevision: WorkspaceRevision;
  currentRevision: WorkspaceRevision;
}

export type WorkspaceAuthorityStreamEvent =
  | WorkspaceAuthorityReadyEvent
  | WorkspaceMutationCommittedEvent
  | WorkspaceProjectionAcknowledgedEvent
  | WorkspaceRevisionGapEvent;

export * from "./index";

import type { WorkspaceRevision } from "./workspace";

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

export type WorkspaceMutationOperation =
  | WorkspaceMutationPutTextOperation
  | WorkspaceMutationPutBinaryOperation
  | WorkspaceMutationDeletePathOperation
  | WorkspaceMutationMovePathOperation;

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

export function normalizeWorkspaceResourcePath(resourcePath: string): string | null {
  const normalized = resourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.split("/").includes("..")) return null;
  return normalized;
}

export function isManagedWorkspaceResource(resourcePath: string): boolean {
  const normalized = normalizeWorkspaceResourcePath(resourcePath);
  return Boolean(normalized && (
    /^demos\/[^/]+\/(index\.tsx|prototype\.(html|css|meta\.json)|config\.schema\.json|sketch\.(scene|meta)\.json)$/.test(normalized)
    || normalized === "project.config.schema.json"
    || normalized === "project.config.values.json"
    || normalized === "workspace-tree.json"
    || normalized === ".canvas-layout.json"
    || normalized === "knowledge/manifest.json"
    || /^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(normalized)
    || /^assets\/.+/.test(normalized)
  ));
}

export function assertManagedWorkspaceTextWrite(resourcePath: string, content: string): void {
  if (!isManagedWorkspaceResource(resourcePath) || /^assets\//.test(resourcePath) || content.length > 2 * 1024 * 1024) {
    throw new Error("WORKSPACE_INVALID_OPERATION");
  }
}

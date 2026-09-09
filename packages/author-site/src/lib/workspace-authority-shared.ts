import type {
  WorkspaceAuthorityApiErrorCode,
  WorkspaceAuthorityHealthCondition,
  WorkspaceAuthorityRecommendedAction,
  WorkspaceRevision,
} from "@workbench/shared/contracts";

/** Stable user-facing guidance for a temporarily unavailable Authority. */
export const WORKSPACE_AUTHORITY_NOT_READY_MESSAGE =
  "Workspace Authority 不可用，请确认 agent-service 已启动";

/**
 * Shared types and error class used by both the server-side
 * workspace-authority-client and the browser-side workspace-authority-browser-client.
 *
 * This module must NOT import any Node.js built-in modules (e.g. node:crypto)
 * so that it is safe to pull into Webpack client bundles.
 */

export interface AuthorityEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: unknown };
}

export interface WorkspaceBinaryStagingReceipt {
  stagingId: string;
  hash: string;
  size: number;
}

export interface WorkspaceAuthoritySnapshot {
  state: {
    workspaceId: string;
    projectId: string;
    revision: WorkspaceRevision;
    rootHash: string;
    resourceHashes: Record<string, string>;
    updatedAt: number;
  };
  resources: Record<string, string>;
}

export class WorkspaceAuthorityClientError extends Error {
  constructor(
    readonly code: WorkspaceAuthorityApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "WorkspaceAuthorityClientError";
  }
}

export interface WorkspaceAuthorityResource {
  path: string;
  content: string;
  hash: string;
  revision: WorkspaceRevision;
}

export interface WorkspaceAuthorityHealthView {
  workspaceId: string;
  projectId?: string;
  ready: boolean;
  condition: WorkspaceAuthorityHealthCondition;
  recommendedAction: WorkspaceAuthorityRecommendedAction;
  revision?: WorkspaceRevision;
  rootHash?: string;
  actualRootHash?: string;
  externalDrift: boolean;
  queueDepth: number;
  activeLease: boolean;
  preparedCount: number;
  recoveryState: "ready" | "pending";
  backupCount: number;
  missingBackupCount: number;
  missingBackupHashCount: number;
}

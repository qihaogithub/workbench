import crypto from "node:crypto";

import type {
  WorkspaceAuthorityApiErrorCode,
  WorkspaceMutationCommittedEvent,
  WorkspaceMutationReceipt,
  WorkspaceMutationRequest,
  WorkspaceProjectionAck,
  WorkspaceRevision,
} from "@workbench/shared/contracts";
import { isWorkspaceAuthorityApiErrorCode } from "@workbench/shared/contracts";

import { getServerAgentServiceUrl } from "./runtime-config";

interface AuthorityEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
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
  revision?: WorkspaceRevision;
  rootHash?: string;
  actualRootHash?: string;
  externalDrift: boolean;
  queueDepth: number;
  activeLease: boolean;
  preparedCount: number;
  recoveryState: "ready" | "pending";
}

function authorityUrl(projectId: string, workspaceId: string, suffix: string): string {
  return `${getServerAgentServiceUrl()}/api/workspace-authority/projects/${encodeURIComponent(projectId)}`
    + `/workspaces/${encodeURIComponent(workspaceId)}${suffix}`;
}

async function requestAuthorityJson<T>(
  url: string,
  init: RequestInit,
  fallbackCode: WorkspaceAuthorityApiErrorCode,
): Promise<T> {
  const response = await fetch(url, init).catch((error: unknown) => {
    throw new WorkspaceAuthorityClientError(
      "WORKSPACE_AUTHORITY_NOT_READY",
      error instanceof Error ? error.message : "Workspace Authority 不可用",
      503,
    );
  });
  const body = await response.json().catch(() => ({})) as AuthorityEnvelope<T>;
  if (!response.ok || body.success === false || body.data === undefined) {
    throw new WorkspaceAuthorityClientError(
      isWorkspaceAuthorityApiErrorCode(body.error?.code) ? body.error.code : fallbackCode,
      body.error?.message ?? `Workspace Authority 响应 ${response.status}`,
      response.status || 502,
    );
  }
  return body.data;
}

export async function getWorkspaceAuthorityState(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}): Promise<WorkspaceAuthoritySnapshot["state"]> {
  return requestAuthorityJson(
    authorityUrl(input.projectId, input.workspaceId, `/state?sessionId=${encodeURIComponent(input.sessionId)}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export async function readWorkspaceAuthorityResource(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
}): Promise<WorkspaceAuthorityResource> {
  const resourcePath = input.path.split("/").map(encodeURIComponent).join("/");
  return requestAuthorityJson(
    authorityUrl(input.projectId, input.workspaceId, `/resources/${resourcePath}?sessionId=${encodeURIComponent(input.sessionId)}`),
    { method: "GET" },
    "WORKSPACE_RESOURCE_NOT_FOUND",
  );
}

export async function getWorkspaceAuthorityEvents(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  afterRevision: WorkspaceRevision;
}): Promise<WorkspaceMutationCommittedEvent[]> {
  return requestAuthorityJson(
    authorityUrl(input.projectId, input.workspaceId, `/events?sessionId=${encodeURIComponent(input.sessionId)}&afterRevision=${input.afterRevision}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export async function getWorkspaceProjectionAcks(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  afterRevision?: WorkspaceRevision;
}): Promise<WorkspaceProjectionAck[]> {
  return requestAuthorityJson(
    authorityUrl(input.projectId, input.workspaceId, `/projection-acks?sessionId=${encodeURIComponent(input.sessionId)}&afterRevision=${input.afterRevision ?? 0}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export async function acknowledgeWorkspaceProjection(
  ack: WorkspaceProjectionAck & { sessionId: string },
): Promise<{ acknowledged: true }> {
  return requestAuthorityJson(
    authorityUrl(ack.projectId, ack.workspaceId, "/projection-ack"),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ack) },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export async function getWorkspaceAuthorityHealth(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}): Promise<WorkspaceAuthorityHealthView> {
  return requestAuthorityJson(
    authorityUrl(input.projectId, input.workspaceId, `/health?sessionId=${encodeURIComponent(input.sessionId)}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export async function reconcileWorkspaceAuthority(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  mode: "adopt" | "restore";
}): Promise<WorkspaceAuthoritySnapshot["state"]> {
  return requestAuthorityJson(
    authorityUrl(input.projectId, input.workspaceId, `/reconcile/${input.mode}?sessionId=${encodeURIComponent(input.sessionId)}`),
    { method: "POST" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

async function executeMutation(
  request: WorkspaceMutationRequest,
): Promise<WorkspaceMutationReceipt> {
  const response = await fetch(
    `${getServerAgentServiceUrl()}/api/workspace-authority/projects/${encodeURIComponent(request.projectId)}/workspaces/${encodeURIComponent(request.workspaceId)}/mutate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  ).catch((error: unknown) => {
    throw new WorkspaceAuthorityClientError(
      "WORKSPACE_AUTHORITY_NOT_READY",
      error instanceof Error ? error.message : "Workspace Authority 不可用",
      503,
    );
  });

  const body = await response.json().catch(() => ({})) as AuthorityEnvelope<WorkspaceMutationReceipt>;
  if (!response.ok || body.success === false || !body.data) {
    throw new WorkspaceAuthorityClientError(
      isWorkspaceAuthorityApiErrorCode(body.error?.code) ? body.error.code : "WORKSPACE_MUTATION_FAILED",
      body.error?.message ?? `Workspace Authority 响应 ${response.status}`,
      response.status || 502,
    );
  }
  return body.data;
}

/**
 * Server-side client for the only live Workspace writer. Author-site routes
 * must use this instead of changing the Workspace directory directly.
 *
 * When the Authority rejects with WORKSPACE_EXTERNAL_DRIFT (disk files
 * diverged from the committed state), this function automatically calls
 * reconcile/adopt once and retries the mutation. The retry is safe because
 * reconcile/adopt only updates the Authority hash ledger to match disk —
 * the actual file contents (and expectedHash values in the request) remain
 * unchanged.
 */
export async function commitWorkspaceMutation(
  request: WorkspaceMutationRequest,
): Promise<WorkspaceMutationReceipt> {
  try {
    return await executeMutation(request);
  } catch (error) {
    if (
      !(error instanceof WorkspaceAuthorityClientError) ||
      error.code !== "WORKSPACE_EXTERNAL_DRIFT" ||
      !request.sessionId
    ) {
      throw error;
    }

    await reconcileWorkspaceAuthority({
      projectId: request.projectId,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
      mode: "adopt",
    });

    return await executeMutation(request);
  }
}

export async function getWorkspaceAuthoritySnapshot(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}): Promise<WorkspaceAuthoritySnapshot> {
  const response = await fetch(
    `${getServerAgentServiceUrl()}/api/workspace-authority/projects/${encodeURIComponent(input.projectId)}/workspaces/${encodeURIComponent(input.workspaceId)}/snapshot?sessionId=${encodeURIComponent(input.sessionId)}`,
    { method: "GET" },
  ).catch((error: unknown) => {
    throw new WorkspaceAuthorityClientError(
      "WORKSPACE_AUTHORITY_NOT_READY",
      error instanceof Error ? error.message : "Workspace Authority 不可用",
      503,
    );
  });

  const body = await response.json().catch(() => ({})) as AuthorityEnvelope<WorkspaceAuthoritySnapshot>;
  if (!response.ok || body.success === false || !body.data) {
    throw new WorkspaceAuthorityClientError(
      isWorkspaceAuthorityApiErrorCode(body.error?.code) ? body.error.code : "WORKSPACE_MUTATION_FAILED",
      body.error?.message ?? `Workspace Authority 响应 ${response.status}`,
      response.status || 502,
    );
  }
  return body.data;
}

/** Upload bytes to the Authority-owned staging area. The follow-up mutation
 * only references this receipt; it never embeds binary data in JSON. */
export async function stageWorkspaceBinary(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  content: Buffer;
}): Promise<WorkspaceBinaryStagingReceipt> {
  const response = await fetch(
    `${getServerAgentServiceUrl()}/api/workspace-authority/projects/${encodeURIComponent(input.projectId)}/workspaces/${encodeURIComponent(input.workspaceId)}/staging?sessionId=${encodeURIComponent(input.sessionId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(input.content),
    },
  ).catch((error: unknown) => {
    throw new WorkspaceAuthorityClientError(
      "WORKSPACE_AUTHORITY_NOT_READY",
      error instanceof Error ? error.message : "Workspace Authority 不可用",
      503,
    );
  });
  const body = await response.json().catch(() => ({})) as AuthorityEnvelope<WorkspaceBinaryStagingReceipt>;
  if (!response.ok || body.success === false || !body.data) {
    throw new WorkspaceAuthorityClientError(
      isWorkspaceAuthorityApiErrorCode(body.error?.code) ? body.error.code : "WORKSPACE_MUTATION_FAILED",
      body.error?.message ?? `Workspace Authority 响应 ${response.status}`,
      response.status || 502,
    );
  }
  return body.data;
}

export function createTextWorkspaceMutation(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
  content: string;
  previousContent: string | null;
  reason: string;
}): WorkspaceMutationRequest {
  return {
    mutationId: crypto.randomUUID(),
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    baseRevision: 0,
    actor: "author-site",
    reason: input.reason,
    operations: [{
      type: "put_text",
      path: input.path,
      content: input.content,
      ...(input.previousContent === null
        ? { expectedAbsent: true }
        : { expectedHash: crypto.createHash("sha256").update(input.previousContent).digest("hex") }),
    }],
  };
}

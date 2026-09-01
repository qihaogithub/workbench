import type {
  WorkspaceAuthorityApiErrorCode,
  WorkspaceMutationCommittedEvent,
  WorkspaceProjectionAck,
  WorkspaceRevision,
} from "@workbench/shared/contracts";
import { isWorkspaceAuthorityApiErrorCode } from "@workbench/shared/contracts";

import type {
  WorkspaceAuthorityHealthView,
  WorkspaceAuthorityResource,
  WorkspaceAuthoritySnapshot,
} from "./workspace-authority-shared";
import {
  WORKSPACE_AUTHORITY_NOT_READY_MESSAGE,
  WorkspaceAuthorityClientError,
} from "./workspace-authority-shared";

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

interface WorkspaceAuthorityIdentifiers {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}

function getIdentifiersNotReadyError(
  input: WorkspaceAuthorityIdentifiers,
): WorkspaceAuthorityClientError | null {
  if (input.projectId && input.workspaceId && input.sessionId) return null;
  return new WorkspaceAuthorityClientError(
    "WORKSPACE_AUTHORITY_NOT_READY",
    "Workspace Authority 标识尚未就绪",
    503,
  );
}

function sameOriginPath(
  projectId: string,
  workspaceId: string,
  suffix: string,
): string {
  return `/api/workspace-authority/${encodeURIComponent(projectId)}/${encodeURIComponent(workspaceId)}${suffix}`;
}

async function request<T>(
  url: string,
  init: RequestInit,
  fallback: WorkspaceAuthorityApiErrorCode,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new WorkspaceAuthorityClientError(
      "WORKSPACE_AUTHORITY_NOT_READY",
      WORKSPACE_AUTHORITY_NOT_READY_MESSAGE,
      503,
    );
  }

  const body = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok || body.success === false || body.data === undefined) {
    throw new WorkspaceAuthorityClientError(
      isWorkspaceAuthorityApiErrorCode(body.error?.code)
        ? body.error.code
        : fallback,
      body.error?.message ?? `Workspace Authority 响应 ${response.status}`,
      response.status,
    );
  }
  return body.data;
}

export function readWorkspaceAuthorityStateFromBrowser(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}): Promise<WorkspaceAuthoritySnapshot["state"]> {
  const notReady = getIdentifiersNotReadyError(input);
  if (notReady) return Promise.reject(notReady);
  return request(
    sameOriginPath(
      input.projectId,
      input.workspaceId,
      `/state?sessionId=${encodeURIComponent(input.sessionId)}`,
    ),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

/**
 * Reads one immutable Authority materialization. Callers that project several
 * resources (for example a page tree plus its runtime files) must use this
 * instead of issuing independent resource reads, which could span revisions.
 */
export function readWorkspaceAuthoritySnapshotFromBrowser(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}): Promise<WorkspaceAuthoritySnapshot> {
  const notReady = getIdentifiersNotReadyError(input);
  if (notReady) return Promise.reject(notReady);
  return request(
    sameOriginPath(
      input.projectId,
      input.workspaceId,
      `/snapshot?sessionId=${encodeURIComponent(input.sessionId)}`,
    ),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function readWorkspaceAuthorityEventsFromBrowser(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  afterRevision: WorkspaceRevision;
}): Promise<WorkspaceMutationCommittedEvent[]> {
  const notReady = getIdentifiersNotReadyError(input);
  if (notReady) return Promise.reject(notReady);
  return request(
    sameOriginPath(
      input.projectId,
      input.workspaceId,
      `/events?sessionId=${encodeURIComponent(input.sessionId)}&afterRevision=${input.afterRevision}`,
    ),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function readWorkspaceProjectionAcksFromBrowser(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  afterRevision?: WorkspaceRevision;
}): Promise<WorkspaceProjectionAck[]> {
  const notReady = getIdentifiersNotReadyError(input);
  if (notReady) return Promise.reject(notReady);
  return request(
    sameOriginPath(
      input.projectId,
      input.workspaceId,
      `/projection-acks?sessionId=${encodeURIComponent(input.sessionId)}&afterRevision=${input.afterRevision ?? 0}`,
    ),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function acknowledgeWorkspaceProjectionFromBrowser(
  ack: WorkspaceProjectionAck & { sessionId: string },
): Promise<{ acknowledged: true }> {
  const notReady = getIdentifiersNotReadyError(ack);
  if (notReady) return Promise.reject(notReady);
  return request(
    sameOriginPath(ack.projectId, ack.workspaceId, "/projection-ack"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ack),
    },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function readWorkspaceAuthorityResourceFromBrowser(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  path: string;
}): Promise<WorkspaceAuthorityResource> {
  const notReady = getIdentifiersNotReadyError(input);
  if (notReady) return Promise.reject(notReady);
  const resourcePath = input.path.split("/").map(encodeURIComponent).join("/");
  return request(
    sameOriginPath(
      input.projectId,
      input.workspaceId,
      `/resources/${resourcePath}?sessionId=${encodeURIComponent(input.sessionId)}`,
    ),
    { method: "GET" },
    "WORKSPACE_RESOURCE_NOT_FOUND",
  );
}

export function readWorkspaceAuthorityHealthFromBrowser(input: {
  projectId: string;
  workspaceId: string;
  sessionId: string;
}): Promise<WorkspaceAuthorityHealthView> {
  const notReady = getIdentifiersNotReadyError(input);
  if (notReady) return Promise.reject(notReady);
  return request(
    sameOriginPath(
      input.projectId,
      input.workspaceId,
      `/health?sessionId=${encodeURIComponent(input.sessionId)}`,
    ),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

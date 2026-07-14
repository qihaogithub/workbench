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
import { WorkspaceAuthorityClientError } from "./workspace-authority-shared";

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

function sameOriginPath(projectId: string, workspaceId: string, suffix: string): string {
  return `/api/workspace-authority/${encodeURIComponent(projectId)}/${encodeURIComponent(workspaceId)}${suffix}`;
}

async function request<T>(url: string, init: RequestInit, fallback: WorkspaceAuthorityApiErrorCode): Promise<T> {
  const response = await fetch(url, init).catch((error: unknown) => {
    throw new WorkspaceAuthorityClientError(
      "WORKSPACE_AUTHORITY_NOT_READY",
      error instanceof Error ? error.message : "Workspace Authority 不可用",
      503,
    );
  });
  const body = await response.json().catch(() => ({})) as Envelope<T>;
  if (!response.ok || body.success === false || body.data === undefined) {
    throw new WorkspaceAuthorityClientError(
      isWorkspaceAuthorityApiErrorCode(body.error?.code) ? body.error.code : fallback,
      body.error?.message ?? `Workspace Authority 响应 ${response.status}`,
      response.status,
    );
  }
  return body.data;
}

export function readWorkspaceAuthorityStateFromBrowser(input: {
  projectId: string; workspaceId: string; sessionId: string;
}): Promise<WorkspaceAuthoritySnapshot["state"]> {
  return request(
    sameOriginPath(input.projectId, input.workspaceId, `/state?sessionId=${encodeURIComponent(input.sessionId)}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function readWorkspaceAuthorityEventsFromBrowser(input: {
  projectId: string; workspaceId: string; sessionId: string; afterRevision: WorkspaceRevision;
}): Promise<WorkspaceMutationCommittedEvent[]> {
  return request(
    sameOriginPath(input.projectId, input.workspaceId, `/events?sessionId=${encodeURIComponent(input.sessionId)}&afterRevision=${input.afterRevision}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function readWorkspaceProjectionAcksFromBrowser(input: {
  projectId: string; workspaceId: string; sessionId: string; afterRevision?: WorkspaceRevision;
}): Promise<WorkspaceProjectionAck[]> {
  return request(
    sameOriginPath(input.projectId, input.workspaceId, `/projection-acks?sessionId=${encodeURIComponent(input.sessionId)}&afterRevision=${input.afterRevision ?? 0}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function acknowledgeWorkspaceProjectionFromBrowser(
  ack: WorkspaceProjectionAck & { sessionId: string },
): Promise<{ acknowledged: true }> {
  return request(
    sameOriginPath(ack.projectId, ack.workspaceId, "/projection-ack"),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ack) },
    "WORKSPACE_MUTATION_FAILED",
  );
}

export function readWorkspaceAuthorityResourceFromBrowser(input: {
  projectId: string; workspaceId: string; sessionId: string; path: string;
}): Promise<WorkspaceAuthorityResource> {
  const resourcePath = input.path.split("/").map(encodeURIComponent).join("/");
  return request(
    sameOriginPath(input.projectId, input.workspaceId, `/resources/${resourcePath}?sessionId=${encodeURIComponent(input.sessionId)}`),
    { method: "GET" },
    "WORKSPACE_RESOURCE_NOT_FOUND",
  );
}

export function readWorkspaceAuthorityHealthFromBrowser(input: {
  projectId: string; workspaceId: string; sessionId: string;
}): Promise<WorkspaceAuthorityHealthView> {
  return request(
    sameOriginPath(input.projectId, input.workspaceId, `/health?sessionId=${encodeURIComponent(input.sessionId)}`),
    { method: "GET" },
    "WORKSPACE_MUTATION_FAILED",
  );
}

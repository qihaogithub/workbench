import type {
  WorkspaceAuthorityApiErrorCode,
  WorkspaceMutationCommittedEvent,
  WorkspaceMutationReceipt,
  WorkspaceMutationRequest,
  WorkspaceProjectionAck,
  WorkspaceRevision,
} from "../../shared/src/contracts.js";
import { isWorkspaceAuthorityApiErrorCode } from "../../shared/src/contracts.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export interface ProjectWorkspaceAuthorityState {
  workspaceId: string;
  projectId: string;
  revision: WorkspaceRevision;
  rootHash: string;
  resourceHashes: Record<string, string>;
  updatedAt: number;
}

export class ProjectWorkspaceAuthorityClientError extends Error {
  constructor(
    readonly code: WorkspaceAuthorityApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProjectWorkspaceAuthorityClientError";
  }
}

export class ProjectWorkspaceAuthorityClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      sessionId: string;
      fetcher?: FetchLike;
    },
  ) {}

  getState(projectId: string, workspaceId: string): Promise<ProjectWorkspaceAuthorityState> {
    return this.request(projectId, workspaceId, "/state", { method: "GET" });
  }

  readResource(projectId: string, workspaceId: string, resourcePath: string): Promise<{
    path: string; content: string; hash: string; revision: WorkspaceRevision;
  }> {
    const encodedPath = resourcePath.split("/").map(encodeURIComponent).join("/");
    return this.request(projectId, workspaceId, `/resources/${encodedPath}`, { method: "GET" });
  }

  mutate(request: WorkspaceMutationRequest): Promise<WorkspaceMutationReceipt> {
    if (request.sessionId !== this.options.sessionId) {
      throw new ProjectWorkspaceAuthorityClientError("INVALID_REQUEST", "mutation sessionId 与 client 不匹配", 400);
    }
    return this.request(request.projectId, request.workspaceId, "/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  getEvents(projectId: string, workspaceId: string, afterRevision: WorkspaceRevision): Promise<WorkspaceMutationCommittedEvent[]> {
    return this.request(projectId, workspaceId, `/events?afterRevision=${afterRevision}`, { method: "GET" });
  }

  getProjectionAcks(projectId: string, workspaceId: string, afterRevision: WorkspaceRevision = 0): Promise<WorkspaceProjectionAck[]> {
    return this.request(projectId, workspaceId, `/projection-acks?afterRevision=${afterRevision}`, { method: "GET" });
  }

  acknowledgeProjection(ack: WorkspaceProjectionAck): Promise<{ acknowledged: true }> {
    return this.request(ack.projectId, ack.workspaceId, "/projection-ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ack, sessionId: this.options.sessionId }),
    });
  }

  reconcile(projectId: string, workspaceId: string, mode: "adopt" | "restore"): Promise<ProjectWorkspaceAuthorityState> {
    return this.request(projectId, workspaceId, `/reconcile/${mode}`, { method: "POST" });
  }

  private async request<T>(
    projectId: string,
    workspaceId: string,
    suffix: string,
    init: RequestInit,
  ): Promise<T> {
    const url = new URL(
      `/api/workspace-authority/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}${suffix}`,
      this.options.baseUrl,
    );
    if (!url.searchParams.has("sessionId")) url.searchParams.set("sessionId", this.options.sessionId);
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetcher(url, init).catch((error: unknown) => {
      throw new ProjectWorkspaceAuthorityClientError(
        "WORKSPACE_AUTHORITY_NOT_READY",
        error instanceof Error ? error.message : "Workspace Authority 不可用",
        503,
      );
    });
    const body = await response.json().catch(() => ({})) as Envelope<T>;
    if (!response.ok || body.success === false || body.data === undefined) {
      const errorCode = body.error?.code;
      throw new ProjectWorkspaceAuthorityClientError(
        isWorkspaceAuthorityApiErrorCode(errorCode) ? errorCode : "WORKSPACE_MUTATION_FAILED",
        body.error?.message ?? `Workspace Authority 响应 ${response.status}`,
        response.status,
      );
    }
    return body.data;
  }
}

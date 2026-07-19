import type { ErrorCodeType } from "@workbench/shared";

import {
  materializeCanonicalWorkspace,
  type CanonicalRevisionMetadata,
} from "./canonical-materializer";
import { getServerAgentServiceUrl } from "./runtime-config";
import { renewEditSession } from "./session-manager";
import {
  advanceWorkspaceBaseIfLatestSessionVersion,
  clearCanonicalSyncProofIfMatches,
  isLiveWorkspace,
} from "./workspace-manager";
import {
  getWorkspaceAuthoritySnapshot,
  WorkspaceAuthorityClientError,
} from "./workspace-authority-client";

import { appendEditorDiagnosticEvents } from "./editor-diagnostics/store";

function createFlushDiagnosticId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `ws-flush-${ts}-${rand}`;
}

function emitWorkspaceDiagnostic(
  eventType: string,
  options: {
    projectId: string;
    workspaceId?: string | null;
    sessionId: string;
  },
  level: "info" | "warn" | "error" = "info",
  extra: Record<string, unknown> = {},
): void {
  try {
    const event = {
      id: createFlushDiagnosticId(),
      editorSessionId: `server-${options.sessionId}`,
      projectId: options.projectId,
      sessionId: options.sessionId,
      workspaceId: options.workspaceId ?? undefined,
      timestamp: Date.now(),
      category: "workspace" as const,
      name: eventType,
      level,
      details: extra,
    };
    // Fire-and-forget to avoid blocking critical flush path
    appendEditorDiagnosticEvents([event]).catch(() => {});
  } catch {
    // Never let diagnostic failures affect the flush path
  }
}

export type WorkspaceFlushStatus =
  | "skipped"
  | "flushed"
  | "no_active_room"
  | "partial_failure";

export interface WorkspaceFlushResult {
  status: WorkspaceFlushStatus;
  flushedRooms: number;
  revision?: number;
  canonicalRevision?: number;
  canonicalRootHash?: string;
}

export interface WorkspaceFlushOptions {
  projectId: string;
  workspaceId?: string | null;
  sessionId: string;
}

export class WorkspaceFlushError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "WorkspaceFlushError";
    this.code = options?.code ?? "COLLAB_FLUSH_FAILED";
    this.status = options?.status ?? 502;
  }
}

export function getWorkspaceFlushErrorResponse(error: unknown): {
  code: ErrorCodeType;
  message: string;
  status: number;
} {
  if (error instanceof WorkspaceFlushError) {
    return {
      code: toApiErrorCode(error.code),
      message: error.message,
      status: error.status,
    };
  }
  return {
    code: "AGENT_SERVICE_ERROR",
    message: error instanceof Error ? error.message : "协同草稿落盘失败",
    status: 502,
  };
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

function isFlushStatus(
  value: unknown,
): value is Exclude<WorkspaceFlushStatus, "skipped"> {
  return (
    value === "flushed" ||
    value === "no_active_room" ||
    value === "partial_failure"
  );
}

function toApiErrorCode(code: string): ErrorCodeType {
  if (code === "SESSION_NOT_FOUND") return "SESSION_NOT_FOUND";
  if (code === "SESSION_EXPIRED") return "SESSION_EXPIRED";
  if (code === "INVALID_REQUEST") return "INVALID_REQUEST";
  if (code === "FORBIDDEN") return "FORBIDDEN";
  if (code === "FILE_WRITE_ERROR") return "FILE_WRITE_ERROR";
  if (code === "WORKSPACE_STALE") return "WORKSPACE_STALE";
  if (code === "WORKSPACE_EXTERNAL_DRIFT") return "WORKSPACE_STALE";
  if (code === "WORKSPACE_RESOURCE_CONFLICT") return "WORKSPACE_STALE";
  return "AGENT_SERVICE_ERROR";
}

function normalizeAgentFlushErrorCode(
  code?: string,
  message?: string,
): string | undefined {
  if (code === "WORKSPACE_RESOURCE_CONFLICT") return "WORKSPACE_STALE";
  if (code === "WORKSPACE_EXTERNAL_DRIFT") return "WORKSPACE_STALE";
  if (code !== "COLLAB_FLUSH_FAILED") return code;
  if (message === "WORKSPACE_RESOURCE_CONFLICT") return "WORKSPACE_STALE";
  if (message === "WORKSPACE_EXTERNAL_DRIFT") return "WORKSPACE_STALE";
  if (message === "SESSION_NOT_FOUND" || message === "SESSION_EXPIRED") {
    return message;
  }
  if (
    message === "PROJECT_MISMATCH" ||
    message === "WORKSPACE_MISMATCH" ||
    message === "WORKSPACE_PROJECT_MISMATCH"
  ) {
    return "INVALID_REQUEST";
  }
  if (
    message === "WORKSPACE_NOT_FOUND" ||
    message === "INVALID_RESOURCE_PATH"
  ) {
    return "FILE_WRITE_ERROR";
  }
  if (message === "COLLAB_FORBIDDEN") return "FORBIDDEN";
  return code;
}

export async function ensureCanonicalRevision(
  options: WorkspaceFlushOptions,
  target?: { revision?: number; rootHash?: string },
): Promise<CanonicalRevisionMetadata | undefined> {
  if (!options.workspaceId) return undefined;
  if (!isLiveWorkspace(options.workspaceId)) return undefined;

  try {
    const snapshot = await getWorkspaceAuthoritySnapshot({
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
    });
    if (
      typeof target?.revision === "number" &&
      snapshot.state.revision < target.revision
    ) {
      throw new WorkspaceFlushError("WORKSPACE_CANONICAL_REVISION_BEHIND", {
        code: "WORKSPACE_STALE",
        status: 409,
      });
    }
    if (
      typeof target?.revision === "number" &&
      snapshot.state.revision === target.revision &&
      target.rootHash &&
      snapshot.state.rootHash !== target.rootHash
    ) {
      throw new WorkspaceFlushError("WORKSPACE_CANONICAL_ROOT_HASH_MISMATCH", {
        code: "WORKSPACE_STALE",
        status: 409,
      });
    }
    return {
      revision: snapshot.state.revision,
      rootHash: snapshot.state.rootHash,
    };
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) {
      const normalizedCode = normalizeAgentFlushErrorCode(
        error.code,
        error.message,
      );
      throw new WorkspaceFlushError(error.message, {
        code: normalizedCode,
        status: error.code === "WORKSPACE_EXTERNAL_DRIFT" ? 409 : error.status,
      });
    }
    throw error;
  }
}

async function ensureCanonicalRevisionUnchanged(
  options: WorkspaceFlushOptions,
  expected: CanonicalRevisionMetadata,
): Promise<void> {
  const latest = await ensureCanonicalRevision(options, {
    revision: expected.revision,
    rootHash: expected.rootHash,
  });
  if (!latest) return;
  if (
    latest.revision !== expected.revision ||
    latest.rootHash !== expected.rootHash
  ) {
    throw new WorkspaceFlushError(
      "WORKSPACE_CANONICAL_REVISION_CHANGED_DURING_MATERIALIZE",
      {
        code: "WORKSPACE_STALE",
        status: 409,
      },
    );
  }
}

function parseFlushEnvelope(value: unknown): ApiEnvelope<WorkspaceFlushResult> {
  if (!value || typeof value !== "object") return {};
  return value as ApiEnvelope<WorkspaceFlushResult>;
}

export async function flushWorkspaceBeforeCriticalAction(
  options: WorkspaceFlushOptions,
): Promise<WorkspaceFlushResult> {
  if (!options.workspaceId) {
    return { status: "skipped", flushedRooms: 0 };
  }

  renewEditSession(options.sessionId);

  const startedAt = Date.now();
  emitWorkspaceDiagnostic(
    "workspace.flush_started",
    {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
    },
    "info",
    { startedAt },
  );

  const params = new URLSearchParams({ sessionId: options.sessionId });
  const response = await fetch(
    `${getServerAgentServiceUrl()}/api/collab/projects/${encodeURIComponent(
      options.projectId,
    )}/workspaces/${encodeURIComponent(options.workspaceId)}/flush-all?${params.toString()}`,
    { method: "POST" },
  ).catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("[workspace-flush] agent-service unreachable", error);
    emitWorkspaceDiagnostic(
      "workspace.flush_failed",
      {
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        sessionId: options.sessionId,
      },
      "error",
      {
        reason: "agent_unreachable",
        error: errorMessage,
        elapsedMs: Date.now() - startedAt,
      },
    );
    throw new WorkspaceFlushError(
      "协同草稿落盘服务不可用，请确认 agent-service 已启动",
    );
  });

  const elapsedMs = Date.now() - startedAt;
  const body = parseFlushEnvelope(await response.json().catch(() => ({})));
  if (!response.ok || body.success === false) {
    emitWorkspaceDiagnostic(
      "workspace.flush_failed",
      {
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        sessionId: options.sessionId,
      },
      "error",
      {
        httpStatus: response.status || 502,
        errorCode: body.error?.code,
        errorMessage: body.error?.message,
        elapsedMs,
      },
    );
    throw new WorkspaceFlushError(body.error?.message ?? "协同草稿落盘失败", {
      code: normalizeAgentFlushErrorCode(body.error?.code, body.error?.message),
      status: response.status || 502,
    });
  }

  const data = body.data;
  const status = isFlushStatus(data?.status) ? data.status : "flushed";
  if (status === "partial_failure") {
    const failures = (data as any)?.failures;
    console.warn(
      "[workspace-flush] partial_failure: some rooms failed to flush",
      { failures },
    );
    emitWorkspaceDiagnostic(
      "workspace.flush_failed",
      {
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        sessionId: options.sessionId,
      },
      "error",
      {
        status: "partial_failure",
        flushedRooms: data?.flushedRooms,
        failures: Array.isArray(failures) ? failures : undefined,
        elapsedMs,
      },
    );
    throw new WorkspaceFlushError(
      `协同草稿部分落盘失败${Array.isArray(failures) && failures.length > 0 ? `: ${failures.map((f: { resourcePath?: string; error?: string }) => `${f.resourcePath ?? "unknown"}: ${f.error ?? "unknown error"}`).join("; ")}` : ""}`,
      { code: "COLLAB_FLUSH_FAILED", status: 502 },
    );
  }

  emitWorkspaceDiagnostic(
    "workspace.flush_succeeded",
    {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
    },
    "info",
    {
      status,
      flushedRooms: typeof data?.flushedRooms === "number" ? data.flushedRooms : 0,
      revision: typeof data?.revision === "number" ? data.revision : undefined,
      elapsedMs,
    },
  );

  return {
    status,
    flushedRooms:
      typeof data?.flushedRooms === "number" ? data.flushedRooms : 0,
    revision: typeof data?.revision === "number" ? data.revision : undefined,
  };
}

export async function flushAndSyncProjectWorkspace(
  options: WorkspaceFlushOptions,
): Promise<WorkspaceFlushResult & { workspacePath?: string }> {
  const flushResult = await flushWorkspaceBeforeCriticalAction(options);

  emitWorkspaceDiagnostic(
    "workspace.canonical_sync_started",
    {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
    },
    "info",
    {
      targetRevision: flushResult.revision,
    },
  );

  const syncMetadata = await ensureCanonicalRevision(options, {
    revision: flushResult.revision,
  });
  let synced = materializeCanonicalWorkspace({
    projectId: options.projectId,
    workspaceId: options.workspaceId,
    metadata: syncMetadata,
  });
  if (
    !synced.success &&
    synced.code === "WORKSPACE_STALE" &&
    advanceWorkspaceBaseIfLatestSessionVersion(
      options.projectId,
      options.workspaceId,
      options.sessionId,
    )
  ) {
    synced = materializeCanonicalWorkspace({
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      metadata: syncMetadata,
    });
  }
  if (!synced.success) {
    emitWorkspaceDiagnostic(
      "workspace.canonical_sync_failed",
      {
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        sessionId: options.sessionId,
      },
      "error",
      {
        error: synced.error,
        errorCode: synced.code,
        revision: syncMetadata?.revision,
        rootHash: syncMetadata?.rootHash,
      },
    );
    throw new WorkspaceFlushError(synced.error || "同步项目当前工作区失败", {
      code: synced.code || "FILE_WRITE_ERROR",
      status: synced.code === "WORKSPACE_STALE" ? 409 : 500,
    });
  }
  if (syncMetadata) {
    try {
      await ensureCanonicalRevisionUnchanged(options, syncMetadata);
    } catch (error) {
      clearCanonicalSyncProofIfMatches(
        options.projectId,
        options.workspaceId,
        syncMetadata,
      );
      throw error;
    }
  }

  emitWorkspaceDiagnostic(
    "workspace.canonical_sync_succeeded",
    {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
    },
    "info",
    {
      canonicalRevision: syncMetadata?.revision,
      canonicalRootHash: syncMetadata?.rootHash,
      workspacePath: synced.workspacePath,
    },
  );

  return {
    ...flushResult,
    workspacePath: synced.workspacePath,
    ...(syncMetadata
      ? {
          canonicalRevision: syncMetadata.revision,
          canonicalRootHash: syncMetadata.rootHash,
        }
      : {}),
  };
}

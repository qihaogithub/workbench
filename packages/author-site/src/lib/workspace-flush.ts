import type { ErrorCodeType } from "@opencode-workbench/shared";

import { getServerAgentServiceUrl } from "./runtime-config";

export type WorkspaceFlushStatus = "skipped" | "flushed" | "no_active_room";

export interface WorkspaceFlushResult {
  status: WorkspaceFlushStatus;
  flushedRooms: number;
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

function isFlushStatus(value: unknown): value is Exclude<WorkspaceFlushStatus, "skipped"> {
  return value === "flushed" || value === "no_active_room";
}

function toApiErrorCode(code: string): ErrorCodeType {
  if (code === "SESSION_NOT_FOUND") return "SESSION_NOT_FOUND";
  if (code === "SESSION_EXPIRED") return "SESSION_EXPIRED";
  if (code === "INVALID_REQUEST") return "INVALID_REQUEST";
  if (code === "FORBIDDEN") return "FORBIDDEN";
  return "AGENT_SERVICE_ERROR";
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

  const params = new URLSearchParams({ sessionId: options.sessionId });
  const response = await fetch(
    `${getServerAgentServiceUrl()}/api/collab/projects/${encodeURIComponent(
      options.projectId,
    )}/workspaces/${encodeURIComponent(options.workspaceId)}/flush-all?${params.toString()}`,
    { method: "POST" },
  ).catch((error: unknown) => {
    throw new WorkspaceFlushError(
      error instanceof Error ? error.message : "协同草稿落盘服务不可用",
    );
  });

  const body = parseFlushEnvelope(await response.json().catch(() => ({})));
  if (!response.ok || body.success === false) {
    throw new WorkspaceFlushError(body.error?.message ?? "协同草稿落盘失败", {
      code: body.error?.code,
      status: response.status || 502,
    });
  }

  const data = body.data;
  return {
    status: isFlushStatus(data?.status) ? data.status : "flushed",
    flushedRooms: typeof data?.flushedRooms === "number" ? data.flushedRooms : 0,
  };
}

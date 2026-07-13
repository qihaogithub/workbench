import { NextRequest, NextResponse } from "next/server";
import {
  ProjectAdminService,
  type ProjectResourceKind,
  type SketchPatchVersionSummary,
} from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getDataDir,
  getSessionMeta,
  isSessionExpired,
  sessionExists,
} from "@/lib/fs-utils";
import {
  flushAndSyncProjectWorkspace,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";

async function getAuthenticatedUser() {
  const token = getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

function normalizeKind(kind: string): ProjectResourceKind | null {
  if (
    kind === "page" ||
    kind === "knowledge_document" ||
    kind === "canvas" ||
    kind === "asset" ||
    kind === "project_config"
  ) {
    return kind;
  }
  return null;
}

function projectService() {
  return new ProjectAdminService({ dataDir: getDataDir() });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSketchPatchSummary(value: unknown): SketchPatchVersionSummary | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const operationCount = value.operationCount;
  const hasBaseSceneKey = value.hasBaseSceneKey;
  if (
    typeof operationCount !== "number" ||
    !Number.isInteger(operationCount) ||
    operationCount < 0 ||
    typeof hasBaseSceneKey !== "boolean"
  ) {
    return null;
  }
  const summary: SketchPatchVersionSummary = {
    operationCount,
    hasBaseSceneKey,
  };
  if (typeof value.currentNodeCount === "number" && Number.isInteger(value.currentNodeCount)) {
    summary.currentNodeCount = value.currentNodeCount;
  }
  if (typeof value.targetNodeCount === "number" && Number.isInteger(value.targetNodeCount)) {
    summary.targetNodeCount = value.targetNodeCount;
  }
  return summary;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; kind: string; resourceId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const kind = normalizeKind(params.kind);
  if (!kind) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "资源类型不合法"), { status: 400 });
  }
  const result = projectService().resourceVersionList(
    {
      projectId: params.projectId,
      kind,
      resourceId: params.resourceId,
      includeDraft: request.nextUrl.searchParams.get("includeDraft") === "true",
    },
    {
      id: payload.userId,
      name: payload.username,
      role: "creator",
      source: "author-site",
    },
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", result.error?.message ?? "读取资源历史失败"),
      { status: result.error?.code === "FORBIDDEN" ? 403 : 500 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; kind: string; resourceId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const kind = normalizeKind(params.kind);
  if (!kind) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "资源类型不合法"), { status: 400 });
  }
  const body = await request.json().catch(() => ({})) as {
    note?: string;
    editId?: string;
    sessionId?: string;
    sketchPatchSummary?: unknown;
  };
  const sketchPatchSummary = parseSketchPatchSummary(body.sketchPatchSummary);
  if (sketchPatchSummary === null) {
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "sketchPatchSummary 格式不合法"),
      { status: 400 },
    );
  }
  let sourceWorkspacePath: string | undefined;
  let workspaceProof:
    | { workspaceId: string; workspaceRevision?: number; workspaceRootHash?: string }
    | undefined;
  if (kind === "page" && body.sessionId) {
    if (!sessionExists(body.sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    }
    const meta = getSessionMeta(body.sessionId);
    if (!meta || meta.demoId !== params.projectId) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    }
    if (meta.userId && meta.userId !== payload.userId) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权操作其他用户的 Session"), { status: 403 });
    }
    if (isSessionExpired(meta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
    }
    sourceWorkspacePath = meta.workspaceId
      ? findWorkspacePath(meta.workspaceId) ?? undefined
      : undefined;
    if (meta.workspaceId && sourceWorkspacePath && isLiveWorkspacePath(sourceWorkspacePath)) {
      try {
        const synced = await flushAndSyncProjectWorkspace({
          projectId: params.projectId,
          workspaceId: meta.workspaceId,
          sessionId: body.sessionId,
        });
        workspaceProof = {
          workspaceId: meta.workspaceId,
          workspaceRevision: synced.canonicalRevision,
          workspaceRootHash: synced.canonicalRootHash,
        };
      } catch (error) {
        const flushError = getWorkspaceFlushErrorResponse(error);
        return NextResponse.json(
          createApiError(flushError.code, flushError.message),
          { status: flushError.status },
        );
      }
    }
  }
  const result = projectService().resourceVersionCreate(
    {
      projectId: params.projectId,
      kind,
      resourceId: params.resourceId,
      editId: body.editId,
      sourceWorkspacePath,
      workspaceId: workspaceProof?.workspaceId,
      workspaceRevision: workspaceProof?.workspaceRevision,
      workspaceRootHash: workspaceProof?.workspaceRootHash,
      note: body.note,
      sketchPatchSummary,
    },
    {
      id: payload.userId,
      name: payload.username,
      role: "creator",
      source: "author-site",
    },
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", result.error?.message ?? "创建资源版本失败"),
      { status: 500 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data), { status: 201 });
}

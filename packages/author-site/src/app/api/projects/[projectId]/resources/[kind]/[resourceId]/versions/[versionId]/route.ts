import { NextRequest, NextResponse } from "next/server";
import { ProjectAdminService, type ProjectResourceKind } from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  getDataDir,
  getSessionMeta,
  getWorkspaceMeta,
  isSessionExpired,
  markWorkspaceBasedOnVersion,
  sessionExists,
  updateWorkspaceDemoFiles,
} from "@/lib/fs-utils";
import {
  flushAndSyncProjectWorkspace,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";
import { syncActiveWorkspaceToCanonical } from "@/lib/workspace-manager";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; kind: string; resourceId: string; versionId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const kind = normalizeKind(params.kind);
  if (!kind) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "资源类型不合法"), { status: 400 });
  }
  const result = projectService().resourceVersionGet(
    {
      projectId: params.projectId,
      kind,
      resourceId: params.resourceId,
      versionId: params.versionId,
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
      createApiError("VERSION_NOT_FOUND", result.error?.message ?? "资源版本不存在"),
      { status: result.error?.code === "FORBIDDEN" ? 403 : 404 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; kind: string; resourceId: string; versionId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const kind = normalizeKind(params.kind);
  if (!kind) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "资源类型不合法"), { status: 400 });
  }
  const body = await request.json().catch(() => ({})) as { sessionId?: string; workspaceId?: string };
  const actor = {
    id: payload.userId,
    name: payload.username,
    role: "creator" as const,
    source: "author-site",
  };
  const service = projectService();
  if (kind === "page") {
    const meta = body.sessionId ? getSessionMeta(body.sessionId) : null;
    const restoreWorkspaceId = body.workspaceId || meta?.workspaceId;
    if (body.sessionId) {
      if (!sessionExists(body.sessionId) || !meta || meta.demoId !== params.projectId) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
      }
      if (meta.userId && meta.userId !== payload.userId) {
        return NextResponse.json(createApiError("FORBIDDEN", "无权操作其他用户的 Session"), { status: 403 });
      }
      if (isSessionExpired(meta)) {
        return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
      }
      try {
        await flushAndSyncProjectWorkspace({
          projectId: params.projectId,
          workspaceId: restoreWorkspaceId,
          sessionId: body.sessionId,
        });
      } catch (error) {
        const flushError = getWorkspaceFlushErrorResponse(error);
        return NextResponse.json(
          createApiError(flushError.code, flushError.message),
          { status: flushError.status },
        );
      }
    }
    if (restoreWorkspaceId) {
      const workspaceMeta = getWorkspaceMeta(restoreWorkspaceId);
      if (!workspaceMeta || workspaceMeta.projectId !== params.projectId || workspaceMeta.status === "archived") {
        return NextResponse.json(
          createApiError("WORKSPACE_STALE", "当前工作区已过期，请刷新项目后重试"),
          { status: 409 },
        );
      }
    }

    const pageResult = service.restorePageVersion(params.projectId, params.resourceId, params.versionId, actor);
    if (!pageResult.ok || !pageResult.data) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", pageResult.error?.message ?? "恢复页面版本失败"),
        { status: 500 },
      );
    }
    if (restoreWorkspaceId) {
      const workspaceUpdated = updateWorkspaceDemoFiles(
        restoreWorkspaceId,
        params.resourceId,
        pageResult.data.files,
      );
      if (!workspaceUpdated) {
        return NextResponse.json(createApiError("FILE_WRITE_ERROR", "同步 Session Workspace 失败"), { status: 500 });
      }
      if (!markWorkspaceBasedOnVersion(restoreWorkspaceId, pageResult.data.newVersionId)) {
        return NextResponse.json(createApiError("FILE_WRITE_ERROR", "更新 Workspace 版本基线失败"), { status: 500 });
      }
      const synced = syncActiveWorkspaceToCanonical(params.projectId, restoreWorkspaceId);
      if (!synced.success) {
        const code = synced.code === "WORKSPACE_STALE" ? "WORKSPACE_STALE" : "FILE_WRITE_ERROR";
        return NextResponse.json(
          createApiError(code, synced.error || "同步项目当前工作区失败"),
          { status: code === "WORKSPACE_STALE" ? 409 : 500 },
        );
      }
    }
    return NextResponse.json(createApiSuccess(pageResult.data));
  }
  const result = service.resourceRestore(
    {
      projectId: params.projectId,
      kind,
      resourceId: params.resourceId,
      versionId: params.versionId,
      sessionId: body.sessionId,
      workspaceId: body.workspaceId,
    },
    actor,
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", result.error?.message ?? "恢复资源版本失败"),
      { status: 500 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

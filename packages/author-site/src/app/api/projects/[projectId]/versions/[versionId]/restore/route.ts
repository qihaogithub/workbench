import { NextRequest, NextResponse } from "next/server";
import { ProjectAdminService } from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  getDataDir,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
} from "@/lib/fs-utils";
import {
  flushAndSyncProjectWorkspace,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";

function projectService() {
  return new ProjectAdminService({ dataDir: getDataDir() });
}

async function getAuthenticatedUser() {
  const token = getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; versionId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }

  const body = await request.json().catch(() => ({})) as {
    sessionId?: string;
    workspaceId?: string;
  };
  const actor = {
    id: payload.userId,
    name: payload.username,
    role: "creator" as const,
    source: "author-site",
  };

  let restoreWorkspaceProof:
    | { workspaceId?: string; workspaceRevision?: number; workspaceRootHash?: string }
    | undefined;

  if (body.sessionId && body.workspaceId) {
    if (!sessionExists(body.sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }
    const meta = getSessionMeta(body.sessionId);
    if (!meta || meta.demoId !== params.projectId) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }
    if (meta.userId && meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      );
    }
    if (isSessionExpired(meta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), {
        status: 410,
      });
    }
    try {
      const synced = await flushAndSyncProjectWorkspace({
        projectId: params.projectId,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
      });
      restoreWorkspaceProof = {
        workspaceId: body.workspaceId,
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

  const result = projectService().restoreProjectVersion(
    params.projectId,
    params.versionId,
    actor,
    restoreWorkspaceProof,
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError(
        "FILE_WRITE_ERROR",
        result.error?.message ?? "恢复项目版本失败",
      ),
      { status: 500 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

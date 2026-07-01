import { NextRequest, NextResponse } from "next/server";
import {
  createApiError,
  createApiSuccess,
  readPageVersionFiles,
  restorePageVersion,
  updateWorkspaceDemoFiles,
  getSessionMeta,
  isSessionExpired,
  projectExists,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
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

export async function GET(
  _request: NextRequest,
  {
    params,
  }: { params: { projectId: string; demoId: string; versionId: string } },
) {
  try {
    const payload = await getAuthenticatedUser();
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const { projectId, demoId, versionId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const files = readPageVersionFiles(projectId, demoId, versionId);
    if (!files) {
      return NextResponse.json(createApiError("VERSION_NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(createApiSuccess(files));
  } catch (error) {
    console.error("Error getting page version files:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取页面版本失败"),
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: { projectId: string; demoId: string; versionId: string } },
) {
  try {
    const payload = await getAuthenticatedUser();
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const { projectId, demoId, versionId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId } = body as { sessionId?: string };
    const meta = sessionId ? getSessionMeta(sessionId) : null;

    if (sessionId) {
      if (!sessionExists(sessionId) || !meta || meta.demoId !== projectId) {
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
        await flushAndSyncProjectWorkspace({
          projectId,
          workspaceId: meta.workspaceId,
          sessionId,
        });
      } catch (error) {
        const flushError = getWorkspaceFlushErrorResponse(error);
        return NextResponse.json(
          createApiError(flushError.code, flushError.message),
          { status: flushError.status },
        );
      }
    }

    const result = restorePageVersion(
      projectId,
      demoId,
      versionId,
      payload.username,
    );

    if (!result.success || !result.newVersionId || !result.files) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", result.error || "恢复页面版本失败"),
        { status: 500 },
      );
    }

    if (meta?.workspaceId) {
      updateWorkspaceDemoFiles(meta.workspaceId, demoId, result.files);
      const synced = syncActiveWorkspaceToCanonical(projectId, meta.workspaceId);
      if (!synced.success) {
        const code = synced.code === "WORKSPACE_STALE" ? "WORKSPACE_STALE" : "FILE_WRITE_ERROR";
        return NextResponse.json(
          createApiError(code, synced.error || "同步项目当前工作区失败"),
          { status: code === "WORKSPACE_STALE" ? 409 : 500 },
        );
      }
    }

    return NextResponse.json(
      createApiSuccess({
        success: true,
        newVersionId: result.newVersionId,
        restoredAt: result.restoredAt,
        files: result.files,
      }),
    );
  } catch (error) {
    console.error("Error restoring page version:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "恢复页面版本失败"),
      { status: 500 },
    );
  }
}

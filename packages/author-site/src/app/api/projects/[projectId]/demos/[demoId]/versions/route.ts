import { NextRequest, NextResponse } from "next/server";
import {
  createApiError,
  createApiSuccess,
  createPageVersionSnapshot,
  findWorkspacePath,
  getPageVersionHistory,
  getSessionMeta,
  isSessionExpired,
  projectExists,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

async function getAuthenticatedUser() {
  const token = getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const payload = await getAuthenticatedUser();
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const { projectId, demoId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const versions = getPageVersionHistory(projectId, demoId);
    return NextResponse.json(
      createApiSuccess({
        projectId,
        demoId,
        currentVersion: versions[0]?.versionId || "v0",
        versions,
        totalVersions: versions.length,
      }),
    );
  } catch (error) {
    console.error("Error getting page version history:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取页面版本历史失败"),
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const payload = await getAuthenticatedUser();
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const { projectId, demoId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, note } = body as { sessionId?: string; note?: string };
    let sourceWorkspacePath: string | undefined;

    if (sessionId) {
      if (!sessionExists(sessionId)) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
          status: 404,
        });
      }
      const meta = getSessionMeta(sessionId);
      if (!meta || meta.demoId !== projectId) {
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
      sourceWorkspacePath = meta.workspaceId
        ? findWorkspacePath(meta.workspaceId) ?? undefined
        : undefined;
    }

    const result = createPageVersionSnapshot(
      projectId,
      demoId,
      payload.username,
      note,
      sourceWorkspacePath,
    );
    if (!result.success || !result.version) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", result.error || "创建页面版本失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(result.version), {
      status: 201,
    });
  } catch (error) {
    console.error("Error creating page version:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建页面版本失败"),
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  createProjectVersionSnapshot,
} from "@/lib/fs-utils";
import { getEditSession } from "@/lib/session-manager";
import {
  flushAndSyncProjectWorkspace,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";
import { validateWorkspacePreviewRuntime } from "@/lib/preview-validation";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const body = await request.json().catch(() => ({}));
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : "自动保存记录";

    const session = getEditSession(params.sessionId);
    if (!session) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }
    if (session.userId && session.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      );
    }
    if (!session.workspacePath) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspace"),
        { status: 400 },
      );
    }

    let synced: Awaited<ReturnType<typeof flushAndSyncProjectWorkspace>>;
    try {
      synced = await flushAndSyncProjectWorkspace({
        projectId: session.demoId,
        workspaceId: session.workspaceId,
        sessionId: params.sessionId,
      });
      if (
        synced.canonicalRevision === undefined ||
        !synced.canonicalRootHash
      ) {
        return NextResponse.json(
          createApiError("WORKSPACE_STALE", "项目基准工作区尚未绑定 committed revision"),
          { status: 409 },
        );
      }
    } catch (error) {
      const flushError = getWorkspaceFlushErrorResponse(error);
      return NextResponse.json(
        createApiError(flushError.code, flushError.message),
        { status: flushError.status },
      );
    }

    const runtimeValidation = validateWorkspacePreviewRuntime(session.workspacePath);
    if (!runtimeValidation.ok) {
      return NextResponse.json(
        createApiError(
          "VALIDATION_ERROR",
          "预览校验未通过，暂不创建自动保存记录",
          { runtimeValidation },
        ),
        { status: 422 },
      );
    }

    const result = createProjectVersionSnapshot(session.demoId, payload.username, {
      sessionId: params.sessionId,
      note,
      type: "auto_checkpoint",
      advanceWorkspaceId: session.workspaceId,
      workspaceId: session.workspaceId,
      workspaceRevision: synced.canonicalRevision,
      workspaceRootHash: synced.canonicalRootHash,
    });

    if (!result.success || !result.version) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", result.error || "创建自动保存记录失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(
      createApiSuccess({
        sessionId: params.sessionId,
        version: result.version.versionId,
        savedAt: result.version.savedAt,
      }),
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating auto checkpoint:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建自动保存记录失败"),
      { status: 500 },
    );
  }
}

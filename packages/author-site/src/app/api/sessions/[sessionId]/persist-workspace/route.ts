import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { getEditSession } from "@/lib/session-manager";
import {
  flushAndSyncProjectWorkspace,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";

export async function POST(
  _request: Request,
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
    if (!session.workspaceId || !session.workspacePath) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspace"),
        { status: 400 },
      );
    }

    try {
      const synced = await flushAndSyncProjectWorkspace({
        projectId: session.demoId,
        workspaceId: session.workspaceId,
        sessionId: params.sessionId,
      });
      return NextResponse.json(
        createApiSuccess({
          sessionId: params.sessionId,
          projectId: session.demoId,
          workspacePath: synced.workspacePath,
          persistedAt: Date.now(),
        }),
      );
    } catch (error) {
      const flushError = getWorkspaceFlushErrorResponse(error);
      return NextResponse.json(
        createApiError(flushError.code, flushError.message),
        { status: flushError.status },
      );
    }
  } catch (error) {
    console.error("Error persisting session workspace:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "同步项目当前工作区失败"),
      { status: 500 },
    );
  }
}

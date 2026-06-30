import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { getEditSession } from "@/lib/session-manager";
import {
  flushWorkspaceBeforeCriticalAction,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";

interface WorkspaceFlushRequestBody {
  projectId?: unknown;
  workspaceId?: unknown;
}

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

    const body = (await request.json().catch(() => ({}))) as WorkspaceFlushRequestBody;
    if (typeof body.projectId === "string" && body.projectId !== session.demoId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "项目与 Session 不匹配"),
        { status: 400 },
      );
    }
    if (
      typeof body.workspaceId === "string" &&
      body.workspaceId !== session.workspaceId
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Workspace 与 Session 不匹配"),
        { status: 400 },
      );
    }

    try {
      const result = await flushWorkspaceBeforeCriticalAction({
        projectId: session.demoId,
        workspaceId: session.workspaceId,
        sessionId: params.sessionId,
      });
      return NextResponse.json(createApiSuccess(result));
    } catch (error) {
      const flushError = getWorkspaceFlushErrorResponse(error);
      return NextResponse.json(
        createApiError(flushError.code, flushError.message),
        { status: flushError.status },
      );
    }
  } catch (error) {
    console.error("Error flushing workspace:", error);
    return NextResponse.json(
      createApiError("AGENT_SERVICE_ERROR", "协同草稿同步失败"),
      { status: 502 },
    );
  }
}

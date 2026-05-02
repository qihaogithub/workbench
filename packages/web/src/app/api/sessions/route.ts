import { NextRequest, NextResponse } from "next/server";
import { getAgentClient } from "@/lib/agent-client";
import {
  createApiSuccess,
  createApiError,
  getSessionFiles,
  getSessionPath,
} from "@/lib/fs-utils";
import { findActiveSession, createEditSession, archiveActiveSession } from "@/lib/session-manager";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    // 从 Cookie 读取 userId
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

    const userId = payload.userId;
    const body = await request.json();
    const { demoId: projectId, forceNew } = body;

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "projectId 参数必填"),
        { status: 400 },
      );
    }

    if (forceNew) {
      archiveActiveSession(userId, projectId);
    }

    const activeSessionId = findActiveSession(userId, projectId);
    if (activeSessionId) {
      const files = getSessionFiles(activeSessionId);
      if (files) {
        // 获取 session 的工作空间路径
        const sessionPath = getSessionPath(activeSessionId);
        return NextResponse.json(
          createApiSuccess({
            sessionId: activeSessionId,
            code: files.code,
            schema: files.schema,
            tempWorkspace: sessionPath,
          }),
        );
      }
    }

    const result = await createEditSession(userId, projectId);
    return NextResponse.json(createApiSuccess(result), { status: 201 });
  } catch (error) {
    console.error("Error creating session:", error);

    if (error instanceof Error && error.message.includes("不存在")) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建 Session 失败"),
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : undefined;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!)
      : undefined;

    const agentClient = getAgentClient();
    const result = await agentClient.listSessions({ status, limit, offset });

    if (!result.success) {
      return NextResponse.json(
        createApiError("AGENT_SERVICE_ERROR", result.error.message),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(result.data));
  } catch (error) {
    console.error("Error listing sessions:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取 Session 列表失败"),
      { status: 500 },
    );
  }
}

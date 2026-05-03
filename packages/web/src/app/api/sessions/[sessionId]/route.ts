import { NextResponse } from "next/server";
import {
  deleteSession,
  sessionExists,
  createApiSuccess,
  createApiError,
  getSessionPath,
  getSessionMeta,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getAgentClient } from "@/lib/agent-client";
import fs from "fs";
import path from "path";

export async function GET(
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

    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const meta = getSessionMeta(sessionId);
    if (!meta) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    if (meta.userId && meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权访问其他用户的 Session"),
        { status: 403 },
      );
    }

    return NextResponse.json(
      createApiSuccess({
        ...meta,
        isExpired: Date.now() > meta.expiresAt,
        workspacePath: getSessionPath(sessionId),
      }),
    );
  } catch (error) {
    console.error("Error getting session:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取 Session 信息失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const userId = payload.userId;
    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const sessionPath = getSessionPath(sessionId);
    const metaPath = path.join(sessionPath, ".session.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (meta.userId && meta.userId !== userId) {
        return NextResponse.json(
          createApiError("FORBIDDEN", "无权删除其他用户的 Session"),
          { status: 403 },
        );
      }
    }

    const success = deleteSession(sessionId);

    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "删除 Session 失败"),
        { status: 500 },
      );
    }

    // 同步清理 agent-service 中的会话
    try {
      const agentClient = getAgentClient();
      await agentClient.destroySession(sessionId);
    } catch (error) {
      console.warn("Failed to destroy session from agent-service:", error);
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除 Session 失败"),
      { status: 500 },
    );
  }
}

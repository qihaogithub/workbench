import { NextResponse } from "next/server";
import {
  deleteSession,
  sessionExists,
  createApiSuccess,
  createApiError,
  getSessionPath,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import fs from "fs";
import path from "path";

export async function DELETE(
  _request: Request,
  { params }: { params: { sessionId: string } },
) {
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
    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    // 验证 session 属于当前用户（安全检查）
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

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除 Session 失败"),
      { status: 500 },
    );
  }
}

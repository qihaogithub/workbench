import { NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { cleanupExpiredSessions } from "@/lib/session-manager";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

export async function POST() {
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

    // 仅清理当前用户的过期 session
    const cleaned = cleanupExpiredSessions(payload.userId);
    return NextResponse.json(
      createApiSuccess({
        cleaned,
        count: cleaned.length,
      }),
    );
  } catch (error) {
    console.error("[Session Cleanup] Error:", error);
    return NextResponse.json(createApiError("INTERNAL_ERROR", "清理失败"), {
      status: 500,
    });
  }
}

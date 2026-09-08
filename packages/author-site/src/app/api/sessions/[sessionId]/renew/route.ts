import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { getEditSession, renewEditSession } from "@/lib/session-manager";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const token = await getAuthCookie();
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

    const { sessionId } = await params;
    const session = getEditSession(sessionId);
    if (!session) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }
    if (!session.userId || session.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      );
    }

    const renewed = renewEditSession(sessionId);
    if (!renewed) {
      return NextResponse.json(
        createApiError("SESSION_EXPIRED", "Session 已过期，无法续期"),
        { status: 410 },
      );
    }

    const updatedSession = getEditSession(sessionId);
    return NextResponse.json(
      createApiSuccess({
        sessionId,
        expiresAt: updatedSession?.expiresAt ?? Date.now() + 2 * 60 * 60 * 1000,
      }),
    );
  } catch (error) {
    console.error("Error renewing session:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "续期 Session 失败"),
      { status: 500 },
    );
  }
}

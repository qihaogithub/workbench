import { NextRequest, NextResponse } from "next/server";
import {
  createApiSuccess,
  createApiError,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getConversationService } from "@/lib/conversation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
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

    const userId = payload.userId;
    const { projectId } = await params;

    // Compatibility endpoint: the history UI has moved to /api/conversations,
    // but any remaining caller still receives canonical ledger-backed data.
    const sessions = getConversationService().list(userId, projectId).map((conversation) => ({
      sessionId: conversation.id,
      demoId: conversation.projectId,
      workspaceId: conversation.workspaceId,
      title: conversation.title,
      createdAt: conversation.createdAt,
      lastActivityAt: conversation.updatedAt,
    }));

    return NextResponse.json(createApiSuccess(sessions));
  } catch (error) {
    console.error("Error listing project sessions:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取 Session 列表失败"),
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import {
  createApiSuccess,
  createApiError,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getConversationService } from "@/lib/conversation";
import { ConversationDomainError } from "@/lib/conversation/domain";

export async function GET(
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

    const messages = getConversationService()
      .get(payload.userId, sessionId)
      .messages;
    return NextResponse.json(createApiSuccess(messages));
  } catch (error) {
    if (error instanceof ConversationDomainError) {
      const status = error.code === "CONVERSATION_FORBIDDEN" ? 403 : 404;
      return NextResponse.json(createApiError(status === 403 ? "FORBIDDEN" : "SESSION_NOT_FOUND", error.message), { status });
    }
    console.error("Error reading session messages:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取消息历史失败"),
      { status: 500 },
    );
  }
}

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

    try {
      getConversationService().get(payload.userId, sessionId);
    } catch (error) {
      if (error instanceof ConversationDomainError) {
        const status = error.code === "CONVERSATION_FORBIDDEN" ? 403 : 404;
        return NextResponse.json(createApiError(status === 403 ? "FORBIDDEN" : "SESSION_NOT_FOUND", error.message), { status });
      }
      throw error;
    }
    return NextResponse.json(
      createApiError("INVALID_REQUEST", "整份消息快照写入已停用，请使用 Conversation Command API"),
      { status: 410 },
    );
  } catch (error) {
    console.error("Error saving session messages:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "保存消息历史失败"),
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { getCurrentUserFromRequest } from "@/lib/auth/current-user";
import { ConversationDomainError } from "./domain";

export async function requireConversationUser(request: Request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(createApiError("UNAUTHORIZED", "未登录或登录已过期"), { status: 401 }),
    };
  }
  return { ok: true as const, user };
}

export function conversationSuccess(data: unknown, status = 200) {
  return NextResponse.json(createApiSuccess(data), { status });
}

export function conversationError(error: unknown) {
  if (error instanceof ConversationDomainError) {
    const status =
      error.code === "CONVERSATION_NOT_FOUND"
        ? 404
        : error.code === "CONVERSATION_FORBIDDEN"
          ? 403
          : error.code === "CONVERSATION_CONFLICT"
            ? 409
            : error.code === "CONVERSATION_TOO_LARGE"
              ? 413
              : error.code === "CONVERSATION_INVALID"
                ? 400
                : 503;
    return NextResponse.json(
      { success: false as const, error: { code: error.code, message: error.message } },
      { status },
    );
  }
  console.error("Conversation API error:", error);
  return NextResponse.json({
    success: false as const,
    error: { code: "CONVERSATION_STORE_UNAVAILABLE", message: "对话账本暂时不可用" },
  }, { status: 503 });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ConversationDomainError("CONVERSATION_INVALID", "请求体必须是 JSON 对象");
  }
  return body as Record<string, unknown>;
}

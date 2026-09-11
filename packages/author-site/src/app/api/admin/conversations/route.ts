import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import {
  assertStableId,
  ConversationDomainError,
  getConversationService,
} from "@/lib/conversation";
import { createApiError, createApiSuccess } from "@/lib/api-helpers";

const NO_STORE = { "Cache-Control": "no-store" };

function parseDate(value: string | null, field: string): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ConversationDomainError("CONVERSATION_INVALID", `${field} 必须是 ISO 8601 时间`);
  }
  return timestamp;
}

function parseCursor(value: string | null): { updatedAt: number; id: string } | undefined {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    if (typeof decoded.updatedAt !== "number" || !Number.isFinite(decoded.updatedAt) || typeof decoded.id !== "string") {
      throw new Error("invalid cursor");
    }
    return { updatedAt: decoded.updatedAt, id: assertStableId(decoded.id, "cursor.id") };
  } catch {
    throw new ConversationDomainError("CONVERSATION_INVALID", "分页游标无效");
  }
}

export async function GET(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未授权访问"), {
      status: 401,
      headers: NO_STORE,
    });
  }
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const userId = url.searchParams.get("userId") || undefined;
    const from = parseDate(url.searchParams.get("from"), "from");
    const to = parseDate(url.searchParams.get("to"), "to");
    if (from !== undefined && to !== undefined && from >= to) {
      throw new ConversationDomainError("CONVERSATION_INVALID", "from 必须早于 to");
    }
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      throw new ConversationDomainError("CONVERSATION_INVALID", "limit 必须在 1 到 100 之间");
    }
    const result = getConversationService().listForAdmin({
      projectId: projectId ? assertStableId(projectId, "projectId") : undefined,
      userId: userId ? assertStableId(userId, "userId") : undefined,
      from,
      to,
      cursor: parseCursor(url.searchParams.get("cursor")),
      limit: requestedLimit,
    });
    return NextResponse.json(createApiSuccess({
      items: result.items,
      nextCursor: result.nextCursor
        ? Buffer.from(JSON.stringify(result.nextCursor), "utf8").toString("base64url")
        : null,
    }), { headers: NO_STORE });
  } catch (error) {
    const invalid = error instanceof ConversationDomainError && error.code === "CONVERSATION_INVALID";
    return NextResponse.json(createApiError(
      invalid ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
      error instanceof Error ? error.message : "对话列表不可用",
    ), { status: invalid ? 400 : 503, headers: NO_STORE });
  }
}

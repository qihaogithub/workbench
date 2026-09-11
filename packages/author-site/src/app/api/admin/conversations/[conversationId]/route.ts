import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { ConversationDomainError, getConversationService } from "@/lib/conversation";
import { createApiError, createApiSuccess } from "@/lib/api-helpers";

type Params = { params: Promise<{ conversationId: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: Params) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未授权访问"), {
      status: 401,
      headers: NO_STORE,
    });
  }
  try {
    const { conversationId } = await params;
    return NextResponse.json(
      createApiSuccess(getConversationService().getForAdmin(conversationId)),
      { headers: NO_STORE },
    );
  } catch (error) {
    const notFound = error instanceof ConversationDomainError && error.code === "CONVERSATION_NOT_FOUND";
    const invalid = error instanceof ConversationDomainError && error.code === "CONVERSATION_INVALID";
    return NextResponse.json(createApiError(
      notFound ? "NOT_FOUND" : invalid ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
      error instanceof Error ? error.message : "对话详情不可用",
    ), { status: notFound ? 404 : invalid ? 400 : 503, headers: NO_STORE });
  }
}

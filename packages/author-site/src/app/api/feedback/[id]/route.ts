import { NextRequest, NextResponse } from "next/server";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  getFeedbackItem,
  updateFeedbackStatus,
  deleteFeedback,
} from "@/lib/feedback-store";
import type { FeedbackStatus } from "@workbench/shared";

const VALID_STATUSES: FeedbackStatus[] = ["open", "in_progress", "done"];

async function resolveUser(request: NextRequest) {
  const cookieToken = getAuthCookie();
  if (cookieToken) {
    const payload = await verifyToken(cookieToken);
    if (payload) return payload;
  }
  const headerToken = request.headers.get("x-auth-token");
  if (headerToken) {
    const payload = await verifyToken(headerToken);
    if (payload) return payload;
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", `无效的状态: ${status}，有效值: ${VALID_STATUSES.join(", ")}`),
        { status: 400 },
      );
    }

    const item = getFeedbackItem(id);
    if (!item) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "反馈不存在"), { status: 404 });
    }

    const actor = {
      id: user.userId,
      name: user.username,
      isAnonymous: false,
    };
    const updated = updateFeedbackStatus(id, status, actor);
    if (!updated) {
      return NextResponse.json(createApiError("INTERNAL_ERROR", "更新失败"), { status: 500 });
    }

    return NextResponse.json(createApiSuccess(updated));
  } catch {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "请求格式错误"), { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await resolveUser(request);
  if (!user) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }

  const { id } = await params;

  const deleted = deleteFeedback(id);
  if (!deleted) {
    return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "反馈不存在"), { status: 404 });
  }

  return NextResponse.json(createApiSuccess({ deleted: true }));
}

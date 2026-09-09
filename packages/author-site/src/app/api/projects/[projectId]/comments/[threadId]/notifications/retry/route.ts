import { NextRequest, NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { getCommentThread } from "@/lib/comment-store";
import { resolveCommentAuthor } from "@/lib/comment-auth";
import { retryCommentNotifications, deliverySummary } from "@/lib/dingtalk-comment-notifications";
type Params = { params: Promise<{ projectId: string; threadId: string }> };
export async function POST(request: NextRequest, { params }: Params) {
  const { projectId, threadId } = await params;
  const thread = getCommentThread(projectId, threadId);
  if (!thread) return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "评论不存在"), { status: 404 });
  const author = await resolveCommentAuthor(request, {});
  if (!author?.userId || author.authSource !== "cookie") return NextResponse.json(createApiError("FORBIDDEN", "仅登录创作者可重试"), { status: 403 });
  const body = await request.json().catch(() => ({})) as { replyId?: string };
  const replyId = typeof body.replyId === "string" && body.replyId ? body.replyId : undefined;
  if (replyId && !thread.replies.some((reply) => reply.id === replyId)) return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "回复不存在"), { status: 404 });
  await retryCommentNotifications(projectId, threadId, replyId);
  return NextResponse.json(createApiSuccess({ dingtalkDelivery: deliverySummary(projectId, threadId, replyId) }));
}

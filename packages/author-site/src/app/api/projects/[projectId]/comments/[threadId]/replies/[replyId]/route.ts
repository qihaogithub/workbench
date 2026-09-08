import { NextRequest, NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { getCommentThread, deleteReply, updateReply } from "@/lib/comment-store";
import type { CommentMention } from "@workbench/shared";
import { resolveCommentAuthor, canEditOrDeleteComment } from "@/lib/comment-auth";

type RouteParams = {
  params: Promise<{ projectId: string; threadId: string; replyId: string }>;
};

interface PatchBody {
  content?: string;
  mentions?: CommentMention[];
  anonymousId?: string;
  displayName?: string;
}

/** PATCH /api/projects/[projectId]/comments/[threadId]/replies/[replyId] */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { projectId, threadId, replyId } = await params;
  try {
    const body = (await request.json()) as PatchBody;
    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "回复内容不能为空"), { status: 400 });
    }
    const thread = getCommentThread(projectId, threadId);
    const reply = thread?.replies.find((candidate) => candidate.id === replyId);
    if (!reply) return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "回复不存在"), { status: 404 });
    const authorResult = await resolveCommentAuthor(request, body);
    if (!authorResult) return NextResponse.json(createApiError("VALIDATION_ERROR", "未登录用户需提供 anonymousId"), { status: 400 });
    if (!canEditOrDeleteComment(authorResult, reply.author.id)) return NextResponse.json(createApiError("FORBIDDEN", "无权修改此回复"), { status: 403 });
    const mentions = Array.isArray(body.mentions) ? body.mentions : [];
    if (authorResult.author.isAnonymous && mentions.some((mention) => mention.type === "user")) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "匿名用户不能 @其他用户"), { status: 400 });
    }
    const updated = await updateReply(projectId, threadId, replyId, {
      content: body.content.trim(),
      mentions,
      aiTaskAuthorization: authorResult.userId && authorResult.role
        ? { userId: authorResult.userId, role: authorResult.role, expiresAt: Date.now() + 2 * 60 * 60 * 1000 }
        : undefined,
    });
    return NextResponse.json(createApiSuccess({ reply: updated!.reply }));
  } catch (error) {
    console.error("更新回复失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "更新回复失败"), { status: 500 });
  }
}

interface DeleteBody {
  anonymousId?: string;
  displayName?: string;
}

/**
 * DELETE /api/projects/[projectId]/comments/[threadId]/replies/[replyId]
 * 删除回复（仅回复发送者本人）
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { projectId, threadId, replyId } = await params;
  try {
    const thread = getCommentThread(projectId, threadId);
    if (!thread) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "评论不存在"), {
        status: 404,
      });
    }

    const reply = thread.replies.find((r) => r.id === replyId);
    if (!reply) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "回复不存在"), {
        status: 404,
      });
    }

    // DELETE 可能没有 body，尝试解析
    let body: DeleteBody = {};
    try {
      body = (await request.json()) as DeleteBody;
    } catch {
      // 无 body 也可以（已登录用户通过 token 鉴权）
    }

    const authorResult = await resolveCommentAuthor(request, body);
    if (!authorResult) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "未登录用户需提供 anonymousId"),
        { status: 400 },
      );
    }

    if (!canEditOrDeleteComment(authorResult, reply.author.id)) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权删除此回复"), {
        status: 403,
      });
    }

    await deleteReply(projectId, threadId, replyId);
    return NextResponse.json(createApiSuccess({ deleted: true }));
  } catch (error) {
    console.error("删除回复失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "删除回复失败"), {
      status: 500,
    });
  }
}

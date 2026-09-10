import { NextRequest, NextResponse } from "next/server";
import type { CommentAiTaskStatus, CommentMention } from "@workbench/shared";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import {
  getCommentThread,
  updateCommentThread,
  deleteCommentThread,
} from "@/lib/comment-store";
import { resolveCommentAuthor, canModify, canEditOrDeleteComment } from "@/lib/comment-auth";
import { normalizeCommentMentions, registerCommentParticipant } from "@/lib/comment-participants";
import { anonymousIpDigest } from "@/lib/dingtalk-comment-notifications";

type RouteParams = { params: Promise<{ projectId: string; threadId: string }> };

interface PatchBody {
  resolved?: boolean;
  content?: string;
  mentions?: CommentMention[];
  aiTaskStatus?: CommentAiTaskStatus;
  anonymousId?: string;
  displayName?: string;
}

/**
 * PATCH /api/projects/[projectId]/comments/[threadId]
 * resolve/reopen/编辑评论内容
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { projectId, threadId } = await params;
  try {
    const body = (await request.json()) as PatchBody;

    const thread = getCommentThread(projectId, threadId);
    if (!thread) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "评论不存在"), {
        status: 404,
      });
    }

    const authorResult = await resolveCommentAuthor(request, body);
    if (!authorResult) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "未登录用户需提供 anonymousId"),
        { status: 400 },
      );
    }

    const contentMutation = typeof body.content === "string" || body.mentions !== undefined;
    const canChange = contentMutation
      ? canEditOrDeleteComment(authorResult, thread.author.id)
      : canModify(authorResult, thread.author.id);
    if (!canChange) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权修改此评论"), {
        status: 403,
      });
    }

    const updates: { resolved?: boolean; content?: string; mentions?: CommentMention[]; aiTaskStatus?: CommentAiTaskStatus; aiTaskAuthorization?: { userId: string; role: "admin" | "editor"; expiresAt: number }; anonymousIpDigest?: string | null } = {};
    if (typeof body.resolved === "boolean") {
      updates.resolved = body.resolved;
    }
    if (typeof body.content === "string" && body.content.trim()) {
      const mentions = Array.isArray(body.mentions) ? body.mentions : [];
      if (authorResult.userId && authorResult.authSource === "cookie") registerCommentParticipant(projectId, authorResult.userId);
      try { updates.mentions = normalizeCommentMentions(projectId, mentions, authorResult.author.isAnonymous ? 5 : 20); }
      catch (error) { return NextResponse.json(createApiError("VALIDATION_ERROR", String(error).includes("TOO_MANY") ? "@人数超过限制" : "@对象无效"), { status: 400 }); }
      updates.content = body.content.trim();
      updates.anonymousIpDigest = authorResult.author.isAnonymous ? anonymousIpDigest(request) : undefined;
      if (authorResult.userId && authorResult.role) {
        updates.aiTaskAuthorization = {
          userId: authorResult.userId,
          role: authorResult.role,
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        };
      }
    }
    if (body.aiTaskStatus !== undefined) {
      updates.aiTaskStatus = body.aiTaskStatus;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "无有效更新字段"), {
        status: 400,
      });
    }

    const updated = await updateCommentThread(
      projectId,
      threadId,
      updates,
    );

    return NextResponse.json(createApiSuccess({ thread: updated }));
  } catch (error) {
    console.error("更新评论失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "更新评论失败"), {
      status: 500,
    });
  }
}

interface DeleteBody {
  anonymousId?: string;
  displayName?: string;
}

/**
 * DELETE /api/projects/[projectId]/comments/[threadId]
 * 删除评论线程（仅评论发送者本人）
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { projectId, threadId } = await params;
  try {
    const thread = getCommentThread(projectId, threadId);
    if (!thread) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "评论不存在"), {
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

    if (!canEditOrDeleteComment(authorResult, thread.author.id)) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权删除此评论"), {
        status: 403,
      });
    }

    await deleteCommentThread(projectId, threadId);
    return NextResponse.json(createApiSuccess({ deleted: true }));
  } catch (error) {
    console.error("删除评论失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "删除评论失败"), {
      status: 500,
    });
  }
}

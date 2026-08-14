import { NextRequest, NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { getCommentThread, retryAiTask } from "@/lib/comment-store";
import { resolveCommentAuthor, canModify } from "@/lib/comment-auth";

type RouteParams = { params: Promise<{ projectId: string; threadId: string }> };

/**
 * POST /api/projects/[projectId]/comments/[threadId]/retry-ai
 * @AI 任务失败后重试：将线程状态置回 pending 并重新入队。
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { projectId, threadId } = await params;
  try {
    let body: { anonymousId?: string; displayName?: string } = {};
    try {
      body = (await request.json()) as typeof body;
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

    const existing = getCommentThread(projectId, threadId);
    if (!existing) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "评论不存在"), {
        status: 404,
      });
    }
    if (!canModify(authorResult, existing.author.id)) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权重试此评论"), {
        status: 403,
      });
    }

    const thread = await retryAiTask(projectId, threadId);
    return NextResponse.json(createApiSuccess({ thread }));
  } catch (error) {
    console.error("重试评论 AI 任务失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "重试评论失败"), {
      status: 500,
    });
  }
}

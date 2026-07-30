import { NextRequest, NextResponse } from "next/server";
import type { CommentMention } from "@workbench/shared";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { createReply } from "@/lib/comment-store";
import { resolveCommentAuthor } from "@/lib/comment-auth";

type RouteParams = { params: { projectId: string; threadId: string } };

interface CreateReplyBody {
  content?: string;
  mentions?: CommentMention[];
  anonymousId?: string;
  displayName?: string;
}

/**
 * POST /api/projects/[projectId]/comments/[threadId]/replies
 * 添加回复（支持匿名）
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = (await request.json()) as CreateReplyBody;

    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "回复内容不能为空"), {
        status: 400,
      });
    }

    const authorResult = await resolveCommentAuthor(request, body);
    if (!authorResult) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "未登录用户需提供 anonymousId"),
        { status: 400 },
      );
    }

    // 匿名用户不能 @人
    const mentions = Array.isArray(body.mentions) ? body.mentions : undefined;
    if (authorResult.author.isAnonymous && mentions?.some((m) => m.type === "user")) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "匿名用户不能 @其他用户"),
        { status: 400 },
      );
    }

    const result = await createReply({
      projectId: params.projectId,
      threadId: params.threadId,
      content: body.content.trim(),
      author: authorResult.author,
      mentions,
    });

    if (!result) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "评论不存在"), {
        status: 404,
      });
    }

    return NextResponse.json(createApiSuccess({ reply: result.reply }), {
      status: 201,
    });
  } catch (error) {
    console.error("添加回复失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "添加回复失败"), {
      status: 500,
    });
  }
}

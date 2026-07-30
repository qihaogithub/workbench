import { NextRequest, NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { getCommentThread, deleteReply } from "@/lib/comment-store";
import { resolveCommentAuthor, canModify } from "@/lib/comment-auth";

type RouteParams = {
  params: { projectId: string; threadId: string; replyId: string };
};

interface DeleteBody {
  anonymousId?: string;
  displayName?: string;
}

/**
 * DELETE /api/projects/[projectId]/comments/[threadId]/replies/[replyId]
 * 删除回复（作者本人或管理员）
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const thread = getCommentThread(params.projectId, params.threadId);
    if (!thread) {
      return NextResponse.json(createApiError("COMMENT_NOT_FOUND", "评论不存在"), {
        status: 404,
      });
    }

    const reply = thread.replies.find((r) => r.id === params.replyId);
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

    if (!canModify(authorResult, reply.author.id)) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权删除此回复"), {
        status: 403,
      });
    }

    await deleteReply(params.projectId, params.threadId, params.replyId);
    return NextResponse.json(createApiSuccess({ deleted: true }));
  } catch (error) {
    console.error("删除回复失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "删除回复失败"), {
      status: 500,
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import type { CommentAnchor, CommentMention } from "@workbench/shared";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { listComments, createCommentThread } from "@/lib/comment-store";
import { resolveCommentAuthor } from "@/lib/comment-auth";

/**
 * GET /api/projects/[projectId]/comments?pageId=&resolved=
 * 列出评论（公开接口）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const { searchParams } = request.nextUrl;
    const pageId = searchParams.get("pageId") || undefined;
    const resolvedParam = searchParams.get("resolved");
    const resolved =
      resolvedParam === "true" ? true : resolvedParam === "false" ? false : undefined;

    const threads = listComments(params.projectId, { pageId, resolved });
    return NextResponse.json(createApiSuccess({ threads }));
  } catch (error) {
    console.error("获取评论列表失败:", error);
    return NextResponse.json(createApiError("FILE_READ_ERROR", "获取评论列表失败"), {
      status: 500,
    });
  }
}

interface CreateCommentBody {
  pageId?: string;
  anchor?: CommentAnchor;
  pin?: { xRatio: number; yRatio: number };
  content?: string;
  mentions?: CommentMention[];
  anonymousId?: string;
  displayName?: string;
}

/**
 * POST /api/projects/[projectId]/comments
 * 创建评论线程（支持匿名）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const body = (await request.json()) as CreateCommentBody;

    // 参数校验
    if (!body.pageId || typeof body.pageId !== "string") {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "pageId 必填"), {
        status: 400,
      });
    }
    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "评论内容不能为空"), {
        status: 400,
      });
    }
    if (
      !body.anchor ||
      typeof body.anchor.domPath !== "string" ||
      typeof body.anchor.tagName !== "string"
    ) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "anchor（domPath + tagName）必填"),
        { status: 400 },
      );
    }
    if (
      !body.pin ||
      typeof body.pin.xRatio !== "number" ||
      typeof body.pin.yRatio !== "number"
    ) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "pin（xRatio + yRatio）必填"),
        { status: 400 },
      );
    }

    // 身份解析
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

    const thread = await createCommentThread({
      projectId: params.projectId,
      pageId: body.pageId,
      anchor: body.anchor,
      pin: body.pin,
      content: body.content.trim(),
      author: authorResult.author,
      mentions,
    });

    return NextResponse.json(createApiSuccess({ thread }), { status: 201 });
  } catch (error) {
    console.error("创建评论失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "创建评论失败"), {
      status: 500,
    });
  }
}

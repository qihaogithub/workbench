import { NextRequest, NextResponse } from "next/server";
import type { CommentAnchor, CommentMention, CommentTarget, DocumentCommentAnchor } from "@workbench/shared";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { listComments, createCommentThread } from "@/lib/comment-store";
import { resolveCommentAuthor } from "@/lib/comment-auth";
import { registerCommentParticipant, normalizeCommentMentions } from "@/lib/comment-participants";
import { anonymousIpDigest } from "@/lib/dingtalk-comment-notifications";

/**
 * GET /api/projects/[projectId]/comments?pageId=&resolved=
 *   | configScope=project|page&fieldKey=&pageId=&resolved=
 * 列出评论（公开接口）。配置项查询使用显式 scope/fieldKey 条件。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  try {
    const { searchParams } = request.nextUrl;
    const pageId = searchParams.get("pageId") || undefined;
    const resourceId = searchParams.get("resourceId") || undefined;
    const configScopeParam = searchParams.get("configScope");
    const configScope = configScopeParam === "project" || configScopeParam === "page"
      ? configScopeParam
      : undefined;
    const fieldKey = searchParams.get("fieldKey") || undefined;
    if (configScopeParam && !configScope) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "configScope 必须为 project 或 page"), { status: 400 });
    }
    if (configScope && resourceId) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "配置评论不能包含 resourceId"), { status: 400 });
    }
    if (configScope === "project" && pageId) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "项目级配置评论不能包含 pageId"), { status: 400 });
    }
    if (configScope === "page" && !pageId) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "页面级配置评论需要 pageId"), { status: 400 });
    }
    if (fieldKey && !configScope) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "fieldKey 需要 configScope"), { status: 400 });
    }
    if (configScope && (!fieldKey || !fieldKey.trim())) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "配置评论需要 fieldKey"), { status: 400 });
    }
    const resolvedParam = searchParams.get("resolved");
    const resolved =
      resolvedParam === "true" ? true : resolvedParam === "false" ? false : undefined;

    const threads = listComments(projectId, { pageId, resourceId, configScope, fieldKey, resolved });
    return NextResponse.json(createApiSuccess({ threads }));
  } catch (error) {
    console.error("获取评论列表失败:", error);
    return NextResponse.json(createApiError("FILE_READ_ERROR", "获取评论列表失败"), {
      status: 500,
    });
  }
}

interface CreateCommentBody {
  target?: CommentTarget;
  anchor?: CommentAnchor;
  pin?: { xRatio: number; yRatio: number };
  documentAnchor?: DocumentCommentAnchor;
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
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  try {
    const body = (await request.json()) as CreateCommentBody;

    // 参数校验
    if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "评论内容不能为空"), {
        status: 400,
      });
    }
    if (!body.target || !["page", "document", "config"].includes(body.target.kind)) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "target 必填"), { status: 400 });
    }
    if (body.target.kind === "page") {
      if (!body.target.pageId || !body.anchor?.domPath || !body.anchor.tagName || !body.pin || typeof body.pin.xRatio !== "number" || typeof body.pin.yRatio !== "number") {
        return NextResponse.json(createApiError("VALIDATION_ERROR", "页面评论需要 pageId、anchor 与 pin"), { status: 400 });
      }
    } else if (body.target.kind === "document" && (!body.target.resourceId || !body.target.resourceLabel || !body.documentAnchor || !["document", "selection"].includes(body.documentAnchor.kind))) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "文档评论需要资源与文档锚点"), { status: 400 });
    } else if (body.target.kind === "config") {
      const target = body.target;
      const validPageTarget = target.scope === "page"
        && typeof target.pageId === "string"
        && target.pageId.trim().length > 0;
      const validProjectTarget = target.scope === "project"
        && target.pageId === undefined;
      if (
        (!validPageTarget && !validProjectTarget) ||
        typeof target.fieldKey !== "string" ||
        !target.fieldKey.trim() ||
        (target.fieldTitleSnapshot !== undefined &&
          typeof target.fieldTitleSnapshot !== "string") ||
        body.anchor ||
        body.pin ||
        body.documentAnchor
      ) {
        return NextResponse.json(createApiError("VALIDATION_ERROR", "配置评论需要合法的 scope、fieldKey，且不能包含锚点"), { status: 400 });
      }
    }

    // 身份解析
    const authorResult = await resolveCommentAuthor(request, body);
    if (!authorResult) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "未登录用户需提供 anonymousId"),
        { status: 400 },
      );
    }

    const mentions = Array.isArray(body.mentions) ? body.mentions : undefined;
    if (authorResult.userId && authorResult.authSource === "cookie") registerCommentParticipant(projectId, authorResult.userId);
    let normalizedMentions: CommentMention[] | undefined;
    try { normalizedMentions = normalizeCommentMentions(projectId, mentions, authorResult.author.isAnonymous ? 5 : 20); }
    catch (error) { return NextResponse.json(createApiError("VALIDATION_ERROR", String(error).includes("TOO_MANY") ? "@人数超过限制" : "@对象无效"), { status: 400 }); }

    const thread = await createCommentThread({
      projectId,
      target: body.target,
      anchor: body.anchor,
      pin: body.pin,
      documentAnchor: body.documentAnchor,
      content: body.content.trim(),
      author: authorResult.author,
      mentions: normalizedMentions,
      aiTaskAuthorization: authorResult.userId && authorResult.role
        ? { userId: authorResult.userId, role: authorResult.role, expiresAt: Date.now() + 2 * 60 * 60 * 1000 }
        : undefined,
      anonymousIpDigest: authorResult.author.isAnonymous ? anonymousIpDigest(request) : undefined,
    });

    return NextResponse.json(createApiSuccess({ thread }), { status: 201 });
  } catch (error) {
    console.error("创建评论失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "创建评论失败"), {
      status: 500,
    });
  }
}

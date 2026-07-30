import { NextRequest, NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { recordVisit } from "@/lib/visitors-store";
import { resolveUser } from "@/lib/comment-auth";

/**
 * POST /api/projects/[projectId]/visit
 * 记录已登录用户访问（更新 visitors.json，用于 @候选人列表）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "仅已登录用户可记录访问"), {
        status: 401,
      });
    }

    const visitor = recordVisit(params.projectId, user.userId, user.username);
    return NextResponse.json(createApiSuccess({ visitor }));
  } catch (error) {
    console.error("记录访问失败:", error);
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "记录访问失败"), {
      status: 500,
    });
  }
}

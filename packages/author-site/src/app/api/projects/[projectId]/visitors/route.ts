import { NextRequest, NextResponse } from "next/server";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { listVisitors } from "@/lib/visitors-store";

/**
 * GET /api/projects/[projectId]/visitors
 * 获取访问者列表（@候选人，按最近浏览时间降序，公开接口）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const visitors = listVisitors(params.projectId);
    return NextResponse.json(createApiSuccess({ visitors }));
  } catch (error) {
    console.error("获取访问者列表失败:", error);
    return NextResponse.json(createApiError("FILE_READ_ERROR", "获取访问者列表失败"), {
      status: 500,
    });
  }
}

import { NextResponse } from "next/server";

import { createApiError } from "@/lib/fs-utils";
import { getCurrentProjectActor } from "@/lib/auth/current-user";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";

/** Update one or more page template markers from the editor project settings. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getCurrentProjectActor();
    if (!actor) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    }
    if (actor.role !== "admin") {
      return NextResponse.json(createApiError("FORBIDDEN", "只有管理员可以管理模板页面"), { status: 403 });
    }
    const body = await request.json().catch(() => null) as {
      pageIds?: unknown;
      isTemplatePage?: unknown;
    } | null;
    if (
      !Array.isArray(body?.pageIds) ||
      body.pageIds.length === 0 ||
      body.pageIds.some((pageId) => typeof pageId !== "string" || !pageId.trim())
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "pageIds 必须是非空字符串数组"),
        { status: 400 },
      );
    }
    if (typeof body.isTemplatePage !== "boolean") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "isTemplatePage 必须是布尔值"),
        { status: 400 },
      );
    }
    const { id } = await params;
    return projectAdminResponse(getProjectAdminService().updatePageTemplates({
      projectId: id,
      pageIds: body.pageIds as string[],
      isTemplatePage: body.isTemplatePage,
    }, actor));
  } catch (error) {
    console.error("Error updating template page settings:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新模板页设置失败"),
      { status: 500 },
    );
  }
}

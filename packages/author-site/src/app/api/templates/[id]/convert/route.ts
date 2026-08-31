import { NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
import { reconcileTemplateKnowledge } from "@/lib/knowledge-service";
import { getCurrentProjectActor } from "@/lib/auth/current-user";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getCurrentProjectActor();
    if (!actor) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    const { id } = await params;
    const result = getProjectAdminService().convertTemplateToProject(id, actor);
    if (!result.ok) return projectAdminResponse(result);
    await reconcileTemplateKnowledge();

    return NextResponse.json(createApiSuccess(result.data));
  } catch (error) {
    console.error("Error converting template to project:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "模板转为普通项目失败"),
      { status: 500 },
    );
  }
}

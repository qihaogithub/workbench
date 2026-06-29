import { NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const result = getProjectAdminService().convertTemplateToProject(params.id);
    if (!result.ok) return projectAdminResponse(result);

    return NextResponse.json(createApiSuccess(result.data));
  } catch (error) {
    console.error("Error converting template to project:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "模板转为普通项目失败"),
      { status: 500 },
    );
  }
}

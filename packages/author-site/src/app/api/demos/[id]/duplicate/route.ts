import { NextRequest, NextResponse } from "next/server";
import { createApiError } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const { name, category } = body as {
      name?: unknown;
      category?: unknown;
    };

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "name 参数必填且不能为空"),
        { status: 400 },
      );
    }

    if (category !== undefined && typeof category !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "category 参数必须是字符串"),
        { status: 400 },
      );
    }

    const result = getProjectAdminService().duplicateProject(
      params.id,
      name,
      category,
    );

    return projectAdminResponse(result, 201);
  } catch (error) {
    console.error("Error duplicating project:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "复制项目失败"),
      { status: 500 },
    );
  }
}

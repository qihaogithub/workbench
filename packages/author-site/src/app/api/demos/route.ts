import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";

export async function GET() {
  try {
    const result = getProjectAdminService().listProjects();
    if (!result.ok) return projectAdminResponse(result);
    const projects = result.data ?? [];
    return NextResponse.json(createApiSuccess(projects));
  } catch (error) {
    console.error("Error listing projects:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取项目列表失败"),
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, templateId } = body as {
      name?: unknown;
      category?: unknown;
      templateId?: unknown;
    };

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "name 参数必填"),
        { status: 400 },
      );
    }

    if (templateId !== undefined && typeof templateId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "templateId 参数必须是字符串"),
        { status: 400 },
      );
    }

    if (category !== undefined && typeof category !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "category 参数必须是字符串"),
        { status: 400 },
      );
    }

    const result = getProjectAdminService().createProject({
      name,
      category,
      templateId,
    });
    return projectAdminResponse(result, 201);
  } catch (error) {
    console.error("Error creating project:", error);
    if (error instanceof Error && error.message === "TEMPLATE_NOT_FOUND") {
      return NextResponse.json(
        createApiError("PROJECT_NOT_FOUND", "模板不存在"),
        { status: 404 },
      );
    }

    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建项目失败"),
      { status: 500 },
    );
  }
}

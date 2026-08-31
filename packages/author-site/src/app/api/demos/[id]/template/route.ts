import { NextRequest, NextResponse } from "next/server";
import { createApiError } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
import { reconcileTemplateKnowledge } from "@/lib/knowledge-service";
import { getCurrentProjectActor } from "@/lib/auth/current-user";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getCurrentProjectActor();
    if (!actor) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const { category, name, description } = body as {
      category?: unknown;
      name?: unknown;
      description?: unknown;
    };

    if (
      typeof category !== "string" ||
      typeof name !== "string" ||
      typeof description !== "string" ||
      !category.trim() ||
      !name.trim() ||
      !description.trim()
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "分类、名称和简介均为必填"),
        { status: 400 },
      );
    }

    const result = getProjectAdminService().createTemplateFromProject(id, {
      category,
      name,
      description,
    }, actor);
    if (result.ok) await reconcileTemplateKnowledge();

    return projectAdminResponse(result, 201);
  } catch (error) {
    console.error("Error saving project as template:", error);
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return NextResponse.json(
        createApiError("PROJECT_NOT_FOUND", "项目不存在"),
        { status: 404 },
      );
    }

    if (error instanceof Error && error.message === "INVALID_REQUEST") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "分类、名称和简介均为必填"),
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message === "FILE_READ_ERROR") {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "项目工作区不存在或不可访问"),
        { status: 500 },
      );
    }

    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "保存模板失败"),
      { status: 500 },
    );
  }
}

/** Update this project's template identity from the editor project settings. */
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
      return NextResponse.json(createApiError("FORBIDDEN", "只有管理员可以管理模板项目"), { status: 403 });
    }
    const body = await request.json().catch(() => null) as { isTemplate?: unknown } | null;
    if (typeof body?.isTemplate !== "boolean") {
      return NextResponse.json(createApiError("INVALID_REQUEST", "isTemplate 必须是布尔值"), { status: 400 });
    }
    const { id } = await params;
    return projectAdminResponse(getProjectAdminService().updateProject({
      projectId: id,
      projectType: body.isTemplate ? "template" : "standard",
    }, actor));
  } catch (error) {
    console.error("Error updating project template setting:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新模板设置失败"),
      { status: 500 },
    );
  }
}

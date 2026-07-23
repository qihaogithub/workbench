import { NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
import { reconcileTemplateKnowledge } from "@/lib/knowledge-service";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const { name, category } = body as {
      name?: unknown;
      category?: unknown;
    };

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "name 参数必填且不能为空"),
        { status: 400 },
      );
    }

    if (
      category !== undefined &&
      (typeof category !== "string" || !category.trim())
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "category 参数必须是非空字符串"),
        { status: 400 },
      );
    }

    if (name === undefined && category === undefined) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "name 或 category 至少提供一项"),
        { status: 400 },
      );
    }

    const result = getProjectAdminService().updateTemplateMeta(params.id, {
      name: typeof name === "string" ? name.trim() : undefined,
      category: typeof category === "string" ? category.trim() : undefined,
    });
    if (!result.ok) return projectAdminResponse(result);
    await reconcileTemplateKnowledge();

    return NextResponse.json(createApiSuccess(result.data));
  } catch (error) {
    console.error("Error updating template:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新模板失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const service = getProjectAdminService();
    const preview = service.deleteTemplatePreview(params.id);
    if (!preview.ok || !preview.data) return projectAdminResponse(preview);

    const result = service.deleteTemplateExecute(
      preview.data.planId,
      preview.data.confirmToken,
    );
    if (!result.ok) return projectAdminResponse(result);
    await reconcileTemplateKnowledge();

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error deleting template:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除模板失败"),
      { status: 500 },
    );
  }
}

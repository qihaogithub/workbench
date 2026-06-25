import { NextRequest, NextResponse } from "next/server";
import {
  createApiError,
  createApiSuccess,
  saveProjectAsTemplate,
} from "@/lib/fs-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
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

    const template = saveProjectAsTemplate(params.id, {
      category,
      name,
      description,
    });

    return NextResponse.json(createApiSuccess(template), { status: 201 });
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

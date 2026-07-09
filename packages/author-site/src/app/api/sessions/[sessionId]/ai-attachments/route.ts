import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { saveAiAttachment } from "@/lib/ai-attachments";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(createApiError("INVALID_REQUEST", "请提供文件"), {
        status: 400,
      });
    }

    const attachment = await saveAiAttachment(params.sessionId, file);
    return NextResponse.json(createApiSuccess(attachment));
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status) || 500
        : 500;
    const rawCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "UPLOAD_FAILED";
    const code =
      rawCode === "INVALID_FILE_TYPE" ||
      rawCode === "FILE_TOO_LARGE" ||
      rawCode === "INVALID_REQUEST"
        ? rawCode
        : "UPLOAD_FAILED";
    const message =
      error instanceof Error ? error.message : "文件上传失败";
    return NextResponse.json(createApiError(code, message), { status });
  }
}

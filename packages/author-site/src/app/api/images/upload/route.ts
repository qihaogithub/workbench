import { NextRequest, NextResponse } from "next/server";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError } from "@/lib/fs-utils";
import { uploadImage } from "@/lib/image-store";

export async function POST(request: NextRequest) {
  const token = getAuthCookie();
  if (!token) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });
  }

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          createApiError("INVALID_REQUEST", "缺少 file 字段"),
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const projectId = (formData.get("projectId") as string) || undefined;

      const result = await uploadImage({
        buffer,
        filename: file.name,
        sourceType: "user_upload",
        projectId,
        createdBy: payload.userId,
      });

      if (!result.success) {
        if (result.error.code === "ASSET_TOO_LARGE") {
          return NextResponse.json(createApiError("FILE_TOO_LARGE", result.error.message), { status: 413 });
        }
        return NextResponse.json(createApiError("INVALID_FILE_TYPE", result.error.message), { status: 415 });
      }

      return NextResponse.json({ success: true, data: result });
    }

    const body = await request.json();
    const { data, filename, projectId } = body;

    if (!data || !filename) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "缺少 data 或 filename 字段"),
        { status: 400 },
      );
    }

    const buffer = Buffer.from(data, "base64");

    const result = await uploadImage({
      buffer,
      filename,
      sourceType: "user_upload",
      projectId,
      createdBy: payload.userId,
    });

    if (!result.success) {
      if (result.error.code === "ASSET_TOO_LARGE") {
        return NextResponse.json(createApiError("FILE_TOO_LARGE", result.error.message), { status: 413 });
      }
      return NextResponse.json(createApiError("INVALID_FILE_TYPE", result.error.message), { status: 415 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch {
    return NextResponse.json(
      createApiError("UPLOAD_FAILED", "上传失败"),
      { status: 500 },
    );
  }
}

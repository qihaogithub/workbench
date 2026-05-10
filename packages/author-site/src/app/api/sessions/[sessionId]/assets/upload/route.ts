import { NextResponse } from "next/server";
import {
  sessionExists,
  createApiSuccess,
  createApiError,
  generateAssetFilename,
  saveSessionAsset,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB

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

    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(
        createApiError("SESSION_NOT_FOUND"),
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "请提供文件"),
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        createApiError("INVALID_FILE_TYPE", `不支持的文件类型: ${file.type}`),
        { status: 400 },
      );
    }

    if (file.size > DEFAULT_MAX_SIZE) {
      return NextResponse.json(
        createApiError("FILE_TOO_LARGE", `文件大小超过 ${DEFAULT_MAX_SIZE / 1024 / 1024}MB 限制`),
        { status: 413 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = generateAssetFilename(file.name);

    const result = saveSessionAsset(sessionId, filename, buffer);

    if (!result.success) {
      return NextResponse.json(
        createApiError("UPLOAD_FAILED", result.error),
        { status: 500 },
      );
    }

    return NextResponse.json(
      createApiSuccess({
        url: result.url,
        filename,
        size: file.size,
        mimeType: file.type,
      }),
    );
  } catch (error) {
    console.error("Error uploading asset:", error);
    return NextResponse.json(
      createApiError("UPLOAD_FAILED", "文件上传失败"),
      { status: 500 },
    );
  }
}

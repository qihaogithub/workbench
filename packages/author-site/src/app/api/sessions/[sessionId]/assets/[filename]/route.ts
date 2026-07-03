import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  sessionExists,
  getSessionAssetPath,
  deleteSessionAsset,
  createApiSuccess,
  createApiError,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string; filename: string } },
) {
  try {
    const { sessionId, filename } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(
        createApiError("SESSION_NOT_FOUND"),
        { status: 404 },
      );
    }

    const filePath = getSessionAssetPath(sessionId, filename);
    if (!filePath) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "文件不存在"),
        { status: 404 },
      );
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".svga": "application/octet-stream",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Error getting asset:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取文件失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { sessionId: string; filename: string } },
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

    const { sessionId, filename } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(
        createApiError("SESSION_NOT_FOUND"),
        { status: 404 },
      );
    }

    const success = deleteSessionAsset(sessionId, filename);

    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "删除文件失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error deleting asset:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除文件失败"),
      { status: 500 },
    );
  }
}

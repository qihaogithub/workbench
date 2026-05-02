import { NextResponse } from "next/server";
import {
  createApiSuccess,
  createApiError,
  getSessionPath,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import fs from "fs";
import path from "path";

export async function PATCH(
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
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const updates = await request.json();
    const sessionPath = getSessionPath(sessionId);
    const metaPath = path.join(sessionPath, ".session.json");

    if (!fs.existsSync(metaPath)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

    const allowedFields = ["title", "opencodeSessionId", "status"];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        meta[field] = updates[field];
      }
    }

    if (updates.status === "editing") {
      meta.expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    }

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    return NextResponse.json(createApiSuccess(meta));
  } catch (error) {
    console.error("Error updating session meta:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新 Session 元数据失败"),
      { status: 500 },
    );
  }
}

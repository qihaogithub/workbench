import { NextResponse } from "next/server";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { findUserById } from "@/lib/user";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export async function GET() {
  const token = getAuthCookie();
  if (!token) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "未登录"), {
      status: 401,
    });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "登录已过期"), {
      status: 401,
    });
  }

  const user = findUserById(payload.userId);
  if (!user) {
    return NextResponse.json(createApiError("DEMO_NOT_FOUND", "用户不存在"), {
      status: 404,
    });
  }

  return NextResponse.json(
    createApiSuccess({
      id: user.id,
      username: user.username,
    }),
  );
}

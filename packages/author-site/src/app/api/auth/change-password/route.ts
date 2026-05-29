import { NextResponse } from "next/server";
import { verifyToken, clearAuthCookie } from "@/lib/auth/jwt";
import { updateUserPassword, logPasswordReset } from "@/lib/user";
import { validatePassword } from "@/lib/auth/password";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const token = cookies().get("auth_token")?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }

  const { newPassword } = await request.json();

  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return NextResponse.json(
      createApiError("VALIDATION_ERROR", validation.error),
      { status: 400 },
    );
  }

  const updated = await updateUserPassword(user.userId, newPassword);
  if (!updated) {
    return NextResponse.json(createApiError("INTERNAL_ERROR", "密码更新失败"), {
      status: 500,
    });
  }

  logPasswordReset(user.userId, user.username, "self_change");

  // 清除当前 session，要求重新登录
  clearAuthCookie();

  return NextResponse.json(
    createApiSuccess({ message: "密码修改成功，请重新登录" }),
  );
}

import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { findUserById, updateUserPassword, logPasswordReset } from "@/lib/user";
import { validatePassword } from "@/lib/auth/password";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";

export async function POST(
  request: Request,
  { params }: { params: { userId: string } },
) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未授权访问"), {
      status: 401,
    });
  }

  const { userId } = params;
  const user = findUserById(userId);
  if (!user) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "用户不存在"), {
      status: 404,
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

  const updated = await updateUserPassword(userId, newPassword);
  if (!updated) {
    return NextResponse.json(createApiError("INTERNAL_ERROR", "密码更新失败"), {
      status: 500,
    });
  }

  logPasswordReset(userId, "admin", "admin_reset");

  return NextResponse.json(
    createApiSuccess({
      userId: user.id,
      username: user.username,
      message: "密码重置成功",
    }),
  );
}

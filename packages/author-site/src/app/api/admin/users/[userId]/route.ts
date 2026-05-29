import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { findUserById, deleteUser } from "@/lib/user";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";

export async function DELETE(
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

  const deleted = deleteUser(userId);
  if (!deleted) {
    return NextResponse.json(createApiError("INTERNAL_ERROR", "删除失败"), {
      status: 500,
    });
  }

  return NextResponse.json(
    createApiSuccess({
      userId: user.id,
      username: user.username,
      message: "用户已删除",
    }),
  );
}

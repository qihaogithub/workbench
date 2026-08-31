import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { findUserById, deleteUser, updateUserRole, type UserRole } from "@/lib/user";
import { getCurrentUserFromRequest, isAdminUser } from "@/lib/auth/current-user";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未授权访问"), {
      status: 401,
    });
  }

  const { userId } = await params;
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

/** 修改用户角色：ADMIN_SECRET 仍可作为后台入口，但请求本身必须具备管理员权限。 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const secretAuthorized = await verifyAdminRequest(request);
  const currentUser = secretAuthorized ? null : await getCurrentUserFromRequest(request);
  if (!secretAuthorized && !isAdminUser(currentUser)) {
    return NextResponse.json(createApiError("FORBIDDEN", "仅管理员可以修改用户角色"), {
      status: 403,
    });
  }

  const { userId } = await params;
  const user = findUserById(userId);
  if (!user) {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "用户不存在"), { status: 404 });
  }
  const body = await request.json().catch(() => null) as { role?: unknown } | null;
  if (body?.role !== "admin" && body?.role !== "editor") {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "角色必须是 admin 或 editor"), {
      status: 400,
    });
  }
  const updated = updateUserRole(userId, body.role as UserRole);
  if (!updated) {
    return NextResponse.json(createApiError("INTERNAL_ERROR", "角色更新失败"), { status: 500 });
  }
  return NextResponse.json(createApiSuccess({ user: { ...user, role: body.role } }));
}

export const PUT = PATCH;

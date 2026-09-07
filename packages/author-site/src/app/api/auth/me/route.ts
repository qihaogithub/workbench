import { NextResponse } from "next/server";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { findDingtalkIdentityByUserId, findUserById } from "@/lib/user";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export async function GET() {
  const token = await getAuthCookie();
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

  // 钉钉登录创建的本地 username 是稳定的内部标识（例如 dt_xxx），
  // 对用户展示时优先使用钉钉返回的真实姓名；普通账号仍回退到 username。
  const dingtalkIdentity = findDingtalkIdentityByUserId(user.id);

  return NextResponse.json(
    createApiSuccess({
      id: user.id,
      username: user.username,
      displayName: dingtalkIdentity?.name || user.username,
      role: user.role,
    }),
  );
}

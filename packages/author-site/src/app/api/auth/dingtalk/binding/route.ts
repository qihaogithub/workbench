import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { readSafeDingtalkLoginConfig } from "@/lib/dingtalk-login";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { findDingtalkIdentityByUserId } from "@/lib/user";

export async function GET() {
  const token = getAuthCookie();
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }

  const identity = findDingtalkIdentityByUserId(payload.userId);
  return NextResponse.json(
    createApiSuccess({
      config: readSafeDingtalkLoginConfig(),
      binding: identity
        ? {
            corpId: identity.corpId,
            unionId: identity.unionId,
            userId: identity.dingtalkUserId,
            name: identity.name,
            avatar: identity.avatar,
            lastLoginAt: identity.lastLoginAt,
          }
        : null,
    }),
  );
}

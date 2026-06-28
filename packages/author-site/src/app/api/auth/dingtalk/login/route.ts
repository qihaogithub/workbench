import { NextRequest, NextResponse } from "next/server";

import { createToken, setAuthCookie } from "@/lib/auth/jwt";
import { exchangeDingtalkAuthCode } from "@/lib/dingtalk-login";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { findOrCreateUserByDingtalkIdentity } from "@/lib/user";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { authCode?: string; code?: string };
    const authCode = body.authCode || body.code;
    if (!authCode) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "DingTalk auth code is required"),
        { status: 400 },
      );
    }

    const profile = await exchangeDingtalkAuthCode(authCode);
    const { user, identity, created } = await findOrCreateUserByDingtalkIdentity({
      corpId: profile.corpId,
      unionId: profile.unionId,
      dingtalkUserId: profile.dingtalkUserId,
      name: profile.name,
      avatar: profile.avatar,
      raw: profile.raw,
    });

    const token = await createToken({
      userId: user.id,
      username: user.username,
    });
    setAuthCookie(token);

    return NextResponse.json(
      createApiSuccess({
        user: { id: user.id, username: user.username },
        dingtalk: {
          corpId: identity.corpId,
          unionId: identity.unionId,
          userId: identity.dingtalkUserId,
          name: identity.name,
          avatar: identity.avatar,
        },
        created,
      }),
    );
  } catch (error) {
    console.error("[DingTalk Login] Error:", error);
    return NextResponse.json(
      createApiError(
        "AGENT_SERVICE_ERROR",
        error instanceof Error ? error.message : "DingTalk login failed",
      ),
      { status: 500 },
    );
  }
}

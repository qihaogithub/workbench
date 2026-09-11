import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { createToken, setAuthCookieOnResponse } from "@/lib/auth/jwt";
import {
  resolveDingtalkLoginTargetOrigin,
  verifyDingtalkLoginHandoff,
} from "@/lib/dingtalk-login-handoff";
import { findOrCreateUserByDingtalkIdentity } from "@/lib/user";

const STATE_COOKIE = "dingtalk_oauth_state";
const LEGACY_REDIRECT_COOKIE = "dingtalk_oauth_redirect";

function addPrivateResponseHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function clearOAuthCookies(response: NextResponse): void {
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(LEGACY_REDIRECT_COOKIE);
}

function noncesMatch(expected: string | undefined, received: string): boolean {
  if (!expected) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function getRedirectOrigin(request: NextRequest, targetId?: string): string {
  const configuredTargetId =
    targetId || process.env.DINGTALK_LOGIN_TARGET_ID?.trim();
  if (configuredTargetId) {
    try {
      return resolveDingtalkLoginTargetOrigin(configuredTargetId);
    } catch {
      // Keep the existing request-origin fallback for incomplete deployments.
    }
  }
  return request.nextUrl.origin;
}

function redirectToLogin(
  request: NextRequest,
  message: string,
  redirectPath?: string,
  targetId?: string,
): NextResponse {
  const loginUrl = new URL("/login", getRedirectOrigin(request, targetId));
  loginUrl.searchParams.set("redirect", getSafeRedirectPath(redirectPath));
  loginUrl.searchParams.set("dingtalkError", message);
  const response = addPrivateResponseHeaders(NextResponse.redirect(loginUrl));
  clearOAuthCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  const handoffToken = request.nextUrl.searchParams.get("handoff");
  if (!handoffToken) {
    return redirectToLogin(request, "钉钉登录凭证缺失，请重新登录");
  }

  let redirectPath: string | undefined;
  let targetId: string | undefined;
  try {
    const handoff = await verifyDingtalkLoginHandoff(handoffToken);
    redirectPath = handoff.redirectPath;
    targetId = handoff.targetId;
    const configuredCorpId = process.env.DINGTALK_CORP_ID?.trim();
    if (!configuredCorpId || handoff.profile.corpId !== configuredCorpId) {
      throw new Error("DingTalk login handoff enterprise does not match");
    }

    const browserNonce = request.cookies.get(STATE_COOKIE)?.value;
    if (!noncesMatch(browserNonce, handoff.nonce)) {
      return redirectToLogin(
        request,
        "钉钉授权状态已失效，请重新登录",
        redirectPath,
        targetId,
      );
    }

    const { user } = await findOrCreateUserByDingtalkIdentity({
      corpId: handoff.profile.corpId,
      unionId: handoff.profile.unionId,
      dingtalkUserId: handoff.profile.dingtalkUserId,
      name: handoff.profile.name,
      avatar: handoff.profile.avatar,
      raw: undefined,
    });
    const token = await createToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const response = addPrivateResponseHeaders(
      NextResponse.redirect(
        new URL(
          getSafeRedirectPath(redirectPath),
          resolveDingtalkLoginTargetOrigin(targetId),
        ),
      ),
    );
    setAuthCookieOnResponse(response, token);
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error(
      "[DingTalk Login Handoff] Error:",
      error instanceof Error ? error.message : "unknown error",
    );
    return redirectToLogin(
      request,
      "钉钉登录凭证无效或已过期，请重新登录",
      redirectPath,
      targetId,
    );
  }
}

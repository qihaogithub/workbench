import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/redirect";
import {
  exchangeDingtalkBrowserAuthCode,
} from "@/lib/dingtalk-login";
import { createToken, setAuthCookieOnResponse } from "@/lib/auth/jwt";
import { findOrCreateUserByDingtalkIdentity } from "@/lib/user";

const STATE_COOKIE = "dingtalk_oauth_state";
const REDIRECT_COOKIE = "dingtalk_oauth_redirect";

function clearOAuthCookies(response: NextResponse): void {
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(REDIRECT_COOKIE);
}
function redirectToLogin(
  request: NextRequest,
  message: string,
  redirectPath?: string,
): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "redirect",
    getSafeRedirectPath(redirectPath),
  );
  loginUrl.searchParams.set("dingtalkError", message);
  const response = NextResponse.redirect(loginUrl);
  clearOAuthCookies(response);
  return response;
}

function statesMatch(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export async function GET(request: NextRequest) {
  const redirectPath = request.cookies.get(REDIRECT_COOKIE)?.value;
  const queryError = request.nextUrl.searchParams.get("error");
  if (queryError) {
    return redirectToLogin(request, "钉钉授权未完成，请重试", redirectPath);
  }

  const authCode =
    request.nextUrl.searchParams.get("authCode") ||
    request.nextUrl.searchParams.get("code");
  if (!authCode) {
    return redirectToLogin(request, "未获取到钉钉授权码，请重试", redirectPath);
  }

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const receivedState = request.nextUrl.searchParams.get("state");
  if (!statesMatch(expectedState, receivedState)) {
    return redirectToLogin(request, "钉钉授权状态已失效，请重新登录", redirectPath);
  }

  try {
    const profile = await exchangeDingtalkBrowserAuthCode(authCode);
    const { user } = await findOrCreateUserByDingtalkIdentity({
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
      ...(user.role ? { role: user.role } : {}),
    });

    const response = NextResponse.redirect(
      new URL(getSafeRedirectPath(redirectPath), request.url),
    );
    setAuthCookieOnResponse(response, token);
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("[DingTalk Browser OAuth] Error:", error);
    return redirectToLogin(request, "钉钉登录失败，请重试", redirectPath);
  }
}

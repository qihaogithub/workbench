import { randomBytes } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  createDingtalkOAuthAuthorizationUrl,
  readDingtalkLoginConfig,
} from "@/lib/dingtalk-login";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { createApiError } from "@/lib/fs-utils";

const STATE_COOKIE = "dingtalk_oauth_state";
const REDIRECT_COOKIE = "dingtalk_oauth_redirect";
const OAUTH_COOKIE_MAX_AGE = 10 * 60;

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.USE_SECURE_COOKIE !== "false",
    sameSite: "lax" as const,
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
  };
}

export async function GET(request: NextRequest) {
  const config = readDingtalkLoginConfig();
  if (
    !config.enabled ||
    !config.corpId ||
    !config.appKey ||
    !config.appSecret ||
    !config.redirectUri
  ) {
    return NextResponse.json(
      createApiError(
        "INTERNAL_ERROR",
        "DingTalk browser OAuth is not configured",
      ),
      { status: 503 },
    );
  }

  const state = randomBytes(32).toString("base64url");
  const redirect = getSafeRedirectPath(
    request.nextUrl.searchParams.get("redirect"),
  );
  const response = NextResponse.redirect(
    createDingtalkOAuthAuthorizationUrl(config, state),
  );
  response.cookies.set(STATE_COOKIE, state, oauthCookieOptions());
  response.cookies.set(REDIRECT_COOKIE, redirect, oauthCookieOptions());
  return response;
}

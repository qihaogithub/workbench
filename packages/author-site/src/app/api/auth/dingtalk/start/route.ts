import { NextRequest, NextResponse } from "next/server";

import {
  createDingtalkOAuthAuthorizationUrl,
  readDingtalkLoginConfig,
} from "@/lib/dingtalk-login";
import {
  createDingtalkOAuthState,
  isDingtalkLoginHandoffConfigured,
} from "@/lib/dingtalk-login-handoff";
import { createApiError } from "@/lib/fs-utils";

const STATE_COOKIE = "dingtalk_oauth_state";
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
    !config.redirectUri ||
    !isDingtalkLoginHandoffConfigured()
  ) {
    return NextResponse.json(
      createApiError(
        "INTERNAL_ERROR",
        "DingTalk browser OAuth is not configured",
      ),
      { status: 503 },
    );
  }

  const { state, nonce } = await createDingtalkOAuthState(
    request.nextUrl.searchParams.get("redirect"),
  );
  const response = NextResponse.redirect(
    createDingtalkOAuthAuthorizationUrl(config, state),
  );
  response.cookies.set(STATE_COOKIE, nonce, oauthCookieOptions());
  response.cookies.delete("dingtalk_oauth_redirect");
  return response;
}

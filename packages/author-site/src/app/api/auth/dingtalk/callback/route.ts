import { NextRequest, NextResponse } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { exchangeDingtalkBrowserAuthCode } from "@/lib/dingtalk-login";
import {
  createDingtalkLoginHandoff,
  resolveDingtalkLoginTargetOrigin,
  verifyDingtalkOAuthState,
} from "@/lib/dingtalk-login-handoff";
import { createApiError } from "@/lib/fs-utils";

interface VerifiedCallbackState {
  targetId: string;
  targetOrigin: string;
  redirectPath: string;
  nonce: string;
}

function addPrivateResponseHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function invalidStateResponse(): NextResponse {
  return NextResponse.json(
    createApiError(
      "VALIDATION_ERROR",
      "DingTalk OAuth state is invalid or expired",
    ),
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

async function readCallbackState(
  request: NextRequest,
): Promise<VerifiedCallbackState | null> {
  const encodedState = request.nextUrl.searchParams.get("state");
  if (!encodedState) return null;
  try {
    const state = await verifyDingtalkOAuthState(encodedState);
    return {
      ...state,
      targetOrigin: resolveDingtalkLoginTargetOrigin(state.targetId),
    };
  } catch {
    return null;
  }
}

function redirectToTargetLogin(
  state: VerifiedCallbackState,
  message: string,
): NextResponse {
  const loginUrl = new URL("/login", state.targetOrigin);
  loginUrl.searchParams.set(
    "redirect",
    getSafeRedirectPath(state.redirectPath),
  );
  loginUrl.searchParams.set("dingtalkError", message);
  return addPrivateResponseHeaders(NextResponse.redirect(loginUrl));
}

export async function GET(request: NextRequest) {
  const state = await readCallbackState(request);
  if (!state) {
    return invalidStateResponse();
  }

  if (request.nextUrl.searchParams.get("error")) {
    return redirectToTargetLogin(state, "钉钉授权未完成，请重试");
  }

  const authCode =
    request.nextUrl.searchParams.get("authCode") ||
    request.nextUrl.searchParams.get("code");
  if (!authCode) {
    return redirectToTargetLogin(state, "未获取到钉钉授权码，请重试");
  }

  try {
    const profile = await exchangeDingtalkBrowserAuthCode(authCode);
    const handoff = await createDingtalkLoginHandoff(state, profile);
    const completionUrl = new URL(
      "/api/auth/dingtalk/complete",
      state.targetOrigin,
    );
    completionUrl.searchParams.set("handoff", handoff);
    return addPrivateResponseHeaders(NextResponse.redirect(completionUrl));
  } catch (error) {
    console.error(
      "[DingTalk Browser OAuth] Error:",
      error instanceof Error ? error.message : "unknown error",
    );
    return redirectToTargetLogin(state, "钉钉登录失败，请重试");
  }
}

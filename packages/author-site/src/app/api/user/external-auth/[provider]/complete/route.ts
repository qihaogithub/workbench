import { NextRequest, NextResponse } from "next/server";

import type { FigmaExternalAuthCredential } from "@workbench/shared";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  getFigmaOAuthCallbackOrigin,
  getFigmaOAuthHandoffSecret,
  getFigmaOAuthPostAuthOrigin,
  getFigmaOAuthTargetId,
} from "@/lib/figma-oauth-handoff";
import {
  readExternalAuthSessionConfigWithRefresh,
  upsertExternalAuthConfig,
} from "@/lib/external-auth";
import { listActiveSessionsForUser } from "@/lib/session-manager";
import { pushSessionExternalAuthToAgent } from "@/lib/agent-providers";

const FIGMA_STATE_COOKIE = "figma_oauth_state";

interface FigmaRedeemResponse {
  userId: string;
  sessionId?: string;
  accountLabel?: string;
  expiresAt?: number;
  credential: FigmaExternalAuthCredential;
}

function addPrivateResponseHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function redirectToWorkbench(request: NextRequest, status: string): NextResponse {
  let origin: string;
  try {
    origin = getFigmaOAuthPostAuthOrigin();
  } catch {
    origin = request.nextUrl.origin;
  }
  const url = new URL("/workbench", origin);
  url.searchParams.set("externalAuth", status);
  return addPrivateResponseHeaders(NextResponse.redirect(url));
}

async function requireUserId(): Promise<string | null> {
  const token = await getAuthCookie();
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.userId || null;
}

function isFigmaCredential(value: unknown): value is FigmaExternalAuthCredential {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { accessToken?: unknown }).accessToken === "string",
  );
}

async function syncExternalAuthToActiveSessions(
  userId: string,
  requestedSessionId?: string,
): Promise<void> {
  const config = await readExternalAuthSessionConfigWithRefresh(userId);
  const sessionIds = new Set(listActiveSessionsForUser(userId));
  if (requestedSessionId) sessionIds.add(requestedSessionId);
  await Promise.all(
    Array.from(sessionIds).map((sessionId) =>
      pushSessionExternalAuthToAgent(sessionId, config),
    ),
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "figma") return redirectToWorkbench(request, "unsupported");

  const userId = await requireUserId();
  const ticket = request.nextUrl.searchParams.get("handoff")?.trim();
  const nonce = request.cookies.get(FIGMA_STATE_COOKIE)?.value;
  if (!userId || !ticket || !nonce) {
    return redirectToWorkbench(request, "failed");
  }

  try {
    const redeemUrl = new URL(
      "/api/user/external-auth/figma/handoff/redeem",
      getFigmaOAuthCallbackOrigin(),
    );
    const response = await fetch(redeemUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Figma-OAuth-Handoff-Secret": getFigmaOAuthHandoffSecret(),
      },
      body: JSON.stringify({
        ticket,
        nonce,
        targetId: getFigmaOAuthTargetId(),
      }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as {
      success?: boolean;
      data?: FigmaRedeemResponse;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.success || !body.data) {
      throw new Error(body?.error?.message || "Figma OAuth handoff 兑换失败");
    }

    const handoff = body.data;
    if (handoff.userId !== userId || !isFigmaCredential(handoff.credential)) {
      throw new Error("Figma OAuth handoff 用户不匹配");
    }

    await upsertExternalAuthConfig(userId, {
      provider: "figma",
      status: "connected",
      accountLabel: handoff.accountLabel,
      expiresAt: handoff.expiresAt,
      credential: handoff.credential,
    });
    await syncExternalAuthToActiveSessions(userId, handoff.sessionId);

    const result = redirectToWorkbench(request, "figma-connected");
    result.cookies.delete(FIGMA_STATE_COOKIE);
    return result;
  } catch (error) {
    console.error(
      "[Figma OAuth Handoff] Error:",
      error instanceof Error ? error.message : "unknown error",
    );
    return redirectToWorkbench(request, "failed");
  }
}

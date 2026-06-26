import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { pushSessionExternalAuthToAgent } from "@/lib/agent-providers";
import {
  readExternalAuthSessionConfigWithRefresh,
  upsertExternalAuthConfig,
} from "@/lib/external-auth";
import { listActiveSessionsForUser } from "@/lib/session-manager";

const FIGMA_TOKEN_URL = "https://api.figma.com/v1/oauth/token";
const FIGMA_ME_URL = "https://api.figma.com/v1/me";

function getSigningSecret(): string {
  return process.env.JWT_SECRET || "change-me-in-production";
}

function verifyState(
  state: string,
): { userId: string; provider: string; exp: number; sessionId?: string } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");
  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    userId?: string;
    provider?: string;
    exp?: number;
    sessionId?: string;
  };
  if (!payload.userId || payload.provider !== "figma" || !payload.exp) return null;
  if (payload.exp <= Date.now()) return null;
  return payload as {
    userId: string;
    provider: string;
    exp: number;
    sessionId?: string;
  };
}

function buildRedirect(request: NextRequest, status: string): NextResponse {
  const url = new URL("/", request.url);
  url.searchParams.set("externalAuth", status);
  return NextResponse.redirect(url);
}

async function fetchFigmaAccountLabel(accessToken: string): Promise<string | undefined> {
  const res = await fetch(FIGMA_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const body = await res.json() as { email?: string; handle?: string; id?: string };
  return body.email || body.handle || body.id;
}

async function syncExternalAuthToActiveSessions(
  userId: string,
  requestedSessionId?: string,
): Promise<void> {
  const config = await readExternalAuthSessionConfigWithRefresh(userId);
  const sessionIds = new Set(listActiveSessionsForUser(userId));
  if (requestedSessionId) {
    sessionIds.add(requestedSessionId);
  }
  await Promise.all(
    Array.from(sessionIds).map((sessionId) =>
      pushSessionExternalAuthToAgent(sessionId, config),
    ),
  );
}

export async function GET(
  request: NextRequest,
  context: { params: { provider: string } },
) {
  if (context.params.provider !== "figma") {
    return buildRedirect(request, "unsupported");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return buildRedirect(request, "failed");
  }

  const payload = verifyState(state);
  if (!payload) {
    return buildRedirect(request, "failed");
  }

  const clientId = process.env.FIGMA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.FIGMA_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.FIGMA_OAUTH_REDIRECT_URI ||
    new URL("/api/user/external-auth/figma/callback", request.url).toString();
  if (!clientId || !clientSecret) {
    upsertExternalAuthConfig(payload.userId, {
      provider: "figma",
      status: "unsupported",
      message: "Figma OAuth 客户端未完整配置",
    });
    return buildRedirect(request, "unsupported");
  }

  try {
    const res = await fetch(FIGMA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Figma token exchange failed: ${res.status} ${text}`);
    }

    const token = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };
    const expiresAt = token.expires_in
      ? Date.now() + token.expires_in * 1000
      : undefined;
    const accountLabel = await fetchFigmaAccountLabel(token.access_token);

    upsertExternalAuthConfig(payload.userId, {
      provider: "figma",
      status: "connected",
      accountLabel,
      expiresAt,
      credential: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt,
        tokenType: token.token_type,
        scope: token.scope,
      },
    });
    await syncExternalAuthToActiveSessions(payload.userId, payload.sessionId);
    return buildRedirect(request, "figma-connected");
  } catch (error) {
    upsertExternalAuthConfig(payload.userId, {
      provider: "figma",
      status: "needs_reauth",
      message: error instanceof Error ? error.message : "Figma 授权失败",
    });
    await syncExternalAuthToActiveSessions(payload.userId, payload.sessionId);
    return buildRedirect(request, "failed");
  }
}

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import type { FigmaExternalAuthCredential } from "@workbench/shared";

import { pushSessionExternalAuthToAgent } from "@/lib/agent-providers";
import {
  createFigmaOAuthHandoff,
  isFigmaOAuthHandoffConfigured,
  getFigmaOAuthPostAuthOrigin,
  resolveFigmaOAuthTargetOrigin,
  verifyFigmaOAuthState,
  type FigmaOAuthStateClaims,
} from "@/lib/figma-oauth-handoff";
import {
  readExternalAuthSessionConfigWithRefresh,
  upsertExternalAuthConfig,
} from "@/lib/external-auth";
import { listActiveSessionsForUser } from "@/lib/session-manager";

const FIGMA_TOKEN_URL = "https://api.figma.com/v1/oauth/token";
const FIGMA_ME_URL = "https://api.figma.com/v1/me";

interface LegacyStateClaims {
  userId: string;
  provider: string;
  exp: number;
  sessionId?: string;
}

interface FigmaTokenExchangeResult {
  credential: FigmaExternalAuthCredential;
  accountLabel?: string;
  expiresAt?: number;
}

function createBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function getSigningSecret(): string {
  return process.env.JWT_SECRET || "change-me-in-production";
}

function verifyLegacyState(state: string): LegacyStateClaims | null {
  try {
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
    return payload as LegacyStateClaims;
  } catch {
    return null;
  }
}

function addPrivateResponseHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function buildPostAuthRedirectUrl(request: NextRequest): URL {
  try {
    return new URL("/workbench", getFigmaOAuthPostAuthOrigin());
  } catch {
    return new URL("/workbench", request.url);
  }
}

function buildStatusRedirect(
  request: NextRequest,
  status: string,
  targetOrigin?: string,
): NextResponse {
  const url = targetOrigin
    ? new URL("/workbench", targetOrigin)
    : buildPostAuthRedirectUrl(request);
  url.searchParams.set("externalAuth", status);
  return addPrivateResponseHeaders(NextResponse.redirect(url));
}

function getMissingFigmaOAuthMessage(): string {
  if (process.env.NODE_ENV !== "production") {
    return "Figma OAuth 客户端未完整配置。开发环境请在 packages/author-site/.env.local 设置 FIGMA_OAUTH_CLIENT_ID 和 FIGMA_OAUTH_CLIENT_SECRET，重启 pnpm dev 后重试。";
  }
  return "Figma OAuth 客户端未完整配置";
}

async function fetchFigmaAccountLabel(accessToken: string): Promise<string | undefined> {
  const res = await fetch(FIGMA_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const body = await res.json() as { email?: string; handle?: string; id?: string };
  return body.email || body.handle || body.id;
}

async function exchangeFigmaCode(
  code: string,
  redirectUri: string,
): Promise<FigmaTokenExchangeResult> {
  const clientId = process.env.FIGMA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.FIGMA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(getMissingFigmaOAuthMessage());
  }

  const res = await fetch(FIGMA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: createBasicAuthHeader(clientId, clientSecret),
    },
    body: new URLSearchParams({
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
  return {
    accountLabel,
    expiresAt,
    credential: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      tokenType: token.token_type,
      scope: token.scope,
    },
  };
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

function getHandoffTargetOrigin(
  state: FigmaOAuthStateClaims | null,
): string | undefined {
  if (!state) return undefined;
  try {
    return resolveFigmaOAuthTargetOrigin(state.targetId);
  } catch {
    return undefined;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "figma") {
    return buildStatusRedirect(request, "unsupported");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return buildStatusRedirect(request, "failed");
  }

  const handoffMode = isFigmaOAuthHandoffConfigured();
  let handoffState: FigmaOAuthStateClaims | null = null;
  let legacyState: LegacyStateClaims | null = null;
  if (handoffMode) {
    try {
      handoffState = await verifyFigmaOAuthState(state);
    } catch {
      return buildStatusRedirect(request, "failed");
    }
  } else {
    legacyState = verifyLegacyState(state);
    if (!legacyState) {
      return buildStatusRedirect(request, "failed");
    }
  }

  const redirectUri =
    process.env.FIGMA_OAUTH_REDIRECT_URI ||
    new URL("/api/user/external-auth/figma/callback", request.url).toString();

  try {
    const exchange = await exchangeFigmaCode(code, redirectUri);
    if (handoffState) {
      const ticket = createFigmaOAuthHandoff({
        ...handoffState,
        credential: exchange.credential,
        accountLabel: exchange.accountLabel,
      });
      const targetOrigin = resolveFigmaOAuthTargetOrigin(handoffState.targetId);
      const completionUrl = new URL(
        "/api/user/external-auth/figma/complete",
        targetOrigin,
      );
      completionUrl.searchParams.set("handoff", ticket);
      return addPrivateResponseHeaders(NextResponse.redirect(completionUrl));
    }

    await upsertExternalAuthConfig(legacyState!.userId, {
      provider: "figma",
      status: "connected",
      accountLabel: exchange.accountLabel,
      expiresAt: exchange.expiresAt,
      credential: exchange.credential,
    });
    await syncExternalAuthToActiveSessions(legacyState!.userId, legacyState!.sessionId);
    return buildStatusRedirect(request, "figma-connected");
  } catch (error) {
    if (legacyState) {
      upsertExternalAuthConfig(legacyState.userId, {
        provider: "figma",
        status: "needs_reauth",
        message: error instanceof Error ? error.message : "Figma 授权失败",
      });
      await syncExternalAuthToActiveSessions(legacyState.userId, legacyState.sessionId);
    }
    return buildStatusRedirect(
      request,
      "failed",
      getHandoffTargetOrigin(handoffState),
    );
  }
}

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import type { ExternalAuthProvider } from "@opencode-workbench/shared";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  pushSessionExternalAuthToAgent,
  startDingtalkAuthOnAgent,
} from "@/lib/agent-providers";
import {
  readExternalAuthSessionConfigWithRefresh,
  upsertExternalAuthConfig,
  type ExternalAuthUpsertInput,
} from "@/lib/external-auth";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { listActiveSessionsForUser } from "@/lib/session-manager";

const FIGMA_AUTH_URL = "https://www.figma.com/oauth";
const DEFAULT_FIGMA_OAUTH_SCOPES = "file_content:read";

function getSigningSecret(): string {
  return process.env.JWT_SECRET || "change-me-in-production";
}

function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

async function requireUserId(): Promise<string | null> {
  const token = getAuthCookie();
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.userId || null;
}

function isProvider(value: string): value is ExternalAuthProvider {
  return value === "figma" || value === "dingtalk";
}

function buildFigmaRedirectUri(request: NextRequest): string {
  return (
    process.env.FIGMA_OAUTH_REDIRECT_URI ||
    new URL("/api/user/external-auth/figma/callback", request.url).toString()
  );
}

function getRequestedAgentSessionId(request: NextRequest): string | undefined {
  const value = request.nextUrl.searchParams.get("sessionId");
  return value && value.trim() ? value.trim() : undefined;
}

function getMissingFigmaOAuthMessage(): string {
  if (process.env.NODE_ENV !== "production") {
    return "Figma OAuth 客户端未配置。开发环境请在 packages/author-site/.env.local 设置 FIGMA_OAUTH_CLIENT_ID 和 FIGMA_OAUTH_CLIENT_SECRET，重启 pnpm dev 后重试。";
  }
  return "Figma OAuth 客户端未配置，无法启用 Figma MCP 授权";
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
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const provider = context.params.provider;
    const requestedSessionId = getRequestedAgentSessionId(request);
    if (!isProvider(provider)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "不支持的外部授权类型"),
        { status: 400 },
      );
    }

    if (provider === "dingtalk") {
      const result = await startDingtalkAuthOnAgent(userId);
      if (!result.ok) {
        const status = upsertExternalAuthConfig(userId, {
          provider,
          status: "needs_reauth",
          message: result.message,
        });
        await syncExternalAuthToActiveSessions(userId, requestedSessionId);
        return NextResponse.json(
          createApiSuccess({ ...status, message: result.message }),
        );
      }

      const data = (result.data || {}) as {
        authUrl?: string;
        userCode?: string;
        verificationUrl?: string;
        configDir?: string;
        expiresAt?: number;
        accountLabel?: string;
        connected?: boolean;
      };
      const connected = data.connected === true || Boolean(data.configDir);
      const input: ExternalAuthUpsertInput = {
        provider,
        status: connected && data.configDir ? "connected" : "pending",
        accountLabel: data.accountLabel,
        expiresAt: data.expiresAt,
        credential: connected && data.configDir ? { configDir: data.configDir } : undefined,
        message: connected && data.configDir ? undefined : "请在浏览器完成钉钉授权",
      };
      upsertExternalAuthConfig(userId, input);
      await syncExternalAuthToActiveSessions(userId, requestedSessionId);
      return NextResponse.json(
        createApiSuccess({
          provider,
          status: input.status,
          authUrl: data.authUrl,
          userCode: data.userCode,
          verificationUrl: data.verificationUrl,
          expiresAt: data.expiresAt,
          message: input.message,
        }),
      );
    }

    const clientId = process.env.FIGMA_OAUTH_CLIENT_ID;
    if (!clientId) {
      const status = upsertExternalAuthConfig(userId, {
        provider,
        status: "unsupported",
        message: getMissingFigmaOAuthMessage(),
      });
      await syncExternalAuthToActiveSessions(userId, requestedSessionId);
      return NextResponse.json(createApiSuccess(status));
    }

    const redirectUri = buildFigmaRedirectUri(request);
    const state = signState({
      provider,
      userId,
      exp: Date.now() + 10 * 60_000,
      nonce: crypto.randomUUID(),
      sessionId: requestedSessionId,
    });
    const url = new URL(FIGMA_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set(
      "scope",
      process.env.FIGMA_OAUTH_SCOPES || DEFAULT_FIGMA_OAUTH_SCOPES,
    );

    upsertExternalAuthConfig(userId, {
      provider,
      status: "pending",
      message: "请在浏览器完成 Figma 授权",
    });
    await syncExternalAuthToActiveSessions(userId, requestedSessionId);
    return NextResponse.json(
      createApiSuccess({
        provider,
        status: "pending",
        authUrl: url.toString(),
        expiresAt: Date.now() + 10 * 60_000,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      createApiError(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "启动外部授权失败",
      ),
      { status: 500 },
    );
  }
}

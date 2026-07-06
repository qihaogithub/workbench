import { NextResponse } from "next/server";

import type { ExternalAuthProvider } from "@workbench/shared";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  disconnectDingtalkAuthOnAgent,
  pushSessionExternalAuthToAgent,
} from "@/lib/agent-providers";
import {
  deleteExternalAuthConfig,
  readExternalAuthSessionConfigWithRefresh,
} from "@/lib/external-auth";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { listActiveSessionsForUser } from "@/lib/session-manager";

async function requireUserId(): Promise<string | null> {
  const token = getAuthCookie();
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.userId || null;
}

function isProvider(value: string): value is ExternalAuthProvider {
  return value === "figma" || value === "dingtalk";
}

async function syncExternalAuthToActiveSessions(userId: string): Promise<void> {
  const config = await readExternalAuthSessionConfigWithRefresh(userId);
  await Promise.all(
    listActiveSessionsForUser(userId).map((sessionId) =>
      pushSessionExternalAuthToAgent(sessionId, config),
    ),
  );
}

export async function DELETE(
  _request: Request,
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
    if (!isProvider(provider)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "不支持的外部授权类型"),
        { status: 400 },
      );
    }

    if (provider === "dingtalk") {
      const result = await disconnectDingtalkAuthOnAgent(userId);
      if (!result.ok) {
        console.warn("[external-auth] Failed to disconnect dingtalk:", result.message);
      }
    }

    deleteExternalAuthConfig(userId, provider);
    await syncExternalAuthToActiveSessions(userId);
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    return NextResponse.json(
      createApiError(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "断开外部授权失败",
      ),
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import type { DingtalkExternalAuthCredential } from "@workbench/shared";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  fetchDingtalkAuthFromAgent,
  pushSessionExternalAuthToAgent,
} from "@/lib/agent-providers";
import {
  readExternalAuthSessionConfigWithRefresh,
  readExternalAuthStatuses,
  upsertExternalAuthConfig,
} from "@/lib/external-auth";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { listActiveSessionsForUser } from "@/lib/session-manager";

async function requireUserId(): Promise<string | null> {
  const token = getAuthCookie();
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.userId || null;
}

function getRequestedAgentSessionId(request: NextRequest): string | undefined {
  const value = request.nextUrl.searchParams.get("sessionId");
  return value && value.trim() ? value.trim() : undefined;
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

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const requestedSessionId = getRequestedAgentSessionId(request);
    let providers = readExternalAuthStatuses(userId);
    const dingtalkStatus = providers.find((provider) => provider.provider === "dingtalk");
    if (
      dingtalkStatus?.status === "pending" ||
      dingtalkStatus?.status === "needs_reauth" ||
      dingtalkStatus?.status === "connected"
    ) {
      const result = await fetchDingtalkAuthFromAgent(userId);
      const data = result.data as
        | {
            connected?: boolean;
            configDir?: string;
            accountLabel?: string;
          }
        | undefined;
      if (result.ok && data?.connected && data.configDir) {
        const credential: DingtalkExternalAuthCredential = {
          configDir: data.configDir,
        };
        upsertExternalAuthConfig(userId, {
          provider: "dingtalk",
          status: "connected",
          accountLabel: data.accountLabel,
          credential,
        });
        await syncExternalAuthToActiveSessions(userId, requestedSessionId);
        providers = readExternalAuthStatuses(userId);
      } else if (result.ok && data?.connected === false) {
        upsertExternalAuthConfig(userId, {
          provider: "dingtalk",
          status:
            dingtalkStatus.status === "connected" ? "needs_reauth" : dingtalkStatus.status,
          accountLabel: dingtalkStatus.accountLabel,
          message:
            dingtalkStatus.status === "connected"
              ? "钉钉登录态已失效，请重新连接"
              : dingtalkStatus.message || "请在浏览器完成钉钉授权",
        });
        await syncExternalAuthToActiveSessions(userId, requestedSessionId);
        providers = readExternalAuthStatuses(userId);
      }
    }

    if (providers.some((provider) => provider.status === "connected")) {
      await syncExternalAuthToActiveSessions(userId, requestedSessionId);
    }

    return NextResponse.json(createApiSuccess({ providers }));
  } catch (error) {
    return NextResponse.json(
      createApiError(
        "FILE_READ_ERROR",
        error instanceof Error ? error.message : "读取外部授权状态失败",
      ),
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { fetchUserModelCatalog } from "@/lib/user-model-config";

async function requireUserId(): Promise<string | null> {
  const token = await getAuthCookie();
  if (!token) return null;
  return (await verifyToken(token))?.userId || null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const body = (await request.json()) as { baseURL?: unknown; apiKey?: unknown } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(createApiError("INVALID_REQUEST", "请求体无效"), {
        status: 400,
      });
    }

    const models = await fetchUserModelCatalog(userId, {
      baseURL: typeof body.baseURL === "string" ? body.baseURL : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    });
    return NextResponse.json(createApiSuccess({ models }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取模型列表失败";
    return NextResponse.json(createApiError("AGENT_SERVICE_ERROR", message), {
      status: message.includes("baseURL") ? 400 : 502,
    });
  }
}

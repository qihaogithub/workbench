import { NextRequest, NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  deleteUserModelConfig,
  readUserModelConfig,
  upsertUserModelConfig,
  type UserModelConfigInput,
} from "@/lib/user-model-config";

async function requireUserId(): Promise<string | null> {
  const token = getAuthCookie();
  if (!token) return null;

  const payload = await verifyToken(token);
  return payload?.userId || null;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    return NextResponse.json(createApiSuccess(readUserModelConfig(userId)));
  } catch (error) {
    return NextResponse.json(
      createApiError(
        "FILE_READ_ERROR",
        error instanceof Error ? error.message : "读取模型配置失败",
      ),
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const body = (await request.json()) as
      | (UserModelConfigInput & { clearConfig?: boolean })
      | null;

    if (body?.clearConfig) {
      deleteUserModelConfig(userId);
      return NextResponse.json(createApiSuccess(null));
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "请求体无效"),
        { status: 400 },
      );
    }

    const config = upsertUserModelConfig(userId, body);
    return NextResponse.json(createApiSuccess(config));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存模型配置失败";
    const status =
      message.includes("必填") ||
      message.includes("无效") ||
      message.includes("至少") ||
      message.includes("默认模型")
        ? 400
        : 500;

    return NextResponse.json(createApiError("VALIDATION_ERROR", message), {
      status,
    });
  }
}

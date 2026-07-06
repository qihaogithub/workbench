import { NextRequest, NextResponse } from "next/server";
import type { UserAuthoringPreferences } from "@workbench/shared";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  deleteUserAuthoringPreferences,
  readUserAuthoringPreferences,
  upsertUserAuthoringPreferences,
} from "@/lib/user-authoring-preferences";

async function requireUserId(): Promise<string | null> {
  const token = getAuthCookie();
  if (!token) return null;

  const payload = await verifyToken(token);
  return payload?.userId || null;
}

function parsePreferences(value: unknown): UserAuthoringPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sketchEditorEngine = record.sketchEditorEngine;
  if (sketchEditorEngine === undefined || sketchEditorEngine === "") return {};
  if (sketchEditorEngine === "native" || sketchEditorEngine === "openpencil") {
    return { sketchEditorEngine };
  }
  return null;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    return NextResponse.json(
      createApiSuccess(
        readUserAuthoringPreferences(userId) ?? {
          preferences: {},
          updatedAt: 0,
        },
      ),
    );
  } catch (error) {
    return NextResponse.json(
      createApiError(
        "FILE_READ_ERROR",
        error instanceof Error ? error.message : "读取创作偏好失败",
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
      | { preferences?: unknown; clearPreferences?: boolean }
      | null;

    if (body?.clearPreferences) {
      deleteUserAuthoringPreferences(userId);
      return NextResponse.json(
        createApiSuccess({ preferences: {}, updatedAt: 0 }),
      );
    }

    const preferences = parsePreferences(body?.preferences);
    if (!preferences) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "创作偏好参数不合法"),
        { status: 400 },
      );
    }

    return NextResponse.json(
      createApiSuccess(upsertUserAuthoringPreferences(userId, preferences)),
    );
  } catch (error) {
    return NextResponse.json(
      createApiError(
        "FILE_WRITE_ERROR",
        error instanceof Error ? error.message : "保存创作偏好失败",
      ),
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  appendEditorDiagnosticEvents,
} from "@/lib/editor-diagnostics/store";
import type { EditorDiagnosticEvent } from "@/lib/editor-diagnostics/types";

interface EditorDiagnosticEventsRequest {
  events?: unknown;
}

function isEventLike(value: unknown): value is EditorDiagnosticEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<EditorDiagnosticEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.editorSessionId === "string" &&
    typeof event.projectId === "string" &&
    typeof event.timestamp === "number" &&
    typeof event.category === "string" &&
    typeof event.name === "string"
  );
}

export async function POST(request: Request) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const body = (await request.json().catch(() => ({}))) as EditorDiagnosticEventsRequest;
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "诊断事件不能为空"),
        { status: 400 },
      );
    }
    if (body.events.length > 200) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "单次最多写入 200 条诊断事件"),
        { status: 400 },
      );
    }
    if (!body.events.every(isEventLike)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "诊断事件格式无效"),
        { status: 400 },
      );
    }

    const result = await appendEditorDiagnosticEvents(body.events);
    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    console.error("Error writing editor diagnostics:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "写入编辑页诊断日志失败"),
      { status: 500 },
    );
  }
}

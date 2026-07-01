import { NextRequest, NextResponse } from "next/server";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { buildEditorDiagnosticExport } from "@/lib/editor-diagnostics/store";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export async function GET(request: NextRequest) {
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

    const editorSessionId = request.nextUrl.searchParams.get("editorSessionId");
    if (!editorSessionId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "缺少 editorSessionId"),
        { status: 400 },
      );
    }

    const diagnosticExport = await buildEditorDiagnosticExport(editorSessionId);
    return NextResponse.json(createApiSuccess(diagnosticExport));
  } catch (error) {
    const message =
      error instanceof Error && error.message === "INVALID_EDITOR_SESSION_ID"
        ? "editorSessionId 格式无效"
        : "导出编辑页诊断包失败";
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", message), {
      status: 500,
    });
  }
}

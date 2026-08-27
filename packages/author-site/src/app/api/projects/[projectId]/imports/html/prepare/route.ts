import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, getSessionMeta, isSessionExpired, projectExists, sessionExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { prepareHtmlImportDraft } from "@/lib/html-import-draft";
import { requiresHtmlImportConfirmation } from "@workbench/project-core";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const token = await getAuthCookie();
  if (!token) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  const auth = await verifyToken(token);
  if (!auth) return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });
  const { projectId } = await params;
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const html = typeof body.html === "string" ? body.html : undefined;
  if (!sessionId || html === undefined) return NextResponse.json(createApiError("INVALID_REQUEST", "sessionId 和 html 参数必填"), { status: 400 });
  if (!sessionExists(sessionId)) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
  const session = getSessionMeta(sessionId);
  if (!session) return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
  if (session.userId && session.userId !== auth.userId) return NextResponse.json(createApiError("FORBIDDEN"), { status: 403 });
  if (session.demoId !== projectId) return NextResponse.json(createApiError("INVALID_REQUEST", "Session 与项目不匹配"), { status: 400 });
  if (isSessionExpired(session)) return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
  if (!session.workspaceId) return NextResponse.json(createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"), { status: 400 });
  try {
    const { draft } = prepareHtmlImportDraft({ projectId, userId: auth.userId, sessionId, workspaceId: session.workspaceId, filename: typeof body.filename === "string" ? body.filename : "import.html", name: typeof body.name === "string" ? body.name : undefined, parentId: typeof body.parentId === "string" ? body.parentId : null, html, requestOrigin: request.nextUrl.origin });
    return NextResponse.json(createApiSuccess({ draftId: draft.draftId, analysis: draft.analysis, recommendation: draft.presentation, presentation: draft.presentation, confirmationRequired: requiresHtmlImportConfirmation(draft.analysis), execution: draft.execution ? { executionUrl: draft.execution.executionUrl, channelId: draft.execution.channelId, expiresAt: draft.execution.expiresAt } : undefined, filename: draft.filename, name: draft.name }), { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "HTML_IMPORT_FAILED";
    const status = code.startsWith("HTML_IMPORT_") ? 422 : 500;
    return NextResponse.json(createApiError((status === 422 ? code : "FILE_WRITE_ERROR") as never, "HTML 准备导入失败"), { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, getSessionMeta, isSessionExpired, projectExists, sessionExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { commitHtmlImportDraft, readHtmlImportDraft, type PagePresentationProfile, WorkspaceAuthorityClientError } from "@/lib/html-import-draft";
import { isValidPagePresentationViewport } from "@workbench/shared";
import { requiresHtmlImportConfirmation } from "@workbench/project-core";
import { appendServerEditorDiagnosticEvent } from "@/lib/editor-diagnostics/store";

function validPresentation(value: unknown): value is PagePresentationProfile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>; const viewport = v.viewport as Record<string, unknown> | undefined;
  return v.version === 1 && (v.mode === "fixed-canvas" || v.mode === "responsive-page") && (v.heightBehavior === "fixed" || v.heightBehavior === "content") && ["desktop", "tablet", "mobile", "custom"].includes(String(v.preset)) && ["figma", "html-meta", "user", "recommended"].includes(String(v.source)) && !!viewport && typeof viewport.width === "number" && typeof viewport.height === "number" && isValidPagePresentationViewport({ width: viewport.width, height: viewport.height });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const token = await getAuthCookie(); if (!token) return NextResponse.json(createApiError("UNAUTHORIZED"), { status: 401 }); const auth = await verifyToken(token); if (!auth) return NextResponse.json(createApiError("UNAUTHORIZED"), { status: 401 });
  const { projectId } = await params; if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const body = await request.json().catch(() => ({})) as { sessionId?: unknown; draftId?: unknown; presentation?: unknown; name?: unknown; confirmationAccepted?: unknown }; const id = typeof body.draftId === "string" ? body.draftId : ""; const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""; const draft = readHtmlImportDraft(id);
  if (!draft || draft.projectId !== projectId || draft.userId !== auth.userId) return NextResponse.json(createApiError("INVALID_REQUEST", "Draft 不存在或无权访问"), { status: 404 });
  if (!sessionId || draft.sessionId !== sessionId || !sessionExists(sessionId)) return NextResponse.json(createApiError("INVALID_REQUEST", "Draft 与 Session 不匹配"), { status: 400 });
  const session = getSessionMeta(sessionId);
  if (!session || session.demoId !== projectId || session.workspaceId !== draft.workspaceId || isSessionExpired(session)) return NextResponse.json(createApiError("SESSION_EXPIRED", "Session 已失效或 Workspace 不匹配"), { status: 410 });
  if (!validPresentation(body.presentation)) return NextResponse.json(createApiError("INVALID_REQUEST", "presentation 参数无效"), { status: 400 });
  if (requiresHtmlImportConfirmation(draft.analysis) && body.confirmationAccepted !== true) return NextResponse.json(createApiError("INVALID_REQUEST", "请确认兼容性限制和展示尺寸后再导入"), { status: 422 });
  try { const page = await commitHtmlImportDraft({ ...draft, name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : draft.name }, body.presentation); return NextResponse.json(createApiSuccess({ page, presentation: body.presentation, idempotentReplay: draft.commitState === "committed" }), { status: draft.commitState === "committed" ? 200 : 201 }); }
  catch (error) {
    const errorCode = error instanceof WorkspaceAuthorityClientError ? error.code : error instanceof Error ? error.message : "HTML_IMPORT_FAILED";
    appendServerEditorDiagnosticEvent({ level: "error", eventGroup: "project", eventType: "import.commit.failed", projectId, sessionId, workspaceId: draft.workspaceId, payload: { runtimeType: draft.analysis.runtimeType, analysisVersion: draft.analysis.analysisVersion, errorCode } });
    if (error instanceof WorkspaceAuthorityClientError) return NextResponse.json(createApiError("FILE_WRITE_ERROR", error.message, { authorityCode: error.code }), { status: error.status });
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", error instanceof Error ? error.message : "提交 HTML 导入失败"), { status: 500 });
  }
}

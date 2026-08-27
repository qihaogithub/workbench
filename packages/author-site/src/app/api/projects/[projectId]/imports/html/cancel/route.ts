import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, projectExists, sessionExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { deleteHtmlImportDraft, readHtmlImportDraft } from "@/lib/html-import-draft";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const token = await getAuthCookie(); if (!token) return NextResponse.json(createApiError("UNAUTHORIZED"), { status: 401 });
  const auth = await verifyToken(token); if (!auth) return NextResponse.json(createApiError("UNAUTHORIZED"), { status: 401 });
  const { projectId } = await params; if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const body = await request.json().catch(() => ({})) as { sessionId?: unknown; draftId?: unknown }; const id = typeof body.draftId === "string" ? body.draftId : ""; const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""; const draft = readHtmlImportDraft(id);
  if (!draft || draft.projectId !== projectId || draft.userId !== auth.userId) return NextResponse.json(createApiError("INVALID_REQUEST", "Draft 不存在或无权访问"), { status: 404 });
  if (!sessionId || draft.sessionId !== sessionId || !sessionExists(sessionId)) return NextResponse.json(createApiError("INVALID_REQUEST", "Draft 与 Session 不匹配"), { status: 400 });
  deleteHtmlImportDraft(id); return NextResponse.json(createApiSuccess({ cancelled: true }));
}

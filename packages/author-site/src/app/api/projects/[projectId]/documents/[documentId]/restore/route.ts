import { NextRequest, NextResponse } from "next/server";
import { createDocumentApplicationService, documentErrorResponse, resolveDocumentActor, resolveDocumentContext, assertProject } from "@/lib/document-application-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; documentId: string }> }) {
  const { projectId, documentId } = await params;
  const actor = await resolveDocumentActor();
  if (!actor) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未登录" } }, { status: 401 });
  try {
    assertProject(projectId);
    const rawBody = await request.json().catch(() => ({}));
    const body = rawBody && typeof rawBody === "object"
      ? rawBody as { revisionId?: unknown; sessionId?: unknown }
      : {};
    if (typeof body.revisionId !== "string" || !body.revisionId.trim()) return NextResponse.json({ success: false, error: { code: "DOCUMENT_INVALID", message: "revisionId 必填" } }, { status: 400 });
    const context = await resolveDocumentContext(request, projectId, actor, body);
    const data = await createDocumentApplicationService().restore({ locator: { projectId, documentId }, revisionId: body.revisionId.trim(), actor, ...context });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const response = documentErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

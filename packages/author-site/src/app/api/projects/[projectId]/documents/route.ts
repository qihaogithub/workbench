import { NextRequest, NextResponse } from "next/server";
import { createDocumentApplicationService, documentErrorResponse, resolveDocumentActor, resolveDocumentContext, assertProject } from "@/lib/document-application-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const actor = await resolveDocumentActor();
  if (!actor) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未登录" } }, { status: 401 });
  try {
    assertProject(projectId);
    const context = await resolveDocumentContext(request, projectId, actor);
    const data = await createDocumentApplicationService().list(projectId, actor, context);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const response = documentErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const actor = await resolveDocumentActor();
  if (!actor) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未登录" } }, { status: 401 });
  try {
    assertProject(projectId);
    const rawBody = await request.json().catch(() => ({}));
    const body = rawBody && typeof rawBody === "object"
      ? rawBody as { title?: unknown; description?: unknown; content?: unknown; sessionId?: unknown }
      : {};
    if (typeof body.title !== "string" || !body.title.trim() || typeof body.content !== "string") {
      return NextResponse.json({ success: false, error: { code: "DOCUMENT_INVALID", message: "title 和 content 必填" } }, { status: 400 });
    }
    const context = await resolveDocumentContext(request, projectId, actor, body);
    const result = await createDocumentApplicationService().create({ projectId, title: body.title, description: typeof body.description === "string" ? body.description : undefined, content: body.content, actor, ...context });
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    const response = documentErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

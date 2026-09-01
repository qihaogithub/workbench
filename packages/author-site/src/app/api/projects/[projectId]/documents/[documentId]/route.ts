import { NextRequest, NextResponse } from "next/server";
import { createDocumentApplicationService, documentErrorResponse, resolveDocumentActor, resolveDocumentContext, assertProject } from "@/lib/document-application-service";

type RouteParams = { projectId: string; documentId: string };

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { projectId, documentId } = await params;
  const actor = await resolveDocumentActor();
  if (!actor) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未登录" } }, { status: 401 });
  try {
    assertProject(projectId);
    const context = await resolveDocumentContext(request, projectId, actor);
    const snapshot = await createDocumentApplicationService().get({ projectId, documentId }, actor, context);
    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    const response = documentErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { projectId, documentId } = await params;
  const actor = await resolveDocumentActor();
  if (!actor) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未登录" } }, { status: 401 });
  try {
    assertProject(projectId);
    const rawBody = await request.json().catch(() => ({}));
    const body = rawBody && typeof rawBody === "object"
      ? rawBody as { title?: unknown; description?: unknown; content?: unknown; sessionId?: unknown }
      : {};
    if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) return NextResponse.json({ success: false, error: { code: "DOCUMENT_INVALID", message: "title 不能为空" } }, { status: 400 });
    if (body.description !== undefined && typeof body.description !== "string") return NextResponse.json({ success: false, error: { code: "DOCUMENT_INVALID", message: "description 必须是字符串" } }, { status: 400 });
    if (body.content !== undefined && typeof body.content !== "string") return NextResponse.json({ success: false, error: { code: "DOCUMENT_INVALID", message: "content 必须是字符串" } }, { status: 400 });
    const context = await resolveDocumentContext(request, projectId, actor, body);
    const result = await createDocumentApplicationService().update({ locator: { projectId, documentId }, title: typeof body.title === "string" ? body.title : undefined, description: typeof body.description === "string" ? body.description : undefined, content: typeof body.content === "string" ? body.content : undefined, actor, ...context });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const response = documentErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { projectId, documentId } = await params;
  const actor = await resolveDocumentActor();
  if (!actor) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未登录" } }, { status: 401 });
  try {
    assertProject(projectId);
    const context = await resolveDocumentContext(request, projectId, actor);
    const result = await createDocumentApplicationService().remove({ locator: { projectId, documentId }, actor, ...context });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const response = documentErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createDocumentApplicationService, documentErrorResponse, resolveDocumentActor, assertProject } from "@/lib/document-application-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string; documentId: string; revisionId: string }> }) {
  const { projectId, documentId, revisionId } = await params;
  const actor = await resolveDocumentActor();
  if (!actor) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未登录" } }, { status: 401 });
  try {
    assertProject(projectId);
    const data = await createDocumentApplicationService().getRevision({ projectId, documentId }, revisionId, actor);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const response = documentErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

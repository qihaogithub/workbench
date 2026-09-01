import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, projectExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { findUnlinkedMentions } from "@workbench/project-core";
import type { MarkdownReferenceSource, MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";
import {
  buildMarkdownReferenceIndex,
  resolveMarkdownReferenceWorkspace,
} from "@/lib/markdown-references";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const context = resolveMarkdownReferenceWorkspace(request, projectId, user.userId);
  if (!context) return NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间不可用"), { status: 404 });
  const sourceKind = request.nextUrl.searchParams.get("sourceKind");
  const sourceId = request.nextUrl.searchParams.get("sourceId") || "";
  const result = buildMarkdownReferenceIndex(context, { readMarkdown: true, rebuild: false });
  const sourceDocument = result.sourceDocuments.find((entry) => {
    if (!sourceKind) return false;
    if (entry.source.kind !== sourceKind) return false;
    if (entry.source.kind === "knowledge-document") return entry.source.docId === sourceId;
    if (entry.source.kind === "page-requirements" || entry.source.kind === "page-convention") return entry.source.pageId === sourceId;
    if (entry.source.kind === "design-spec-entry") return entry.source.entryId === sourceId && (!request.nextUrl.searchParams.get("specId") || entry.source.specId === request.nextUrl.searchParams.get("specId"));
    if (entry.source.kind === "config-note") return entry.source.fieldKey === request.nextUrl.searchParams.get("fieldKey") && entry.source.scope === (request.nextUrl.searchParams.get("scope") === "page" ? "page" : "project") && (!entry.source.pageId || entry.source.pageId === request.nextUrl.searchParams.get("pageId"));
    if (entry.source.kind === "richtext-field") return entry.source.fieldKey === request.nextUrl.searchParams.get("fieldKey") && entry.source.jsonPointer === request.nextUrl.searchParams.get("jsonPointer");
    return true;
  });
  if (!sourceDocument) return NextResponse.json(createApiSuccess({ mentions: [], indexStatus: "ready" }));
  const mentions = findUnlinkedMentions(
    sourceDocument.markdown,
    result.directory,
    200,
    sourceTarget(sourceDocument.source),
  ).slice(0, 100);
  return NextResponse.json(createApiSuccess({ mentions, source: sourceDocument.source, indexStatus: "ready" }));
}

function sourceTarget(source: MarkdownReferenceSource): MarkdownReferenceTarget | undefined {
  if (source.kind === "knowledge-document") {
    return { kind: "document", projectId: source.projectId, docId: source.docId };
  }
  if (source.kind === "page-requirements" || source.kind === "page-convention") {
    return { kind: "page", projectId: source.projectId, pageId: source.pageId };
  }
  return undefined;
}

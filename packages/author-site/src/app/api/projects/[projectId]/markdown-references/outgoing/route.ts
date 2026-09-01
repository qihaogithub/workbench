import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, projectExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  openPersistentMarkdownReferenceIndex,
  resolveMarkdownReferenceWorkspace,
  serializeLinkRecord,
} from "@/lib/markdown-references";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const context = resolveMarkdownReferenceWorkspace(request, projectId, user.userId);
  if (!context) return NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间不可用"), { status: 404 });
  const sourceKind = request.nextUrl.searchParams.get("sourceKind");
  const sourceId = request.nextUrl.searchParams.get("sourceId") || request.nextUrl.searchParams.get("entryId");
  const source = sourceKind === "knowledge-document"
    ? (sourceId ? { kind: "knowledge-document" as const, projectId, workspaceId: context.workspaceId, docId: sourceId } : null)
    : sourceKind === "page-requirements"
      ? (sourceId ? { kind: "page-requirements" as const, projectId, workspaceId: context.workspaceId, pageId: sourceId } : null)
      : sourceKind === "workspace-memory"
        ? { kind: "workspace-memory" as const, projectId, workspaceId: context.workspaceId }
        : sourceKind === "project-convention"
          ? { kind: "project-convention" as const, projectId, workspaceId: context.workspaceId }
          : sourceKind === "page-convention"
            ? (sourceId ? { kind: "page-convention" as const, projectId, workspaceId: context.workspaceId, pageId: sourceId } : null)
            : sourceKind === "design-spec-entry"
              ? (sourceId && request.nextUrl.searchParams.get("specId") ? { kind: "design-spec-entry" as const, projectId, workspaceId: context.workspaceId, specId: request.nextUrl.searchParams.get("specId")!, entryId: sourceId } : null)
              : sourceKind === "config-note"
                ? (request.nextUrl.searchParams.get("fieldKey") ? { kind: "config-note" as const, projectId, workspaceId: context.workspaceId, scope: request.nextUrl.searchParams.get("scope") === "page" ? "page" as const : "project" as const, ...(request.nextUrl.searchParams.get("pageId") ? { pageId: request.nextUrl.searchParams.get("pageId")! } : {}), fieldKey: request.nextUrl.searchParams.get("fieldKey")! } : null)
                : sourceKind === "richtext-field"
                  ? (request.nextUrl.searchParams.get("fieldKey") && request.nextUrl.searchParams.get("jsonPointer") ? { kind: "richtext-field" as const, projectId, workspaceId: context.workspaceId, scope: request.nextUrl.searchParams.get("scope") === "page" ? "page" as const : "project" as const, ...(request.nextUrl.searchParams.get("pageId") ? { pageId: request.nextUrl.searchParams.get("pageId")! } : {}), fieldKey: request.nextUrl.searchParams.get("fieldKey")!, jsonPointer: request.nextUrl.searchParams.get("jsonPointer")! } : null)
                  : null;
  if (!source) return NextResponse.json(createApiError("INVALID_REQUEST", "sourceKind 与 source locator 必填"), { status: 400 });
  const result = openPersistentMarkdownReferenceIndex(context);
  const records = result.status === "ready" ? result.index.outgoing(source).map((record) => serializeLinkRecord(record, result.sourceLabels)) : [];
  const snapshot = result.index.snapshot({ projectId, workspaceId: context.workspaceId });
  result.index.close();
  return NextResponse.json(createApiSuccess({
    records,
    observedWorkspaceId: context.workspaceId,
    observedRevision: snapshot?.authorityRevision ?? context.observedRevision,
    observedRootHash: snapshot?.authorityRootHash ?? context.observedRootHash,
    indexStatus: result.status,
  }));
}

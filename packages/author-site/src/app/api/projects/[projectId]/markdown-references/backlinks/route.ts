import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, projectExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  openPersistentMarkdownReferenceIndex,
  parseTarget,
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
  const target = parseTarget(
    request.nextUrl.searchParams.get("targetKind"),
    request.nextUrl.searchParams.get("targetId"),
    projectId,
  );
  if (!target) return NextResponse.json(createApiError("INVALID_REQUEST", "targetKind 与 targetId 无效"), { status: 400 });
  const result = openPersistentMarkdownReferenceIndex(context);
  const records = result.status === "ready" ? result.index.backlinks(target, { projectId, workspaceId: context.workspaceId }).map((record) => serializeLinkRecord(record, result.sourceLabels)) : [];
  const snapshot = result.index.snapshot({ projectId, workspaceId: context.workspaceId });
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 50) || 50, 1), 100);
  const response = NextResponse.json(createApiSuccess({
    records: records.slice(0, limit),
    observedWorkspaceId: context.workspaceId,
    observedRevision: snapshot?.authorityRevision ?? context.observedRevision,
    observedRootHash: snapshot?.authorityRootHash ?? context.observedRootHash,
    indexStatus: result.status,
  }));
  result.index.close();
  return response;
}

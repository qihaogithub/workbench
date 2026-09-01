import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, projectExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { rebuildPersistentMarkdownReferenceIndex, resolveMarkdownReferenceWorkspace } from "@/lib/markdown-references";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  if (user.role && user.role !== "admin") return NextResponse.json(createApiError("FORBIDDEN", "仅管理员可重建引用索引"), { status: 403 });
  if (!projectExists(projectId)) return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), { status: 404 });
  const context = resolveMarkdownReferenceWorkspace(request, projectId, user.userId);
  if (!context) return NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间不可用"), { status: 404 });
  const result = rebuildPersistentMarkdownReferenceIndex(context);
  const snapshot = result.index.snapshot({ projectId, workspaceId: context.workspaceId });
  result.index.close();
  return NextResponse.json(createApiSuccess({
    rebuilt: true,
    recordCount: snapshot?.records.length || 0,
    observedWorkspaceId: context.workspaceId,
    observedRevision: snapshot?.authorityRevision ?? context.observedRevision,
    observedRootHash: snapshot?.authorityRootHash ?? context.observedRootHash,
    generatedAt: snapshot?.generatedAt,
    indexStatus: "ready",
  }));
}

import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, projectExists } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  openPersistentMarkdownReferenceIndex,
  resolveMarkdownReferenceWorkspace,
  toCandidateList,
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

  const kindParam = request.nextUrl.searchParams.get("kind");
  const kinds = kindParam
    ? kindParam.split(",").filter((kind): kind is "project" | "page" | "document" | "config" => ["project", "page", "document", "config"].includes(kind))
    : undefined;
  const query = request.nextUrl.searchParams.get("q") || "";
  let result: ReturnType<typeof openPersistentMarkdownReferenceIndex>;
  try {
    result = openPersistentMarkdownReferenceIndex(context);
  } catch {
    return NextResponse.json(createApiError("FILE_READ_ERROR", "引用目录暂时不可用"), { status: 503 });
  }
  const candidates = toCandidateList(result, query, kinds);
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 30) || 30, 1), 100);
  const snapshot = result.index.snapshot({ projectId, workspaceId: context.workspaceId });
  result.index.close();
  return NextResponse.json(createApiSuccess({
    candidates: query.trim() ? candidates.slice(0, limit) : candidates,
    observedWorkspaceId: context.workspaceId,
    observedRevision: snapshot?.authorityRevision ?? context.observedRevision,
    observedRootHash: snapshot?.authorityRootHash ?? context.observedRootHash,
    indexStatus: result.status,
  }));
}

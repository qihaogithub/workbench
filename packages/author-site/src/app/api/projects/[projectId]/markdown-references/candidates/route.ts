import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { getCurrentProjectActor } from "@/lib/auth/current-user";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
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
  const actor = await getCurrentProjectActor();
  if (!actor)
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  let result:
    | ReturnType<typeof openPersistentMarkdownReferenceIndex>
    | undefined;
  try {
    const project = getProjectAdminService().getProject(projectId, actor);
    if (!project.ok) return projectAdminResponse(project);
    const context = resolveMarkdownReferenceWorkspace(
      request,
      projectId,
      actor.id,
    );
    if (!context)
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间不可用"),
        { status: 404 },
      );

    const kindParam = request.nextUrl.searchParams.get("kind");
    const kinds = kindParam
      ? kindParam
          .split(",")
          .filter((kind): kind is "project" | "page" | "document" | "config" =>
            ["project", "page", "document", "config"].includes(kind),
          )
      : undefined;
    const query = request.nextUrl.searchParams.get("q") || "";
    result = openPersistentMarkdownReferenceIndex(context);
    const candidates = toCandidateList(result, query, kinds);
    const limit = Math.min(
      Math.max(
        Number(request.nextUrl.searchParams.get("limit") || 30) || 30,
        1,
      ),
      100,
    );
    const snapshot = result.index.snapshot({
      projectId,
      workspaceId: context.workspaceId,
    });
    return NextResponse.json(
      createApiSuccess({
        candidates: query.trim() ? candidates.slice(0, limit) : candidates,
        observedWorkspaceId: context.workspaceId,
        observedRevision:
          snapshot?.authorityRevision ?? context.observedRevision,
        observedRootHash:
          snapshot?.authorityRootHash ?? context.observedRootHash,
        indexStatus: result.status,
      }),
    );
  } catch {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "引用目录暂时不可用"),
      { status: 503 },
    );
  } finally {
    result?.index.close();
  }
}

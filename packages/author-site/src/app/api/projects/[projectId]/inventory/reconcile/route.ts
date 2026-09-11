import { NextRequest, NextResponse } from "next/server";
import { createApiError, createApiSuccess, getSessionMeta, isSessionExpired } from "@/lib/fs-utils";
import { getCurrentUserFromRequest, toProjectAdminActor } from "@/lib/auth/current-user";
import { getProjectAdminService } from "@/lib/project-admin-service";
import { resolveMarkdownReferenceWorkspace } from "@/lib/markdown-references";
import { reconcileProjectInventory } from "@/lib/agent/project-inventory";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200): NextResponse {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const user = await getCurrentUserFromRequest(request);
  if (!user) return response(createApiError("UNAUTHORIZED", "未登录"), 401);
  if (user.role !== "admin" && user.role !== "editor") return response(createApiError("FORBIDDEN", "无权刷新项目清单"), 403);
  if (!getProjectAdminService().getProject(projectId, toProjectAdminActor(user)).ok) return response(createApiError("FORBIDDEN", "清单不可用"), 403);
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const session = getSessionMeta(sessionId);
  if (!session || session.userId !== user.id || session.demoId !== projectId || !session.workspaceId) return response(createApiError("SESSION_NOT_FOUND", "编辑会话不可用"), 404);
  if (isSessionExpired(session)) return response(createApiError("SESSION_EXPIRED", "编辑会话已过期"), 410);
  const context = resolveMarkdownReferenceWorkspace(request, projectId, user.id);
  if (!context) return response(createApiError("FILE_READ_ERROR", "项目工作空间不可用"), 404);
  try {
    return response(createApiSuccess(await reconcileProjectInventory(context, sessionId)));
  } catch (error) {
    if (error instanceof Error && error.message === "INVENTORY_STALE") {
      return response(createApiError("CONFLICT", "工作空间在刷新期间发生变化，请重试"), 409);
    }
    return response(createApiError("SERVICE_UNAVAILABLE", "清单刷新服务暂不可用"), 503);
  }
}

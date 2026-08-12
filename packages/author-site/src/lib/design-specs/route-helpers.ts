import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError } from "@/lib/fs-utils";
import { getLiveWorkspaceRouteContext, isLiveWorkspacePath } from "@/lib/live-workspace-route-context";

/** 设计规范 API 路由统一上下文 */
export interface DesignSpecRouteContext {
  workingDir: string;
  sessionId?: string;
  projectId?: string;
  live: boolean;
  liveContext: ReturnType<typeof getLiveWorkspaceRouteContext>;
}

/**
 * 校验登录 + 解析 workingDir，返回统一上下文。
 * 失败时返回 NextResponse（401/403/400）。
 */
export async function resolveDesignSpecContext(
  request: NextRequest,
): Promise<{ ctx: DesignSpecRouteContext } | { response: NextResponse }> {
  const token = getAuthCookie();
  if (!token) {
    return { response: NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 }) };
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return {
      response: NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 }),
    };
  }

  const workingDir = request.nextUrl.searchParams.get("workingDir");
  if (!workingDir) {
    return {
      response: NextResponse.json(createApiError("INVALID_REQUEST", "workingDir 必填"), { status: 400 }),
    };
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId") || undefined;
  const projectId = request.nextUrl.searchParams.get("projectId") || undefined;

  if (!fs.existsSync(workingDir)) {
    return {
      response: NextResponse.json(createApiError("INVALID_REQUEST", "工作空间路径不存在"), { status: 400 }),
    };
  }

  const live = isLiveWorkspacePath(workingDir);
  const liveContext = live
    ? getLiveWorkspaceRouteContext({ request, workingDir, projectId: projectId || null })
    : null;

  return {
    ctx: {
      workingDir: path.resolve(workingDir),
      sessionId,
      projectId,
      live,
      liveContext,
    },
  };
}
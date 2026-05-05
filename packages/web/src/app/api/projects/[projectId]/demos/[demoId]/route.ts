import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  readDemoPageMeta,
  writeDemoPageMeta,
  deleteWorkspaceDemoPage,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  getDemoDirPath,
  readFoldersMeta,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import fs from "fs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const { projectId, demoId } = params;

    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const workspacePath = path.join(getProjectPath(projectId), "workspace");
    const meta = readDemoPageMeta(workspacePath, demoId);
    if (!meta) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(createApiSuccess(meta));
  } catch (error) {
    console.error("Error getting demo page meta:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取页面元信息失败"),
      { status: 500 },
    );
  }
}

interface SessionContext {
  workspaceId: string;
  workspacePath: string;
}

async function resolveSessionWorkspace(
  request: NextRequest,
  projectId: string,
): Promise<
  | { ok: true; ctx: SessionContext }
  | { ok: false; response: NextResponse }
> {
  const token = getAuthCookie();
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      }),
    };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("UNAUTHORIZED", "登录已过期"),
        { status: 401 },
      ),
    };
  }

  const url = new URL(request.url);
  let sessionId = url.searchParams.get("sessionId") ?? undefined;
  if (!sessionId) {
    try {
      const body = await request.clone().json();
      if (body && typeof body.sessionId === "string") {
        sessionId = body.sessionId;
      }
    } catch {
      // 忽略：DELETE 等可能没有 body
    }
  }

  if (!sessionId) {
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      ),
    };
  }

  if (!sessionExists(sessionId)) {
    return {
      ok: false,
      response: NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      }),
    };
  }

  const meta = getSessionMeta(sessionId);
  if (!meta) {
    return {
      ok: false,
      response: NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      }),
    };
  }

  if (meta.userId && meta.userId !== payload.userId) {
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      ),
    };
  }

  if (meta.demoId !== projectId) {
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 与 projectId 不匹配"),
        { status: 400 },
      ),
    };
  }

  if (isSessionExpired(meta)) {
    return {
      ok: false,
      response: NextResponse.json(createApiError("SESSION_EXPIRED"), {
        status: 410,
      }),
    };
  }

  if (!meta.workspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      ),
    };
  }

  const wsPath = findWorkspacePath(meta.workspaceId);
  if (!wsPath) {
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      ),
    };
  }

  return { ok: true, ctx: { workspaceId: meta.workspaceId, workspacePath: wsPath } };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const { projectId, demoId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const ctx = await resolveSessionWorkspace(request, projectId);
    if (!ctx.ok) return ctx.response;

    const body = await request.json().catch(() => ({}));
    const { name, order, parentId } = body as { name?: string; order?: number; parentId?: string | null };

    if (name === undefined && order === undefined && parentId === undefined) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "name、order 或 parentId 至少需提供一个"),
        { status: 400 },
      );
    }

    const demoDir = getDemoDirPath(ctx.ctx.workspacePath, demoId);
    if (!fs.existsSync(demoDir)) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }

    if (parentId !== undefined && parentId !== null) {
      const folders = readFoldersMeta(ctx.ctx.workspacePath);
      const folder = folders.find(f => f.id === parentId);
      if (!folder) {
        return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
          status: 404,
        });
      }
    }

    const patch: { name?: string; order?: number; parentId?: string | null } = {};
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (!trimmed) {
        return NextResponse.json(
          createApiError("INVALID_REQUEST", "name 不能为空"),
          { status: 400 },
        );
      }
      patch.name = trimmed;
    }
    if (typeof order === "number" && Number.isFinite(order)) {
      patch.order = order;
    }
    if (parentId !== undefined) {
      patch.parentId = parentId;
    }

    const updated = writeDemoPageMeta(ctx.ctx.workspacePath, demoId, patch);
    return NextResponse.json(createApiSuccess(updated));
  } catch (error) {
    console.error("Error patching demo page meta:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新页面元数据失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const { projectId, demoId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const ctx = await resolveSessionWorkspace(request, projectId);
    if (!ctx.ok) return ctx.response;

    const demoDir = getDemoDirPath(ctx.ctx.workspacePath, demoId);
    if (!fs.existsSync(demoDir)) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }

    const success = deleteWorkspaceDemoPage(ctx.ctx.workspaceId, demoId);
    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "删除页面失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error deleting demo page:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除页面失败"),
      { status: 500 },
    );
  }
}

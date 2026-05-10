import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  readFoldersMeta,
  updateDemoFolder,
  deleteDemoFolder,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  isDescendant,
  getFolderDepth,
  listDemoPages,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

async function resolveSessionWorkspace(
  request: NextRequest,
  projectId: string,
): Promise<
  | { ok: true; workspacePath: string }
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

  let sessionId: string | undefined;
  const url = new URL(request.url);
  sessionId = url.searchParams.get("sessionId") ?? undefined;
  if (!sessionId) {
    try {
      const body = await request.clone().json();
      if (body && typeof body.sessionId === "string") {
        sessionId = body.sessionId;
      }
    } catch {
      // ignore
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

  return { ok: true, workspacePath: wsPath };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; folderId: string } },
) {
  try {
    const { projectId, folderId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const ctx = await resolveSessionWorkspace(request, projectId);
    if (!ctx.ok) return ctx.response;

    const body = await request.json().catch(() => ({}));
    const { name, parentId, order } = body as {
      name?: string;
      parentId?: string | null;
      order?: number;
    };

    if (name === undefined && parentId === undefined && order === undefined) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "name、parentId 或 order 至少需提供一个"),
        { status: 400 },
      );
    }

    const folders = readFoldersMeta(ctx.workspacePath);
    const existing = folders.find(f => f.id === folderId);
    if (!existing) {
      return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
        status: 404,
      });
    }

    if (parentId !== undefined && parentId !== null) {
      const targetParent = folders.find(f => f.id === parentId);
      if (!targetParent) {
        return NextResponse.json(createApiError("FOLDER_NOT_FOUND", "目标父文件夹不存在"), {
          status: 404,
        });
      }
      if (isDescendant(folderId, parentId, folders)) {
        return NextResponse.json(createApiError("CIRCULAR_REFERENCE"), {
          status: 400,
        });
      }
      if (getFolderDepth(folderId, folders) + 1 > 3) {
        return NextResponse.json(createApiError("FOLDER_DEPTH_EXCEEDED"), {
          status: 400,
        });
      }
    }

    const updated = updateDemoFolder(ctx.workspacePath, folderId, { name, parentId, order });
    if (!updated) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "更新文件夹失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(updated));
  } catch (error) {
    console.error("Error updating folder:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新文件夹失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; folderId: string } },
) {
  try {
    const { projectId, folderId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const ctx = await resolveSessionWorkspace(request, projectId);
    if (!ctx.ok) return ctx.response;

    const folders = readFoldersMeta(ctx.workspacePath);
    const existing = folders.find(f => f.id === folderId);
    if (!existing) {
      return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
        status: 404,
      });
    }

    const url = new URL(request.url);
    const deleteContents = url.searchParams.get("deleteContents") === "true";

    const result = deleteDemoFolder(ctx.workspacePath, folderId, deleteContents);
    if (!result.success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "删除文件夹失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess({ deletedPageIds: result.deletedPageIds ?? [] }));
  } catch (error) {
    console.error("Error deleting folder:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除文件夹失败"),
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  createApiSuccess,
  createApiError,
  findWorkspacePath,
  getWorkspaceMultiDemoFiles,
  getWorkspaceDemoPageFiles,
  updateWorkspaceDemoFiles,
  listWorkspaceDemoPages,
  readFoldersMeta,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const sessionMeta = getSessionMeta(sessionId);
    if (!sessionMeta) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    if (isSessionExpired(sessionMeta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), {
        status: 410,
      });
    }

    if (!sessionMeta.workspaceId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      );
    }

    const workspacePath = findWorkspacePath(sessionMeta.workspaceId) ?? "";
    const multi = getWorkspaceMultiDemoFiles(sessionMeta.workspaceId);
    if (!multi) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "读取 Session 文件失败"),
        { status: 500 },
      );
    }

    const demoPages = listWorkspaceDemoPages(sessionMeta.workspaceId);
    const demoFolders = readFoldersMeta(workspacePath);

    return NextResponse.json(
      createApiSuccess({
        ...multi,
        demoPages,
        demoFolders,
        workspacePath,
      }),
    );
  } catch (error) {
    console.error("Error getting session files:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取 Session 文件失败"),
      { status: 500 },
    );
  }
}

/**
 * 兼容层：PUT /api/sessions/[sessionId]/files
 * 旧前端按单页面格式保存（code + schema）。
 * 多页面架构下，将数据保存到 workspace 的第一个页面作为兼容。
 * Stage 4 完成后，前端应改用 PUT /api/sessions/[sessionId]/files/[demoId]。
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const { sessionId } = params;

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const meta = getSessionMeta(sessionId);
    if (!meta) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    if (meta.userId && meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      );
    }

    if (isSessionExpired(meta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), {
        status: 410,
      });
    }

    if (!meta.workspaceId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { code, schema } = body as { code?: string; schema?: string };

    if (code === undefined && schema === undefined) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "code 或 schema 至少需提供一个"),
        { status: 400 },
      );
    }

    // 查找第一个页面作为保存目标
    const demoPages = listWorkspaceDemoPages(meta.workspaceId);
    if (demoPages.length === 0) {
      return NextResponse.json(
        createApiError("DEMO_PAGE_NOT_FOUND", "工作空间中暂无页面"),
        { status: 404 },
      );
    }

    const targetDemoId = demoPages[0].id;
    console.warn(
      `[兼容层警告] PUT /api/sessions/${sessionId}/files 未指定 demoId，` +
      `默认保存到第一个页面 ${targetDemoId}。` +
      `前端应改用 PUT /api/sessions/${sessionId}/files/{demoId}`,
    );
    const success = updateWorkspaceDemoFiles(meta.workspaceId, targetDemoId, {
      code,
      schema,
    });

    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "更新页面文件失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error updating session files:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新 Session 文件失败"),
      { status: 500 },
    );
  }
}

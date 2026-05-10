import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  listDemoPages,
  getDemoDirPath,
  createWorkspaceDemoPage,
  copyWorkspaceDemoPage,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  readFoldersMeta,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { type PreviewSize, extractPreviewSize } from "@/lib/preview-size";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const { projectId } = params;

    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const workspacePath = path.join(getProjectPath(projectId), "workspace");
    const includeSchema = request.nextUrl.searchParams.get("includeSchema") === "true";
    const demoPages = listDemoPages(workspacePath);

    if (includeSchema) {
      const enrichedPages = demoPages.map((page) => {
        const demoDir = getDemoDirPath(workspacePath, page.id);
        const schemaPath = path.join(demoDir, "config.schema.json");
        let schema: string | undefined;
        let previewSize: PreviewSize | undefined;
        if (fs.existsSync(schemaPath)) {
          schema = fs.readFileSync(schemaPath, "utf-8");
          previewSize = extractPreviewSize(schema);
        }
        return { ...page, previewSize, schema };
      });
      return NextResponse.json(createApiSuccess({ demoPages: enrichedPages }));
    }

    return NextResponse.json(createApiSuccess({ demoPages }));
  } catch (error) {
    console.error("Error listing demo pages:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取页面列表失败"),
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
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

    const { projectId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, name, sourcePageId, parentId } = body as { sessionId?: string; name?: string; sourcePageId?: string; parentId?: string | null };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        createApiError(
          "INVALID_REQUEST",
          "sessionId 参数必填（创建页面必须在编辑会话中进行）",
        ),
        { status: 400 },
      );
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "name 参数必填且不能为空"),
        { status: 400 },
      );
    }

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

    if (meta.demoId !== projectId) {
      return NextResponse.json(
        createApiError(
          "INVALID_REQUEST",
          "sessionId 与 projectId 不匹配",
        ),
        { status: 400 },
      );
    }

    if (isSessionExpired(meta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), {
        status: 410,
      });
    }

    if (!meta.workspaceId) {
      return NextResponse.json(
        createApiError(
          "INVALID_REQUEST",
          "Session 未绑定 workspaceId，无法创建页面",
        ),
        { status: 400 },
      );
    }

    const wsPath = findWorkspacePath(meta.workspaceId);
    if (!wsPath) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    }

    if (parentId) {
      const folders = readFoldersMeta(wsPath);
      const folder = folders.find(f => f.id === parentId);
      if (!folder) {
        return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
          status: 404,
        });
      }
    }

    const demoMeta = sourcePageId
      ? copyWorkspaceDemoPage(meta.workspaceId, sourcePageId, name.trim())
      : createWorkspaceDemoPage(meta.workspaceId, name.trim(), parentId);
    if (!demoMeta) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "创建页面失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(demoMeta), { status: 201 });
  } catch (error) {
    console.error("Error creating demo page:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建页面失败"),
      { status: 500 },
    );
  }
}

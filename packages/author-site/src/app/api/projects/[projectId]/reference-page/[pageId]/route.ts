import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  type DemoFolderMeta,
  type DemoPageMeta,
  type WorkspaceTree,
} from "@workbench/shared";

function readWorkspaceTreeSnapshot(
  workspacePath: string,
): WorkspaceTree | null {
  const treePath = path.join(workspacePath, "workspace-tree.json");
  if (!fs.existsSync(treePath)) return null;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(treePath, "utf-8"),
    ) as Partial<WorkspaceTree>;
    return {
      folders: Array.isArray(parsed.folders)
        ? (parsed.folders as DemoFolderMeta[])
        : [],
      pages: Array.isArray(parsed.pages)
        ? (parsed.pages as DemoPageMeta[])
        : [],
    };
  } catch {
    return null;
  }
}

function readFileIfExists(filePath: string): string | undefined {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {
    // ignore
  }
  return undefined;
}

function readJsonIfExists(filePath: string): Record<string, unknown> | undefined {
  const content = readFileIfExists(filePath);
  if (content) {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } },
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

    const { projectId, pageId } = params;
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    if (!sessionId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
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
        createApiError("FORBIDDEN", "无权访问其他用户的 Session"),
        { status: 403 },
      );
    }

    if (meta.demoId !== projectId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 与 projectId 不匹配"),
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
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      );
    }

    // 读取目标项目 workspace-tree，查找引用页元数据
    const wsPath = findWorkspacePath(meta.workspaceId);
    if (!wsPath) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    }

    const tree = readWorkspaceTreeSnapshot(wsPath);
    if (!tree) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间数据不可读"),
        { status: 500 },
      );
    }

    const referencePage = tree.pages.find((p) => p.id === pageId);
    if (!referencePage || !referencePage.reference) {
      return NextResponse.json(
        createApiError("DEMO_PAGE_NOT_FOUND", "页面不存在或不是引用页"),
        { status: 404 },
      );
    }

    const { sourceProjectId, sourcePageId } = referencePage.reference;

    // 读取源项目 workspace-tree
    const sourceProjectPath = getProjectPath(sourceProjectId);
    const sourceWorkspacePath = path.join(sourceProjectPath, "workspace");
    const sourceTree = readWorkspaceTreeSnapshot(sourceWorkspacePath);
    if (!sourceTree) {
      return NextResponse.json(
        createApiError("PROJECT_NOT_FOUND", "源项目工作空间数据不可读"),
        { status: 404 },
      );
    }

    const sourcePage = sourceTree.pages.find((p) => p.id === sourcePageId);
    if (!sourcePage) {
      return NextResponse.json(
        createApiError("DEMO_PAGE_NOT_FOUND", "源页面不存在"),
        { status: 404 },
      );
    }

    // 读取源页面文件内容
    const demoDir = path.join(sourceWorkspacePath, "demos", sourcePageId);

    return NextResponse.json(
      createApiSuccess({
        code: readFileIfExists(path.join(demoDir, "index.tsx")),
        schema: readFileIfExists(path.join(demoDir, "config.schema.json")),
        configData: readJsonIfExists(
          path.join(sourceWorkspacePath, "project.config.values.json"),
        ),
        runtimeType: sourcePage.runtimeType,
        prototypeHtml: readFileIfExists(path.join(demoDir, "prototype.html")),
        prototypeCss: readFileIfExists(path.join(demoDir, "prototype.css")),
        prototypeMeta: readJsonIfExists(
          path.join(demoDir, "prototype.meta.json"),
        ),
        sketchScene: readFileIfExists(
          path.join(demoDir, "sketch.scene.json"),
        ),
        sketchMeta: readJsonIfExists(path.join(demoDir, "sketch.meta.json")),
      }),
    );
  } catch (error) {
    console.error("Error reading reference page:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取引用页面失败"),
      { status: 500 },
    );
  }
}
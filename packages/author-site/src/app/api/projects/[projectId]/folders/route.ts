import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  DemoFolderMeta,
  DemoPageMeta,
  WorkspaceTree,
} from "@workbench/shared";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  readFoldersMeta,
  createDemoFolder,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  getFolderDepth,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

function hashText(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readWorkspaceTreeSnapshot(
  workspacePath: string,
): { content: string; tree: WorkspaceTree } | null {
  const treePath = path.join(workspacePath, "workspace-tree.json");
  if (!fs.existsSync(treePath)) return null;
  try {
    const content = fs.readFileSync(treePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<WorkspaceTree>;
    return {
      content,
      tree: {
        folders: Array.isArray(parsed.folders)
          ? (parsed.folders as DemoFolderMeta[])
          : [],
        pages: Array.isArray(parsed.pages)
          ? (parsed.pages as DemoPageMeta[])
          : [],
      },
    };
  } catch {
    return null;
  }
}

function createWorkspaceTreePutOperation(input: {
  previousContent: string;
  tree: WorkspaceTree;
}): WorkspaceMutationOperation {
  return {
    type: "put_text",
    path: "workspace-tree.json",
    content: JSON.stringify(input.tree, null, 2),
    expectedHash: hashText(input.previousContent),
  };
}

function createFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createMutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    createApiError("FILE_WRITE_ERROR", error.message, {
      authorityCode: error.code,
    }),
    { status: error.status },
  );
}

export async function GET(
  _request: NextRequest,
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
    const folders = readFoldersMeta(workspacePath);

    return NextResponse.json(createApiSuccess({ folders }));
  } catch (error) {
    console.error("Error listing folders:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取文件夹列表失败"),
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
    const { sessionId, name, parentId } = body as {
      sessionId?: string;
      name?: string;
      parentId?: string | null;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
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

    const wsPath = findWorkspacePath(meta.workspaceId);
    if (!wsPath) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    }

    if (parentId) {
      const liveWorkspace = isLiveWorkspacePath(wsPath);
      const treeSnapshot = liveWorkspace
        ? readWorkspaceTreeSnapshot(wsPath)
        : null;
      if (liveWorkspace && !treeSnapshot) {
        return NextResponse.json(
          createApiError(
            "FILE_WRITE_ERROR",
            "live Workspace 缺少有效 workspace-tree.json",
          ),
          { status: 409 },
        );
      }
      const folders = treeSnapshot?.tree.folders ?? readFoldersMeta(wsPath);
      const parent = folders.find((f) => f.id === parentId);
      if (!parent) {
        return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
          status: 404,
        });
      }
      if (getFolderDepth(parentId, folders) >= 3) {
        return NextResponse.json(createApiError("FOLDER_DEPTH_EXCEEDED"), {
          status: 400,
        });
      }
    }

    const liveWorkspace = isLiveWorkspacePath(wsPath);
    const treeSnapshot = liveWorkspace
      ? readWorkspaceTreeSnapshot(wsPath)
      : null;
    if (liveWorkspace && !treeSnapshot) {
      return NextResponse.json(
        createApiError(
          "FILE_WRITE_ERROR",
          "live Workspace 缺少有效 workspace-tree.json",
        ),
        { status: 409 },
      );
    }

    if (liveWorkspace && treeSnapshot) {
      const sameParent = treeSnapshot.tree.folders.filter(
        (folder) => (folder.parentId ?? null) === (parentId ?? null),
      );
      const folder: DemoFolderMeta = {
        id: createFolderId(),
        name: name.trim() || "新建文件夹",
        parentId: parentId ?? null,
        order:
          sameParent.length > 0
            ? Math.max(...sameParent.map((item) => item.order)) + 1
            : 0,
      };
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: meta.workspaceId,
        sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "create_demo_folder",
        operations: [
          createWorkspaceTreePutOperation({
            previousContent: treeSnapshot.content,
            tree: {
              folders: [...treeSnapshot.tree.folders, folder],
              pages: treeSnapshot.tree.pages,
            },
          }),
        ],
      });
      return NextResponse.json(createApiSuccess(folder), { status: 201 });
    }

    // Branch/non-live workspace: direct file write is expected behavior. Live workspace writes go through Authority above.
    const folder = createDemoFolder(wsPath, name.trim(), parentId ?? undefined);
    if (!folder) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "创建文件夹失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(folder), { status: 201 });
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error creating folder:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建文件夹失败"),
      { status: 500 },
    );
  }
}

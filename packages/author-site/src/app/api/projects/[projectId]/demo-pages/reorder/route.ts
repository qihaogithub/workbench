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
  reorderDemoPages,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
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

function applyReorderToTree(
  tree: WorkspaceTree,
  pageUpdates: Array<{ id: string; order: number; parentId: string | null }>,
  folderUpdates?: Array<{ id: string; order: number; parentId: string | null }>,
): WorkspaceTree {
  const pages = tree.pages.map((page) => {
    const patch = pageUpdates.find((item) => item.id === page.id);
    return patch
      ? { ...page, order: patch.order, parentId: patch.parentId }
      : page;
  });
  const folders = folderUpdates
    ? tree.folders.map((folder) => {
        const patch = folderUpdates.find((item) => item.id === folder.id);
        return patch
          ? { ...folder, order: patch.order, parentId: patch.parentId }
          : folder;
      })
    : tree.folders;
  return { folders, pages };
}

function createMutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    createApiError("FILE_WRITE_ERROR", error.message, {
      authorityCode: error.code,
    }),
    { status: error.status },
  );
}

export async function PATCH(
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
    const { sessionId, pages, folders } = body as {
      sessionId?: string;
      pages?: Array<{ id: string; order: number; parentId: string | null }>;
      folders?: Array<{ id: string; order: number; parentId: string | null }>;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      );
    }

    if (!pages || !Array.isArray(pages)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "pages 参数必填"),
        { status: 400 },
      );
    }

    if (
      !pages.every(
        (page) =>
          page &&
          typeof page.id === "string" &&
          typeof page.order === "number" &&
          Number.isFinite(page.order) &&
          (typeof page.parentId === "string" || page.parentId === null),
      )
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "pages 参数格式无效"),
        { status: 400 },
      );
    }

    if (
      folders !== undefined &&
      (!Array.isArray(folders) ||
        !folders.every(
          (folder) =>
            folder &&
            typeof folder.id === "string" &&
            typeof folder.order === "number" &&
            Number.isFinite(folder.order) &&
            (typeof folder.parentId === "string" || folder.parentId === null),
        ))
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "folders 参数格式无效"),
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
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    }

    if (isLiveWorkspacePath(wsPath)) {
      const treeSnapshot = readWorkspaceTreeSnapshot(wsPath);
      if (!treeSnapshot) {
        return NextResponse.json(
          createApiError(
            "FILE_WRITE_ERROR",
            "live Workspace 缺少有效 workspace-tree.json",
          ),
          { status: 409 },
        );
      }
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: meta.workspaceId,
        sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "reorder_demo_pages",
        operations: [
          createWorkspaceTreePutOperation({
            previousContent: treeSnapshot.content,
            tree: applyReorderToTree(treeSnapshot.tree, pages, folders),
          }),
        ],
      });
      return NextResponse.json(createApiSuccess(null));
    }

    // Branch/non-live workspace: direct file write is expected behavior. Live workspace writes go through Authority above.
    const success = reorderDemoPages(wsPath, pages, folders);
    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "批量排序失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error reordering demo pages:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "批量排序失败"),
      { status: 500 },
    );
  }
}

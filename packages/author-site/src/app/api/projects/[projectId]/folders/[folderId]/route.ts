import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  DemoFolderMeta,
  DemoPageMeta,
  WorkspaceTree,
} from "@workbench/shared";
import {
  isManagedWorkspaceResource,
  type WorkspaceMutationOperation,
} from "@workbench/shared/contracts";
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

function createManagedPageDeleteOperations(
  workspacePath: string,
  pageIds: string[],
): WorkspaceMutationOperation[] {
  const pageIdSet = new Set(pageIds);
  const operations: WorkspaceMutationOperation[] = [];
  const demosDir = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosDir)) return operations;
  for (const pageId of pageIdSet) {
    const pageDir = path.join(demosDir, pageId);
    if (!fs.existsSync(pageDir)) continue;
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        const relativePath = path
          .relative(workspacePath, fullPath)
          .split(path.sep)
          .join("/");
        if (!isManagedWorkspaceResource(relativePath)) continue;
        const content = fs.readFileSync(fullPath, "utf-8");
        operations.push({
          type: "delete_path",
          path: relativePath,
          expectedHash: hashText(content),
        });
      }
    };
    walk(pageDir);
  }
  return operations.sort((a, b) => {
    const aPath = "path" in a ? a.path : a.from;
    const bPath = "path" in b ? b.path : b.from;
    return aPath.localeCompare(bPath);
  });
}

function createMutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    createApiError("FILE_WRITE_ERROR", error.message, {
      authorityCode: error.code,
    }),
    { status: error.status },
  );
}

async function resolveSessionWorkspace(
  request: NextRequest,
  projectId: string,
): Promise<
  | { ok: true; sessionId: string; workspaceId: string; workspacePath: string }
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

  return {
    ok: true,
    sessionId,
    workspaceId: meta.workspaceId,
    workspacePath: wsPath,
  };
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
        createApiError(
          "INVALID_REQUEST",
          "name、parentId 或 order 至少需提供一个",
        ),
        { status: 400 },
      );
    }

    const liveWorkspace = isLiveWorkspacePath(ctx.workspacePath);
    const treeSnapshot = liveWorkspace
      ? readWorkspaceTreeSnapshot(ctx.workspacePath)
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

    const folders =
      treeSnapshot?.tree.folders ?? readFoldersMeta(ctx.workspacePath);
    const existing = folders.find((f) => f.id === folderId);
    if (!existing) {
      return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
        status: 404,
      });
    }

    if (parentId !== undefined && parentId !== null) {
      const targetParent = folders.find((f) => f.id === parentId);
      if (!targetParent) {
        return NextResponse.json(
          createApiError("FOLDER_NOT_FOUND", "目标父文件夹不存在"),
          {
            status: 404,
          },
        );
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

    if (liveWorkspace && treeSnapshot) {
      const index = treeSnapshot.tree.folders.findIndex(
        (folder) => folder.id === folderId,
      );
      if (index === -1) {
        return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
          status: 404,
        });
      }
      const nextFolders = [...treeSnapshot.tree.folders];
      const updated: DemoFolderMeta = {
        ...nextFolders[index],
        ...(name !== undefined && { name: name.trim() }),
        ...(parentId !== undefined && { parentId }),
        ...(order !== undefined && { order }),
      };
      nextFolders[index] = updated;
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: ctx.workspaceId,
        sessionId: ctx.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "update_demo_folder",
        operations: [
          createWorkspaceTreePutOperation({
            previousContent: treeSnapshot.content,
            tree: {
              folders: nextFolders,
              pages: treeSnapshot.tree.pages,
            },
          }),
        ],
      });
      return NextResponse.json(createApiSuccess(updated));
    }

    // Branch/non-live workspace: direct file write is expected behavior. Live workspace writes go through Authority above.
    const updated = updateDemoFolder(ctx.workspacePath, folderId, {
      name,
      parentId,
      order,
    });
    if (!updated) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "更新文件夹失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(updated));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
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

    const liveWorkspace = isLiveWorkspacePath(ctx.workspacePath);
    const treeSnapshot = liveWorkspace
      ? readWorkspaceTreeSnapshot(ctx.workspacePath)
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

    const folders =
      treeSnapshot?.tree.folders ?? readFoldersMeta(ctx.workspacePath);
    const existing = folders.find((f) => f.id === folderId);
    if (!existing) {
      return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
        status: 404,
      });
    }

    const url = new URL(request.url);
    const deleteContents = url.searchParams.get("deleteContents") === "true";

    if (liveWorkspace && treeSnapshot) {
      const deletedPageIds: string[] = [];
      let nextFolders: DemoFolderMeta[];
      let nextPages: DemoPageMeta[];

      if (deleteContents) {
        const descendantFolderIds = new Set<string>();
        const collectDescendants = (parentId: string) => {
          for (const folder of treeSnapshot.tree.folders) {
            if (folder.parentId === parentId) {
              descendantFolderIds.add(folder.id);
              collectDescendants(folder.id);
            }
          }
        };
        collectDescendants(folderId);
        descendantFolderIds.add(folderId);
        for (const page of treeSnapshot.tree.pages) {
          if (page.parentId && descendantFolderIds.has(page.parentId)) {
            deletedPageIds.push(page.id);
          }
        }
        nextFolders = treeSnapshot.tree.folders.filter(
          (folder) => !descendantFolderIds.has(folder.id),
        );
        nextPages = treeSnapshot.tree.pages.filter(
          (page) => !deletedPageIds.includes(page.id),
        );
      } else {
        const fallbackParentId = existing.parentId ?? null;
        nextFolders = treeSnapshot.tree.folders
          .filter((folder) => folder.id !== folderId)
          .map((folder) =>
            folder.parentId === folderId
              ? { ...folder, parentId: fallbackParentId }
              : folder,
          );
        nextPages = treeSnapshot.tree.pages.map((page) =>
          page.parentId === folderId
            ? { ...page, parentId: fallbackParentId }
            : page,
        );
      }

      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: ctx.workspaceId,
        sessionId: ctx.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "delete_demo_folder",
        operations: [
          ...(deleteContents
            ? createManagedPageDeleteOperations(
                ctx.workspacePath,
                deletedPageIds,
              )
            : []),
          createWorkspaceTreePutOperation({
            previousContent: treeSnapshot.content,
            tree: {
              folders: nextFolders,
              pages: nextPages,
            },
          }),
        ],
      });
      // P2: clean up empty page directories after Authority delete_path operations
      if (deleteContents) {
        const demosDir = path.join(ctx.workspacePath, "demos");
        for (const pageId of deletedPageIds) {
          fs.rmSync(path.join(demosDir, pageId), { recursive: true, force: true });
        }
      }
      return NextResponse.json(createApiSuccess({ deletedPageIds }));
    }

    // Branch/non-live workspace: direct file write is expected behavior. Live workspace writes go through Authority above.
    const result = deleteDemoFolder(
      ctx.workspacePath,
      folderId,
      deleteContents,
    );
    if (!result.success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "删除文件夹失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(
      createApiSuccess({ deletedPageIds: result.deletedPageIds ?? [] }),
    );
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error deleting folder:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除文件夹失败"),
      { status: 500 },
    );
  }
}

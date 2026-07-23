import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import {
  isManagedWorkspaceResource,
  type WorkspaceMutationOperation,
} from "@workbench/shared/contracts";
import type {
  DemoFolderMeta,
  DemoPageMeta,
  WorkspaceTree,
} from "@workbench/shared";
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
  createDeletedWorkspaceDemoPageSnapshot,
  readFoldersMeta,
  restoreDeletedWorkspaceDemoPageSnapshot,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";
import fs from "fs";

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
  demoId: string,
): WorkspaceMutationOperation[] {
  const pageDir = getDemoDirPath(workspacePath, demoId);
  const operations: WorkspaceMutationOperation[] = [];
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
  return operations.sort((a, b) => {
    const aPath = "path" in a ? a.path : a.from;
    const bPath = "path" in b ? b.path : b.from;
    return aPath.localeCompare(bPath);
  });
}

function getDeletedPageSnapshotPath(
  workspacePath: string,
  snapshotId: string,
): string {
  return path.join(
    workspacePath,
    ".workbench",
    "undo",
    "deleted-pages",
    snapshotId,
  );
}

function isSafeSnapshotId(snapshotId: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(snapshotId) && !snapshotId.includes("..");
}

function readDeletedPageSnapshotMeta(
  snapshotPath: string,
): DemoPageMeta | null {
  try {
    const raw = fs.readFileSync(path.join(snapshotPath, "page.json"), "utf-8");
    const parsed = JSON.parse(raw) as Partial<DemoPageMeta>;
    if (!parsed.id || !parsed.name) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      routeKey: parsed.routeKey,
      order: parsed.order ?? 0,
      parentId: parsed.parentId ?? null,
      runtimeType: parsed.runtimeType ?? "high-fidelity-react",
    };
  } catch {
    return null;
  }
}

function createManagedPageRestoreOperations(input: {
  snapshotPath: string;
  demoId: string;
}): WorkspaceMutationOperation[] {
  const snapshotDemoDir = path.join(input.snapshotPath, "demos", input.demoId);
  const operations: WorkspaceMutationOperation[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativeFromSnapshotDemo = path
        .relative(snapshotDemoDir, fullPath)
        .split(path.sep)
        .join("/");
      const targetResourcePath = `demos/${input.demoId}/${relativeFromSnapshotDemo}`;
      if (!isManagedWorkspaceResource(targetResourcePath)) continue;
      operations.push({
        type: "put_text",
        path: targetResourcePath,
        content: fs.readFileSync(fullPath, "utf-8"),
        expectedAbsent: true,
      });
    }
  };
  walk(snapshotDemoDir);
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
  sessionId: string;
  workspaceId: string;
  workspacePath: string;
}

async function resolveSessionWorkspace(
  request: NextRequest,
  projectId: string,
): Promise<
  { ok: true; ctx: SessionContext } | { ok: false; response: NextResponse }
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

  return {
    ok: true,
    ctx: { sessionId, workspaceId: meta.workspaceId, workspacePath: wsPath },
  };
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
    const { name, order, parentId } = body as {
      name?: string;
      order?: number;
      parentId?: string | null;
    };

    if (name === undefined && order === undefined && parentId === undefined) {
      return NextResponse.json(
        createApiError(
          "INVALID_REQUEST",
          "name、order 或 parentId 至少需提供一个",
        ),
        { status: 400 },
      );
    }

    const demoDir = getDemoDirPath(ctx.ctx.workspacePath, demoId);
    if (!fs.existsSync(demoDir)) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }

    const liveWorkspace = isLiveWorkspacePath(ctx.ctx.workspacePath);
    const treeSnapshot = liveWorkspace
      ? readWorkspaceTreeSnapshot(ctx.ctx.workspacePath)
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

    if (parentId !== undefined && parentId !== null) {
      const folders =
        treeSnapshot?.tree.folders ?? readFoldersMeta(ctx.ctx.workspacePath);
      const folder = folders.find((f) => f.id === parentId);
      if (!folder) {
        return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
          status: 404,
        });
      }
    }

    const patch: { name?: string; order?: number; parentId?: string | null } =
      {};
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

    if (liveWorkspace && treeSnapshot) {
      const pageIndex = treeSnapshot.tree.pages.findIndex(
        (page) => page.id === demoId,
      );
      if (pageIndex === -1) {
        return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
          status: 404,
        });
      }
      const updated: DemoPageMeta = {
        ...treeSnapshot.tree.pages[pageIndex],
        ...patch,
      };
      const nextPages = [...treeSnapshot.tree.pages];
      nextPages[pageIndex] = updated;
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: ctx.ctx.workspaceId,
        sessionId: ctx.ctx.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "update_demo_page_meta",
        operations: [
          createWorkspaceTreePutOperation({
            previousContent: treeSnapshot.content,
            tree: {
              folders: treeSnapshot.tree.folders,
              pages: nextPages,
            },
          }),
        ],
      });
      return NextResponse.json(createApiSuccess(updated));
    }

    // Branch/non-live workspace: direct file write is expected behavior. Live workspace writes go through Authority above.
    const updated = writeDemoPageMeta(ctx.ctx.workspacePath, demoId, patch);
    return NextResponse.json(createApiSuccess(updated));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error patching demo page meta:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新页面元数据失败"),
      { status: 500 },
    );
  }
}

export async function POST(
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
    const { action, snapshotId } = body as {
      action?: string;
      snapshotId?: string;
    };

    if (action !== "restoreDeletedSnapshot" || !snapshotId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "恢复页面参数不完整"),
        { status: 400 },
      );
    }
    if (!isSafeSnapshotId(snapshotId)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "snapshotId 参数无效"),
        { status: 400 },
      );
    }

    const liveWorkspace = isLiveWorkspacePath(ctx.ctx.workspacePath);
    const treeSnapshot = liveWorkspace
      ? readWorkspaceTreeSnapshot(ctx.ctx.workspacePath)
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
      const snapshotPath = getDeletedPageSnapshotPath(
        ctx.ctx.workspacePath,
        snapshotId,
      );
      const snapshotDemoDir = path.join(snapshotPath, "demos", demoId);
      if (!fs.existsSync(snapshotPath) || !fs.existsSync(snapshotDemoDir)) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "恢复页面失败"),
          { status: 404 },
        );
      }
      const page = readDeletedPageSnapshotMeta(snapshotPath);
      if (!page || page.id !== demoId) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "恢复页面失败"),
          { status: 500 },
        );
      }
      const targetDemoDir = getDemoDirPath(ctx.ctx.workspacePath, demoId);
      if (
        fs.existsSync(targetDemoDir) ||
        treeSnapshot.tree.pages.some((item) => item.id === demoId)
      ) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "恢复页面失败"),
          { status: 409 },
        );
      }
      if (
        page.parentId &&
        !treeSnapshot.tree.folders.some((folder) => folder.id === page.parentId)
      ) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "恢复页面失败"),
          { status: 409 },
        );
      }
      const operations = [
        ...createManagedPageRestoreOperations({
          snapshotPath,
          demoId,
        }),
        createWorkspaceTreePutOperation({
          previousContent: treeSnapshot.content,
          tree: {
            folders: treeSnapshot.tree.folders,
            pages: [...treeSnapshot.tree.pages, page],
          },
        }),
      ];
      if (operations.length === 1) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "恢复页面失败"),
          { status: 500 },
        );
      }
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: ctx.ctx.workspaceId,
        sessionId: ctx.ctx.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "restore_demo_page",
        operations,
      });
      fs.rmSync(snapshotPath, { recursive: true, force: true });
      return NextResponse.json(createApiSuccess(page));
    }

    // Branch/non-live workspace: direct file write is expected behavior. Live workspace writes go through Authority above.
    const result = restoreDeletedWorkspaceDemoPageSnapshot(
      ctx.ctx.workspaceId,
      demoId,
      snapshotId,
    );
    if (!result.success) {
      const status =
        result.reason === "PAGE_EXISTS" ||
        result.reason === "PARENT_FOLDER_NOT_FOUND"
          ? 409
          : result.reason === "SNAPSHOT_NOT_FOUND"
            ? 404
            : 500;
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "恢复页面失败"),
        { status },
      );
    }

    return NextResponse.json(createApiSuccess(result.page));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error restoring demo page:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "恢复页面失败"),
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

    const liveWorkspace = isLiveWorkspacePath(ctx.ctx.workspacePath);
    const treeSnapshot = liveWorkspace
      ? readWorkspaceTreeSnapshot(ctx.ctx.workspacePath)
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

    if (
      liveWorkspace &&
      treeSnapshot &&
      !treeSnapshot.tree.pages.some((page) => page.id === demoId)
    ) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }

    const snapshot = createDeletedWorkspaceDemoPageSnapshot(
      ctx.ctx.workspaceId,
      demoId,
    );
    if (!snapshot) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "创建页面删除快照失败"),
        { status: 500 },
      );
    }

    if (liveWorkspace && treeSnapshot) {
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: ctx.ctx.workspaceId,
        sessionId: ctx.ctx.sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "delete_demo_page",
        operations: [
          ...createManagedPageDeleteOperations(ctx.ctx.workspacePath, demoId),
          createWorkspaceTreePutOperation({
            previousContent: treeSnapshot.content,
            tree: {
              folders: treeSnapshot.tree.folders,
              pages: treeSnapshot.tree.pages.filter(
                (page) => page.id !== demoId,
              ),
            },
          }),
        ],
      });
      // P2: clean up empty page directory after Authority delete_path operations
      const pageDir = getDemoDirPath(ctx.ctx.workspacePath, demoId);
      fs.rmSync(pageDir, { recursive: true, force: true });
      return NextResponse.json(createApiSuccess(snapshot));
    }

    // Branch/non-live workspace: direct file write is expected behavior. Live workspace writes go through Authority above.
    const success = deleteWorkspaceDemoPage(ctx.ctx.workspaceId, demoId);
    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "删除页面失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(snapshot));
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error deleting demo page:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除页面失败"),
      { status: 500 },
    );
  }
}

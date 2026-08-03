import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  generateDemoPageId,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  type DemoFolderMeta,
  type DemoPageMeta,
  type WorkspaceTree,
} from "@workbench/shared";
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
    const { sourceProjectId, sourcePageIds, sessionId } = body as {
      sourceProjectId?: string;
      sourcePageIds?: string[];
      sessionId?: string;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      );
    }

    if (!sourceProjectId || typeof sourceProjectId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sourceProjectId 参数必填"),
        { status: 400 },
      );
    }

    if (
      !Array.isArray(sourcePageIds) ||
      sourcePageIds.length === 0 ||
      !sourcePageIds.every((id) => typeof id === "string")
    ) {
      return NextResponse.json(
        createApiError(
          "INVALID_REQUEST",
          "sourcePageIds 必须是非空字符串数组",
        ),
        { status: 400 },
      );
    }

    if (!projectExists(sourceProjectId)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "源项目不存在"),
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
        createApiError(
          "INVALID_REQUEST",
          "Session 未绑定 workspaceId",
        ),
        { status: 400 },
      );
    }

    // 读取源项目 workspace-tree，验证 sourcePageIds 都是真实页面
    const sourceProjectPath = getProjectPath(sourceProjectId);
    const sourceWorkspacePath = path.join(sourceProjectPath, "workspace");
    const sourceTree = readWorkspaceTreeSnapshot(sourceWorkspacePath);
    if (!sourceTree) {
      return NextResponse.json(
        createApiError(
          "INVALID_REQUEST",
          "源项目工作空间数据不可读",
        ),
        { status: 400 },
      );
    }

    const sourcePageMap = new Map(
      sourceTree.pages.map((page) => [page.id, page]),
    );

    for (const pageId of sourcePageIds) {
      const sourcePage = sourcePageMap.get(pageId);
      if (!sourcePage) {
        return NextResponse.json(
          createApiError("INVALID_REQUEST", `源页面 ${pageId} 不存在`),
          { status: 400 },
        );
      }
      if (sourcePage.reference) {
        return NextResponse.json(
          createApiError(
            "INVALID_REQUEST",
            `源页面 ${pageId} 是引用页，不能再次引用`,
          ),
          { status: 400 },
        );
      }
    }

    // 读取目标项目 workspace-tree
    const wsPath = findWorkspacePath(meta.workspaceId);
    if (!wsPath) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    }

    const targetTree = readWorkspaceTreeSnapshot(wsPath);
    const existingPages = targetTree?.pages ?? [];
    const existingFolders = targetTree?.folders ?? [];
    const maxOrder =
      existingPages.length > 0
        ? Math.max(...existingPages.map((p) => p.order))
        : -1;

    // 构建引用页元数据
    const newPages: DemoPageMeta[] = [];
    for (let i = 0; i < sourcePageIds.length; i++) {
      const sourcePageId = sourcePageIds[i];
      const sourcePage = sourcePageMap.get(sourcePageId)!;
      const newPageId = generateDemoPageId(sourcePage.name);
      newPages.push({
        id: newPageId,
        name: sourcePage.name,
        order: maxOrder + 1 + i,
        parentId: null,
        runtimeType: sourcePage.runtimeType,
        reference: {
          sourceProjectId,
          sourcePageId,
        },
      });
    }

    // 写入 workspace-tree.json
    const updatedTree: WorkspaceTree = {
      folders: existingFolders,
      pages: [...existingPages, ...newPages],
    };
    const treeContent = JSON.stringify(updatedTree, null, 2);
    const treePath = path.join(wsPath, "workspace-tree.json");

    const isLive = isLiveWorkspacePath(wsPath);
    if (isLive) {
      const previousContent = fs.existsSync(treePath)
        ? fs.readFileSync(treePath, "utf-8")
        : null;
      const operations: WorkspaceMutationOperation[] = [
        {
          type: "put_text",
          path: "workspace-tree.json",
          content: treeContent,
          ...(previousContent === null
            ? { expectedAbsent: true }
            : { expectedHash: hashText(previousContent) }),
        },
      ];
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: meta.workspaceId,
        sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "create_reference_pages",
        operations,
      });
    } else {
      fs.writeFileSync(treePath, treeContent, "utf-8");
    }

    return NextResponse.json(createApiSuccess(newPages), { status: 201 });
  } catch (err) {
    if (err instanceof WorkspaceAuthorityClientError) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", err.message, {
          authorityCode: err.code,
        }),
        { status: err.status },
      );
    }
    console.error("创建引用页失败:", err);
    return NextResponse.json(
      createApiError("INTERNAL_ERROR", "创建引用页失败"),
      { status: 500 },
    );
  }
}
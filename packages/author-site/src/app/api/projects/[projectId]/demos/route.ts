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
  listDemoPages,
  getDemoDirPath,
  createWorkspaceDemoPage,
  copyWorkspaceDemoPage,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  readFoldersMeta,
  generateDemoPageId,
  generateRouteKey,
  DEFAULT_DEMO_CODE,
  DEFAULT_DEMO_SCHEMA,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { isSketchSceneAuthoringEnabled } from "@/lib/authoring-feature-flags";
import { type PreviewSize, extractPreviewSize } from "@/lib/preview-size";
import {
  createDefaultSketchScene,
  type DemoFolderMeta,
  type DemoPageMeta,
  type DemoPageRuntimeType,
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

function createPutTextOperation(input: {
  workspacePath: string;
  resourcePath: string;
  content: string;
  expectedAbsent?: boolean;
}): WorkspaceMutationOperation {
  if (input.expectedAbsent) {
    return {
      type: "put_text",
      path: input.resourcePath,
      content: input.content,
      expectedAbsent: true,
    };
  }
  const absolutePath = path.join(input.workspacePath, input.resourcePath);
  const previousContent = fs.existsSync(absolutePath)
    ? fs.readFileSync(absolutePath, "utf-8")
    : null;
  return {
    type: "put_text",
    path: input.resourcePath,
    content: input.content,
    ...(previousContent === null
      ? { expectedAbsent: true }
      : { expectedHash: hashText(previousContent) }),
  };
}

function createMutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    createApiError("FILE_WRITE_ERROR", error.message, {
      authorityCode: error.code,
    }),
    { status: error.status },
  );
}

function resolveNewPageRuntimeType(
  runtimeType: DemoPageRuntimeType | undefined,
): DemoPageRuntimeType {
  return runtimeType === "high-fidelity-react"
    ? "high-fidelity-react"
    : runtimeType === "sketch-scene"
      ? "sketch-scene"
      : "prototype-html-css";
}

function buildInitialPageOperations(input: {
  workspacePath: string;
  demoId: string;
  runtimeType: DemoPageRuntimeType;
}): WorkspaceMutationOperation[] {
  const operations: WorkspaceMutationOperation[] = [];
  const add = (fileName: string, content: string) => {
    operations.push(
      createPutTextOperation({
        workspacePath: input.workspacePath,
        resourcePath: `demos/${input.demoId}/${fileName}`,
        content,
        expectedAbsent: true,
      }),
    );
  };
  if (input.runtimeType === "sketch-scene") {
    add(
      "sketch.scene.json",
      JSON.stringify(createDefaultSketchScene(), null, 2),
    );
    add(
      "sketch.meta.json",
      JSON.stringify(
        { generatedBy: "author-site", updatedAt: Date.now() },
        null,
        2,
      ),
    );
  } else if (input.runtimeType === "prototype-html-css") {
    add("prototype.html", "<main></main>");
    add("prototype.css", "");
  } else {
    add("index.tsx", DEFAULT_DEMO_CODE);
  }
  add("config.schema.json", DEFAULT_DEMO_SCHEMA);
  return operations;
}

function buildCopyPageOperations(input: {
  workspacePath: string;
  sourcePageId: string;
  demoId: string;
}): WorkspaceMutationOperation[] | null {
  const sourceDir = path.join(input.workspacePath, "demos", input.sourcePageId);
  if (!fs.existsSync(sourceDir)) return null;
  const files = [
    "index.tsx",
    "config.schema.json",
    "prototype.html",
    "prototype.css",
    "prototype.meta.json",
    "sketch.scene.json",
    "sketch.meta.json",
  ];
  const operations: WorkspaceMutationOperation[] = [];
  for (const fileName of files) {
    const sourcePath = path.join(sourceDir, fileName);
    if (!fs.existsSync(sourcePath)) continue;
    operations.push(
      createPutTextOperation({
        workspacePath: input.workspacePath,
        resourcePath: `demos/${input.demoId}/${fileName}`,
        content: fs.readFileSync(sourcePath, "utf-8"),
        expectedAbsent: true,
      }),
    );
  }
  return operations.length > 0 ? operations : null;
}

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
    const includeSchema =
      request.nextUrl.searchParams.get("includeSchema") === "true";
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
    const { sessionId, name, sourcePageId, parentId, runtimeType } = body as {
      sessionId?: string;
      name?: string;
      sourcePageId?: string;
      parentId?: string | null;
      runtimeType?: DemoPageRuntimeType;
    };

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
    if (
      runtimeType !== undefined &&
      runtimeType !== "prototype-html-css" &&
      runtimeType !== "high-fidelity-react" &&
      runtimeType !== "sketch-scene"
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "runtimeType 不合法"),
        { status: 400 },
      );
    }
    if (runtimeType === "sketch-scene" && !isSketchSceneAuthoringEnabled()) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "手绘页面功能暂未在创作端开放"),
        { status: 403 },
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

    const liveWorkspace = isLiveWorkspacePath(wsPath);
    const liveTree = liveWorkspace ? readWorkspaceTreeSnapshot(wsPath) : null;
    const folders = liveTree?.folders ?? readFoldersMeta(wsPath);
    const existingPages = liveTree?.pages ?? listDemoPages(wsPath);

    if (liveWorkspace && !liveTree) {
      return NextResponse.json(
        createApiError(
          "FILE_WRITE_ERROR",
          "live Workspace 缺少有效 workspace-tree.json",
        ),
        { status: 409 },
      );
    }

    if (parentId) {
      const folder = folders.find((f) => f.id === parentId);
      if (!folder) {
        return NextResponse.json(createApiError("FOLDER_NOT_FOUND"), {
          status: 404,
        });
      }
    }

    let demoMeta: DemoPageMeta | null = null;
    if (liveWorkspace && liveTree) {
      const sourceMeta = sourcePageId
        ? existingPages.find((page) => page.id === sourcePageId)
        : null;
      if (sourcePageId && !sourceMeta) {
        return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
          status: 404,
        });
      }
      const effectiveParentId = sourceMeta?.parentId ?? parentId ?? null;
      const sameParent = existingPages.filter(
        (page) => (page.parentId ?? null) === effectiveParentId,
      );
      const nextOrder =
        sameParent.length > 0
          ? Math.max(...sameParent.map((page) => page.order)) + 1
          : 0;
      const demoId = generateDemoPageId(name.trim());
      const resolvedRuntimeType = sourceMeta
        ? sourceMeta.runtimeType
        : resolveNewPageRuntimeType(runtimeType);
      demoMeta = {
        id: demoId,
        name: name.trim(),
        routeKey: generateRouteKey(
          name.trim(),
          existingPages
            .map((page) => page.routeKey)
            .filter(Boolean) as string[],
        ),
        order: nextOrder,
        parentId: effectiveParentId,
        runtimeType: resolvedRuntimeType,
      };
      const operations = sourcePageId
        ? buildCopyPageOperations({
            workspacePath: wsPath,
            sourcePageId,
            demoId,
          })
        : buildInitialPageOperations({
            workspacePath: wsPath,
            demoId,
            runtimeType: resolvedRuntimeType,
          });
      if (!operations) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "创建页面失败"),
          { status: 500 },
        );
      }
      const previousTree = fs.readFileSync(
        path.join(wsPath, "workspace-tree.json"),
        "utf-8",
      );
      operations.push({
        type: "put_text",
        path: "workspace-tree.json",
        content: JSON.stringify(
          {
            folders: liveTree.folders,
            pages: [...liveTree.pages, demoMeta],
          },
          null,
          2,
        ),
        expectedHash: hashText(previousTree),
      });
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: meta.workspaceId,
        sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: sourcePageId ? "copy_demo_page" : "create_demo_page",
        operations,
      });
    } else {
      // Branch/non-live workspace: direct file write is expected behavior.
      // Live workspace writes go through Authority above.
      demoMeta = sourcePageId
        ? copyWorkspaceDemoPage(meta.workspaceId, sourcePageId, name.trim())
        : createWorkspaceDemoPage(
            meta.workspaceId,
            name.trim(),
            parentId,
            runtimeType,
          );
    }
    if (!demoMeta) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "创建页面失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(demoMeta), { status: 201 });
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error creating demo page:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建页面失败"),
      { status: 500 },
    );
  }
}

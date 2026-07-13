import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import type {
  DemoPageRuntimeType,
  PrototypePageMeta,
  WorkspaceTree,
} from "@workbench/shared";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import type { RuntimeValidationResult } from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getDemoDirPath,
  getProjectConfigSchema,
  getSessionMeta,
  getWorkspaceDemoPageFiles,
  isSessionExpired,
  listDemoPages,
  projectExists,
  readDemoPageMeta,
  sessionExists,
  updateWorkspaceDemoFiles,
  writeDemoPageMeta,
} from "@/lib/fs-utils";
import { getProjectAdminService } from "@/lib/project-admin-service";
import { isSketchSceneAuthoringEnabled } from "@/lib/authoring-feature-flags";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import fs from "fs";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

function hashText(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function createPutTextOperation(input: {
  workspacePath: string;
  resourcePath: string;
  content: string;
}): WorkspaceMutationOperation {
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

function updateWorkspaceTreeRuntimeType(input: {
  workspacePath: string;
  demoId: string;
  runtimeType: DemoPageRuntimeType;
}): {
  meta: NonNullable<ReturnType<typeof readDemoPageMeta>>;
  content: string;
} {
  const treePath = path.join(input.workspacePath, "workspace-tree.json");
  if (!fs.existsSync(treePath)) {
    throw new Error("WORKSPACE_TREE_NOT_FOUND");
  }
  const tree = JSON.parse(fs.readFileSync(treePath, "utf-8")) as WorkspaceTree;
  const pageIndex = Array.isArray(tree.pages)
    ? tree.pages.findIndex((page) => page.id === input.demoId)
    : -1;
  if (pageIndex === -1) throw new Error("DEMO_PAGE_NOT_FOUND");
  const nextPage = {
    ...tree.pages[pageIndex],
    runtimeType: input.runtimeType,
  };
  const nextTree: WorkspaceTree = {
    folders: Array.isArray(tree.folders) ? tree.folders : [],
    pages: tree.pages.map((page, index) =>
      index === pageIndex ? nextPage : page,
    ),
  };
  return {
    meta: nextPage,
    content: JSON.stringify(nextTree, null, 2),
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
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

    const { projectId, demoId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const body = await request.json().catch(() => ({}));
    const {
      sessionId,
      targetRuntimeType,
      code,
      schema,
      prototypeHtml,
      prototypeCss,
      prototypeMeta,
      sketchScene,
      sketchMeta,
    } = body as {
      sessionId?: string;
      targetRuntimeType?: DemoPageRuntimeType;
      code?: string;
      schema?: string;
      prototypeHtml?: string;
      prototypeCss?: string;
      prototypeMeta?: unknown;
      sketchScene?: string;
      sketchMeta?: unknown;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      );
    }
    if (
      targetRuntimeType !== "prototype-html-css" &&
      targetRuntimeType !== "high-fidelity-react" &&
      targetRuntimeType !== "sketch-scene"
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "targetRuntimeType 不合法"),
        { status: 400 },
      );
    }
    if (
      targetRuntimeType === "sketch-scene" &&
      !isSketchSceneAuthoringEnabled()
    ) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "手绘页面功能暂未在创作端开放"),
        { status: 403 },
      );
    }
    if (code !== undefined && typeof code !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "code 必须为字符串"),
        { status: 400 },
      );
    }
    if (schema !== undefined && typeof schema !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "schema 必须为字符串"),
        { status: 400 },
      );
    }
    if (prototypeHtml !== undefined && typeof prototypeHtml !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "prototypeHtml 必须为字符串"),
        { status: 400 },
      );
    }
    if (prototypeCss !== undefined && typeof prototypeCss !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "prototypeCss 必须为字符串"),
        { status: 400 },
      );
    }
    if (sketchScene !== undefined && typeof sketchScene !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sketchScene 必须为字符串"),
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
    const demoDir = getDemoDirPath(wsPath, demoId);
    if (!fs.existsSync(demoDir)) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }
    if (typeof schema === "string") {
      const allDemoPages = listDemoPages(wsPath);
      const pageSchemas: Record<string, string> = {};
      for (const page of allDemoPages) {
        if (page.id === demoId) {
          pageSchemas[page.id] = schema;
          continue;
        }
        const otherSchemaPath = path.join(
          getDemoDirPath(wsPath, page.id),
          "config.schema.json",
        );
        if (fs.existsSync(otherSchemaPath)) {
          pageSchemas[page.id] = fs.readFileSync(otherSchemaPath, "utf-8");
        }
      }
      if (!(demoId in pageSchemas)) {
        pageSchemas[demoId] = schema;
      }

      const conflictResult = validateNoSchemaConflictFromStrings(
        getProjectConfigSchema(wsPath),
        pageSchemas,
      );
      if (!conflictResult.ok) {
        return NextResponse.json(
          createApiError(
            "SCHEMA_CONFLICT",
            "页面 Schema 字段与项目级配置冲突",
            { conflicts: conflictResult.conflicts },
          ),
          { status: 400 },
        );
      }
    }

    const currentMeta = readDemoPageMeta(wsPath, demoId);
    const currentFiles = getWorkspaceDemoPageFiles(meta.workspaceId, demoId);
    if (!currentMeta || !currentFiles) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }
    const nextFiles = {
      ...currentFiles,
      code: code ?? currentFiles.code,
      schema: schema ?? currentFiles.schema,
      prototypeHtml: prototypeHtml ?? currentFiles.prototypeHtml,
      prototypeCss: prototypeCss ?? currentFiles.prototypeCss,
      prototypeMeta:
        (prototypeMeta as PrototypePageMeta | undefined) ??
        currentFiles.prototypeMeta,
      sketchScene: sketchScene ?? currentFiles.sketchScene,
      sketchMeta:
        (sketchMeta as Record<string, unknown> | undefined) ??
        currentFiles.sketchMeta,
    };
    const runtimeValidation: RuntimeValidationResult =
      getProjectAdminService().validateDemoPageFilesRuntime(
        demoId,
        targetRuntimeType,
        nextFiles,
      );
    if (!runtimeValidation.ok) {
      return NextResponse.json(
        createApiError(
          "VALIDATION_ERROR",
          "页面类型切换校验失败，已保留原页面内容",
          { runtimeValidation },
        ),
        { status: 422 },
      );
    }

    let updatedMeta;
    if (isLiveWorkspacePath(wsPath)) {
      const operations: WorkspaceMutationOperation[] = [];
      const demoResourcePath = (fileName: string) =>
        `demos/${demoId}/${fileName}`;
      const addTextOperation = (resourcePath: string, content: string) => {
        operations.push(
          createPutTextOperation({
            workspacePath: wsPath,
            resourcePath,
            content,
          }),
        );
      };

      if (
        targetRuntimeType === "high-fidelity-react" &&
        typeof nextFiles.code === "string"
      ) {
        addTextOperation(demoResourcePath("index.tsx"), nextFiles.code);
      }
      if (targetRuntimeType === "prototype-html-css") {
        if (typeof nextFiles.prototypeHtml === "string") {
          addTextOperation(
            demoResourcePath("prototype.html"),
            nextFiles.prototypeHtml,
          );
        }
        if (typeof nextFiles.prototypeCss === "string") {
          addTextOperation(
            demoResourcePath("prototype.css"),
            nextFiles.prototypeCss,
          );
        }
        if (nextFiles.prototypeMeta) {
          addTextOperation(
            demoResourcePath("prototype.meta.json"),
            JSON.stringify(nextFiles.prototypeMeta, null, 2),
          );
        }
      }
      if (targetRuntimeType === "sketch-scene") {
        if (typeof nextFiles.sketchScene === "string") {
          addTextOperation(
            demoResourcePath("sketch.scene.json"),
            nextFiles.sketchScene,
          );
        }
        if (nextFiles.sketchMeta) {
          addTextOperation(
            demoResourcePath("sketch.meta.json"),
            JSON.stringify(nextFiles.sketchMeta, null, 2),
          );
        }
      }
      if (typeof schema === "string") {
        addTextOperation(demoResourcePath("config.schema.json"), schema);
      }
      const treeUpdate = updateWorkspaceTreeRuntimeType({
        workspacePath: wsPath,
        demoId,
        runtimeType: targetRuntimeType,
      });
      addTextOperation("workspace-tree.json", treeUpdate.content);

      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId,
        workspaceId: meta.workspaceId,
        sessionId,
        baseRevision: 0,
        actor: "author-site",
        reason: "switch_demo_page_runtime",
        operations,
      });
      updatedMeta = treeUpdate.meta;
    } else {
      // Branch/non-live workspace: direct file write is expected behavior.
      // Live workspace writes go through Authority above.
      const success = updateWorkspaceDemoFiles(meta.workspaceId, demoId, {
        code:
          targetRuntimeType === "high-fidelity-react"
            ? nextFiles.code
            : undefined,
        schema,
        prototypeHtml:
          targetRuntimeType === "prototype-html-css"
            ? nextFiles.prototypeHtml
            : undefined,
        prototypeCss:
          targetRuntimeType === "prototype-html-css"
            ? nextFiles.prototypeCss
            : undefined,
        prototypeMeta:
          targetRuntimeType === "prototype-html-css"
            ? nextFiles.prototypeMeta
            : undefined,
        sketchScene:
          targetRuntimeType === "sketch-scene"
            ? nextFiles.sketchScene
            : undefined,
        sketchMeta:
          targetRuntimeType === "sketch-scene"
            ? nextFiles.sketchMeta
            : undefined,
      });
      if (!success) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "更新页面文件失败"),
          { status: 500 },
        );
      }
      updatedMeta = writeDemoPageMeta(wsPath, demoId, {
        runtimeType: targetRuntimeType,
      });
    }

    return NextResponse.json(
      createApiSuccess({
        meta: updatedMeta,
        runtimeValidation,
      }),
    );
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError)
      return createMutationErrorResponse(error);
    console.error("Error switching demo page runtime:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "切换页面类型失败"),
      { status: 500 },
    );
  }
}

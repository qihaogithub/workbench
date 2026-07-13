import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { DemoFiles, DemoPageRuntimeType, WorkspaceTree } from "@workbench/shared";
import { createDefaultSketchScene } from "@workbench/shared";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import { ProjectAdminService, type ProjectResourceKind } from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getDataDir,
  getDemoDirPath,
  getProjectConfigSchema,
  getSessionMeta,
  getWorkspaceMeta,
  isSessionExpired,
  listDemoPages,
  markWorkspaceBasedOnVersion,
  sessionExists,
  updateWorkspaceDemoFiles,
} from "@/lib/fs-utils";
import {
  flushAndSyncProjectWorkspace,
  flushWorkspaceBeforeCriticalAction,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import { resolvePageRuntimeType } from "@/lib/workspace-file-utils";
import { commitWorkspaceMutation, WorkspaceAuthorityClientError } from "@/lib/workspace-authority-client";

const DEFAULT_PROTOTYPE_META = {
  width: 390,
  height: 844,
  generatedBy: "project-core",
};
const DEFAULT_SKETCH_META = {
  generatedBy: "project-core",
  updatedAt: 0,
};

async function getAuthenticatedUser() {
  const token = getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

function normalizeKind(kind: string): ProjectResourceKind | null {
  if (
    kind === "page" ||
    kind === "knowledge_document" ||
    kind === "canvas" ||
    kind === "asset" ||
    kind === "project_config"
  ) {
    return kind;
  }
  return null;
}

function projectService() {
  return new ProjectAdminService({ dataDir: getDataDir() });
}

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

function getLiveWorkspacePageRuntime(input: {
  workspacePath: string;
  pageId: string;
}): DemoPageRuntimeType {
  const treePath = path.join(input.workspacePath, "workspace-tree.json");
  if (!fs.existsSync(treePath)) throw new Error("WORKSPACE_TREE_NOT_FOUND");
  const tree = JSON.parse(fs.readFileSync(treePath, "utf-8")) as WorkspaceTree;
  const page = Array.isArray(tree.pages)
    ? tree.pages.find((item) => item.id === input.pageId)
    : null;
  if (!page) throw new Error("DEMO_PAGE_NOT_FOUND");
  return resolvePageRuntimeType(page.runtimeType);
}

function createRestorePageVersionOperations(input: {
  workspacePath: string;
  pageId: string;
  runtimeType: DemoPageRuntimeType;
  files: DemoFiles;
}): WorkspaceMutationOperation[] {
  const operations: WorkspaceMutationOperation[] = [];
  const add = (fileName: string, content: string) => {
    operations.push(createPutTextOperation({
      workspacePath: input.workspacePath,
      resourcePath: `demos/${input.pageId}/${fileName}`,
      content,
    }));
  };

  if (input.runtimeType === "prototype-html-css") {
    add("prototype.html", input.files.prototypeHtml ?? "");
    add("prototype.css", input.files.prototypeCss ?? "");
    add("prototype.meta.json", JSON.stringify(input.files.prototypeMeta ?? DEFAULT_PROTOTYPE_META, null, 2));
  } else if (input.runtimeType === "sketch-scene") {
    add("sketch.scene.json", input.files.sketchScene ?? JSON.stringify(createDefaultSketchScene(), null, 2));
    add("sketch.meta.json", JSON.stringify(input.files.sketchMeta ?? DEFAULT_SKETCH_META, null, 2));
  } else {
    add("index.tsx", input.files.code);
  }
  add("config.schema.json", input.files.schema);
  return operations;
}

function validateRestoredPageSchema(input: {
  workspacePath: string;
  pageId: string;
  schema: string;
}) {
  const allDemoPages = listDemoPages(input.workspacePath);
  const pageSchemas: Record<string, string> = {};
  for (const page of allDemoPages) {
    if (page.id === input.pageId) {
      pageSchemas[page.id] = input.schema;
    } else {
      const otherSchemaPath = path.join(
        getDemoDirPath(input.workspacePath, page.id),
        "config.schema.json",
      );
      if (fs.existsSync(otherSchemaPath)) {
        pageSchemas[page.id] = fs.readFileSync(otherSchemaPath, "utf-8");
      }
    }
  }
  if (!(input.pageId in pageSchemas)) pageSchemas[input.pageId] = input.schema;
  return validateNoSchemaConflictFromStrings(
    getProjectConfigSchema(input.workspacePath),
    pageSchemas,
  );
}

function createMutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    createApiError("FILE_WRITE_ERROR", error.message, { authorityCode: error.code }),
    { status: error.status },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; kind: string; resourceId: string; versionId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const kind = normalizeKind(params.kind);
  if (!kind) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "资源类型不合法"), { status: 400 });
  }
  const result = projectService().resourceVersionGet(
    {
      projectId: params.projectId,
      kind,
      resourceId: params.resourceId,
      versionId: params.versionId,
    },
    {
      id: payload.userId,
      name: payload.username,
      role: "creator",
      source: "author-site",
    },
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("VERSION_NOT_FOUND", result.error?.message ?? "资源版本不存在"),
      { status: result.error?.code === "FORBIDDEN" ? 403 : 404 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; kind: string; resourceId: string; versionId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const kind = normalizeKind(params.kind);
  if (!kind) {
    return NextResponse.json(createApiError("INVALID_REQUEST", "资源类型不合法"), { status: 400 });
  }
  const body = await request.json().catch(() => ({})) as { sessionId?: string; workspaceId?: string };
  const actor = {
    id: payload.userId,
    name: payload.username,
    role: "creator" as const,
    source: "author-site",
  };
  const service = projectService();
  if (kind === "page") {
    const meta = body.sessionId ? getSessionMeta(body.sessionId) : null;
    const restoreWorkspaceId = body.workspaceId || meta?.workspaceId;
    let restoreWorkspacePath: string | null = null;
    let restoreWorkspaceProof:
      | { workspaceId: string; workspaceRevision?: number; workspaceRootHash?: string }
      | undefined;
    if (body.sessionId) {
      if (!sessionExists(body.sessionId) || !meta || meta.demoId !== params.projectId) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
      }
      if (meta.userId && meta.userId !== payload.userId) {
        return NextResponse.json(createApiError("FORBIDDEN", "无权操作其他用户的 Session"), { status: 403 });
      }
      if (isSessionExpired(meta)) {
        return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
      }
    }
    if (restoreWorkspaceId) {
      const workspaceMeta = getWorkspaceMeta(restoreWorkspaceId);
      if (!workspaceMeta || workspaceMeta.projectId !== params.projectId || workspaceMeta.status === "archived") {
        return NextResponse.json(
          createApiError("WORKSPACE_STALE", "当前工作区已过期，请刷新项目后重试"),
          { status: 409 },
        );
      }
      restoreWorkspacePath = findWorkspacePath(restoreWorkspaceId);
      if (!restoreWorkspacePath) {
        return NextResponse.json(
          createApiError("WORKSPACE_STALE", "当前工作区已过期，请刷新项目后重试"),
          { status: 409 },
        );
      }
    }

    if (restoreWorkspaceId && restoreWorkspacePath && isLiveWorkspacePath(restoreWorkspacePath)) {
      if (!body.sessionId) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND", "恢复 live Workspace 版本需要有效 Session"), { status: 404 });
      }
      try {
        await flushWorkspaceBeforeCriticalAction({
          projectId: params.projectId,
          workspaceId: restoreWorkspaceId,
          sessionId: body.sessionId,
        });
      } catch (error) {
        const flushError = getWorkspaceFlushErrorResponse(error);
        return NextResponse.json(
          createApiError(flushError.code, flushError.message),
          { status: flushError.status },
        );
      }

      const versionResult = service.resourceVersionGet(
        {
          projectId: params.projectId,
          kind: "page",
          resourceId: params.resourceId,
          versionId: params.versionId,
        },
        actor,
      );
      if (!versionResult.ok || !versionResult.data?.content) {
        return NextResponse.json(
          createApiError("VERSION_NOT_FOUND", versionResult.error?.message ?? "页面版本不存在"),
          { status: versionResult.error?.code === "FORBIDDEN" ? 403 : 404 },
        );
      }
      const files = versionResult.data.content as DemoFiles;
      const conflictResult = validateRestoredPageSchema({
        workspacePath: restoreWorkspacePath,
        pageId: params.resourceId,
        schema: files.schema,
      });
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

      try {
        const runtimeType = getLiveWorkspacePageRuntime({
          workspacePath: restoreWorkspacePath,
          pageId: params.resourceId,
        });
        await commitWorkspaceMutation({
          mutationId: crypto.randomUUID(),
          projectId: params.projectId,
          workspaceId: restoreWorkspaceId,
          sessionId: body.sessionId,
          baseRevision: 0,
          actor: "author-site",
          reason: "restore_page_version",
          operations: createRestorePageVersionOperations({
            workspacePath: restoreWorkspacePath,
            pageId: params.resourceId,
            runtimeType,
            files,
          }),
        });
      } catch (error) {
        if (error instanceof WorkspaceAuthorityClientError) return createMutationErrorResponse(error);
        throw error;
      }
      return NextResponse.json(createApiSuccess({
        success: true,
        newVersionId: params.versionId,
        restoredAt: Date.now(),
        files,
      }));
    }

    if (body.sessionId) {
      try {
        const synced = await flushAndSyncProjectWorkspace({
          projectId: params.projectId,
          workspaceId: restoreWorkspaceId,
          sessionId: body.sessionId,
        });
        if (restoreWorkspaceId) {
          restoreWorkspaceProof = {
            workspaceId: restoreWorkspaceId,
            workspaceRevision: synced.canonicalRevision,
            workspaceRootHash: synced.canonicalRootHash,
          };
        }
      } catch (error) {
        const flushError = getWorkspaceFlushErrorResponse(error);
        return NextResponse.json(
          createApiError(flushError.code, flushError.message),
          { status: flushError.status },
        );
      }
    }

    const pageResult = service.restorePageVersion(params.projectId, params.resourceId, params.versionId, actor, {
      sessionId: body.sessionId,
      workspaceId: restoreWorkspaceProof?.workspaceId,
      workspaceRevision: restoreWorkspaceProof?.workspaceRevision,
      workspaceRootHash: restoreWorkspaceProof?.workspaceRootHash,
    });
    if (!pageResult.ok || !pageResult.data) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", pageResult.error?.message ?? "恢复页面版本失败"),
        { status: 500 },
      );
    }
    if (restoreWorkspaceId) {
      const workspaceUpdated = updateWorkspaceDemoFiles(
        restoreWorkspaceId,
        params.resourceId,
        pageResult.data.files,
      );
      if (!workspaceUpdated) {
        return NextResponse.json(createApiError("FILE_WRITE_ERROR", "同步 Session Workspace 失败"), { status: 500 });
      }
      if (!markWorkspaceBasedOnVersion(restoreWorkspaceId, pageResult.data.newVersionId)) {
        return NextResponse.json(createApiError("FILE_WRITE_ERROR", "更新 Workspace 版本基线失败"), { status: 500 });
      }
    }
    return NextResponse.json(createApiSuccess(pageResult.data));
  }
  let restoreWorkspaceProof:
    | { workspaceId: string; workspaceRevision?: number; workspaceRootHash?: string }
    | undefined;
  if (body.sessionId && body.workspaceId) {
    try {
      const synced = await flushAndSyncProjectWorkspace({
        projectId: params.projectId,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
      });
      restoreWorkspaceProof = {
        workspaceId: body.workspaceId,
        workspaceRevision: synced.canonicalRevision,
        workspaceRootHash: synced.canonicalRootHash,
      };
    } catch (error) {
      const flushError = getWorkspaceFlushErrorResponse(error);
      return NextResponse.json(
        createApiError(flushError.code, flushError.message),
        { status: flushError.status },
      );
    }
  }
  const result = service.resourceRestore(
    {
      projectId: params.projectId,
      kind,
      resourceId: params.resourceId,
      versionId: params.versionId,
      sessionId: body.sessionId,
      workspaceId: restoreWorkspaceProof?.workspaceId ?? body.workspaceId,
      workspaceRevision: restoreWorkspaceProof?.workspaceRevision,
      workspaceRootHash: restoreWorkspaceProof?.workspaceRootHash,
    },
    actor,
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", result.error?.message ?? "恢复资源版本失败"),
      { status: 500 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

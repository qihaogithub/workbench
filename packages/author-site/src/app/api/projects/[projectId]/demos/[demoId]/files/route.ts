import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  getDemoDirPath,
  updateWorkspaceDemoFiles,
  getProjectConfigSchema,
  listDemoPages,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";
import fs from "fs";

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
    const { sessionId, code, schema } = body as {
      sessionId?: string;
      code?: string;
      schema?: string;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      );
    }

    if (code === undefined && schema === undefined) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "code 或 schema 至少需提供一个"),
        { status: 400 },
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

    // Schema 冲突校验：仅当本次 PUT 修改 schema 时进行
    if (typeof schema === "string") {
      const allDemoPages = listDemoPages(wsPath);
      const pageSchemas: Record<string, string> = {};

      for (const page of allDemoPages) {
        if (page.id === demoId) {
          pageSchemas[page.id] = schema;
        } else {
          const otherSchemaPath = path.join(
            getDemoDirPath(wsPath, page.id),
            "config.schema.json",
          );
          if (fs.existsSync(otherSchemaPath)) {
            pageSchemas[page.id] = fs.readFileSync(otherSchemaPath, "utf-8");
          }
        }
      }

      if (!(demoId in pageSchemas)) {
        pageSchemas[demoId] = schema;
      }

      const projectSchemaStr = getProjectConfigSchema(wsPath);
      const conflictResult = validateNoSchemaConflictFromStrings(
        projectSchemaStr,
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

    const bodyWithSketch = body as {
      sketchScene?: string;
      sketchMeta?: unknown;
    };
    if (
      bodyWithSketch.sketchScene !== undefined &&
      typeof bodyWithSketch.sketchScene !== "string"
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sketchScene 必须为字符串"),
        { status: 400 },
      );
    }

    if (isLiveWorkspacePath(wsPath)) {
      const operations: WorkspaceMutationOperation[] = [];
      const addTextOperation = (fileName: string, content: string) => {
        operations.push(
          createPutTextOperation({
            workspacePath: wsPath,
            resourcePath: `demos/${demoId}/${fileName}`,
            content,
          }),
        );
      };

      if (typeof code === "string") addTextOperation("index.tsx", code);
      if (typeof schema === "string")
        addTextOperation("config.schema.json", schema);
      if (typeof bodyWithSketch.sketchScene === "string") {
        addTextOperation("sketch.scene.json", bodyWithSketch.sketchScene);
      }
      if (bodyWithSketch.sketchMeta !== undefined) {
        addTextOperation(
          "sketch.meta.json",
          JSON.stringify(bodyWithSketch.sketchMeta, null, 2),
        );
      }

      try {
        await commitWorkspaceMutation({
          mutationId: crypto.randomUUID(),
          projectId,
          workspaceId: meta.workspaceId,
          sessionId,
          baseRevision: 0,
          actor: "author-site",
          reason: "update_demo_page_files",
          operations,
        });
      } catch (error) {
        if (error instanceof WorkspaceAuthorityClientError)
          return createMutationErrorResponse(error);
        throw error;
      }
    } else {
      // Branch/non-live workspace: direct file write is expected behavior.
      // Live workspace writes go through Authority above.
      const success = updateWorkspaceDemoFiles(meta.workspaceId, demoId, {
        code,
        schema,
        sketchScene: bodyWithSketch.sketchScene,
        sketchMeta: bodyWithSketch.sketchMeta as
          | Record<string, unknown>
          | undefined,
      });
      if (!success) {
        return NextResponse.json(
          createApiError("FILE_WRITE_ERROR", "更新页面文件失败"),
          { status: 500 },
        );
      }
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error updating demo page files:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新页面文件失败"),
      { status: 500 },
    );
  }
}

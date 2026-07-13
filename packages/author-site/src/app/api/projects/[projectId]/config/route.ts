import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";
import {
  createApiSuccess,
  createApiError,
  projectExists,
  getProjectPath,
  getProjectConfigSchema,
  saveProjectConfigSchema,
  deleteProjectConfigSchema,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  listDemoPages,
  getDemoDirPath,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import {
  commitWorkspaceMutation,
  createTextWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

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
    const schema = getProjectConfigSchema(workspacePath);

    return NextResponse.json(
      createApiSuccess({
        schema: schema ?? null,
        exists: schema !== undefined,
      }),
    );
  } catch (error) {
    console.error("Error getting project config:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取项目配置失败"),
      { status: 500 },
    );
  }
}

interface SessionContext {
  workspaceId: string;
  workspacePath: string;
}

async function resolveSessionWorkspace(
  request: NextRequest,
  projectId: string,
  sessionId: string | undefined,
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
    ctx: { workspaceId: meta.workspaceId, workspacePath: wsPath },
  };
}

function collectPageSchemas(workspacePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pages = listDemoPages(workspacePath);
  for (const page of pages) {
    const schemaPath = path.join(
      getDemoDirPath(workspacePath, page.id),
      "config.schema.json",
    );
    if (fs.existsSync(schemaPath)) {
      result[page.id] = fs.readFileSync(schemaPath, "utf-8");
    }
  }
  return result;
}

function hashText(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
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
  { params }: { params: { projectId: string } },
) {
  try {
    const { projectId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, schema } = body as {
      sessionId?: string;
      schema?: string;
    };

    if (typeof schema !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "schema 参数必填且为字符串"),
        { status: 400 },
      );
    }

    const ctx = await resolveSessionWorkspace(request, projectId, sessionId);
    if (!ctx.ok) return ctx.response;
    const resolvedSessionId = sessionId;
    if (!resolvedSessionId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      );
    }

    const pageSchemas = collectPageSchemas(ctx.ctx.workspacePath);
    const conflictResult = validateNoSchemaConflictFromStrings(
      schema,
      pageSchemas,
    );

    if (!conflictResult.ok) {
      return NextResponse.json(
        createApiError("SCHEMA_CONFLICT", "项目级 Schema 与页面级字段冲突", {
          conflicts: conflictResult.conflicts,
        }),
        { status: 400 },
      );
    }

    if (isLiveWorkspacePath(ctx.ctx.workspacePath)) {
      const configPath = path.join(
        ctx.ctx.workspacePath,
        "project.config.schema.json",
      );
      const previousContent = fs.existsSync(configPath)
        ? fs.readFileSync(configPath, "utf-8")
        : null;
      try {
        await commitWorkspaceMutation(
          createTextWorkspaceMutation({
            projectId,
            workspaceId: ctx.ctx.workspaceId,
            sessionId: resolvedSessionId,
            path: "project.config.schema.json",
            content: schema,
            previousContent,
            reason: "update_project_config_schema",
          }),
        );
      } catch (error) {
        if (error instanceof WorkspaceAuthorityClientError)
          return createMutationErrorResponse(error);
        throw error;
      }
    } else {
      // Branch/non-live workspace: direct file write is expected behavior.
      // Live workspace writes go through Authority above.
      saveProjectConfigSchema(ctx.ctx.workspacePath, schema);
    }

    return NextResponse.json(createApiSuccess({ schema, exists: true }));
  } catch (error) {
    console.error("Error updating project config:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新项目配置失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const url = new URL(request.url);
    let sessionId = url.searchParams.get("sessionId") ?? undefined;
    if (!sessionId) {
      try {
        const body = await request.clone().json();
        if (body && typeof body.sessionId === "string") {
          sessionId = body.sessionId;
        }
      } catch {
        // 忽略 body 解析失败
      }
    }

    const ctx = await resolveSessionWorkspace(request, projectId, sessionId);
    if (!ctx.ok) return ctx.response;
    const resolvedSessionId = sessionId;
    if (!resolvedSessionId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      );
    }

    let removed: boolean;
    if (isLiveWorkspacePath(ctx.ctx.workspacePath)) {
      const configPath = path.join(
        ctx.ctx.workspacePath,
        "project.config.schema.json",
      );
      if (!fs.existsSync(configPath)) {
        removed = false;
      } else {
        const previousContent = fs.readFileSync(configPath, "utf-8");
        const operations: WorkspaceMutationOperation[] = [
          {
            type: "delete_path",
            path: "project.config.schema.json",
            expectedHash: hashText(previousContent),
          },
        ];
        try {
          await commitWorkspaceMutation({
            mutationId: crypto.randomUUID(),
            projectId,
            workspaceId: ctx.ctx.workspaceId,
            sessionId: resolvedSessionId,
            baseRevision: 0,
            actor: "author-site",
            reason: "delete_project_config_schema",
            operations,
          });
        } catch (error) {
          if (error instanceof WorkspaceAuthorityClientError)
            return createMutationErrorResponse(error);
          throw error;
        }
        removed = true;
      }
    } else {
      // Branch/non-live workspace: direct file write is expected behavior.
      // Live workspace writes go through Authority above.
      removed = deleteProjectConfigSchema(ctx.ctx.workspacePath);
    }
    return NextResponse.json(createApiSuccess({ removed, exists: false }));
  } catch (error) {
    console.error("Error deleting project config:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除项目配置失败"),
      { status: 500 },
    );
  }
}

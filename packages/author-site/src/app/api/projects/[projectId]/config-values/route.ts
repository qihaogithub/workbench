import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getProjectConfigValues,
  getProjectPath,
  getSessionMeta,
  isSessionExpired,
  projectExists,
  saveProjectConfigValues,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { updateWorkspaceTimestamp } from "@/lib/workspace-manager";

interface SessionContext {
  workspaceId: string;
  workspacePath: string;
}

function isPlainConfigObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveSessionWorkspace(
  projectId: string,
  sessionId: string | undefined,
): Promise<
  | { ok: true; ctx: SessionContext }
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

  const workspacePath = findWorkspacePath(meta.workspaceId);
  if (!workspacePath) {
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      ),
    };
  }

  return { ok: true, ctx: { workspaceId: meta.workspaceId, workspacePath } };
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
    const values = getProjectConfigValues(workspacePath);
    return NextResponse.json(
      createApiSuccess({
        values: values ?? {},
        exists: values !== undefined,
      }),
    );
  } catch (error) {
    console.error("Error getting project config values:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取项目配置值失败"),
      { status: 500 },
    );
  }
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
    const { sessionId, values } = body as {
      sessionId?: string;
      values?: unknown;
    };

    if (!isPlainConfigObject(values)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "values 参数必填且为对象"),
        { status: 400 },
      );
    }

    const ctx = await resolveSessionWorkspace(projectId, sessionId);
    if (!ctx.ok) return ctx.response;

    saveProjectConfigValues(ctx.ctx.workspacePath, values);
    updateWorkspaceTimestamp(ctx.ctx.workspaceId);
    return NextResponse.json(createApiSuccess({ values, exists: true }));
  } catch (error) {
    console.error("Error updating project config values:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新项目配置值失败"),
      { status: 500 },
    );
  }
}

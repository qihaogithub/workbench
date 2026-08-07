import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
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
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  resolvePageRequirementRefs,
  type ResolvedPageRequirementRef,
} from "@workbench/shared";
import { isLiveWorkspacePath } from "@/lib/live-workspace-route-context";
import {
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

const REQUIREMENTS_MAX_LENGTH = 20000;

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

function readRequirements(wsPath: string, demoId: string): string {
  const reqPath = path.join(
    getDemoDirPath(wsPath, demoId),
    "requirements.md",
  );
  return fs.existsSync(reqPath) ? fs.readFileSync(reqPath, "utf-8") : "";
}

function readPageSchema(wsPath: string, demoId: string): string | undefined {
  const schemaPath = path.join(getDemoDirPath(wsPath, demoId), "config.schema.json");
  return fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf-8") : undefined;
}

async function authorize(
  params: { projectId: string; demoId: string },
  sessionId: string | undefined,
): Promise<
  | { ok: true; workspaceId: string; sessionId: string }
  | { ok: false; response: NextResponse }
> {
  const token = getAuthCookie();
  if (!token)
    return {
      ok: false,
      response: NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      }),
    };
  const payload = await verifyToken(token);
  if (!payload)
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("UNAUTHORIZED", "登录已过期"),
        { status: 401 },
      ),
    };

  const { projectId } = params;
  if (!projectExists(projectId))
    return {
      ok: false,
      response: NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      }),
    };

  if (!sessionId || typeof sessionId !== "string")
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      ),
    };
  if (!sessionExists(sessionId))
    return {
      ok: false,
      response: NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      }),
    };
  const meta = getSessionMeta(sessionId);
  if (!meta)
    return {
      ok: false,
      response: NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      }),
    };
  if (meta.userId && meta.userId !== payload.userId)
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      ),
    };
  if (meta.demoId !== projectId)
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 与 projectId 不匹配"),
        { status: 400 },
      ),
    };
  if (isSessionExpired(meta))
    return {
      ok: false,
      response: NextResponse.json(createApiError("SESSION_EXPIRED"), {
        status: 410,
      }),
    };
  if (!meta.workspaceId)
    return {
      ok: false,
      response: NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      ),
    };
  return { ok: true, workspaceId: meta.workspaceId, sessionId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId") ?? undefined;
    const auth = await authorize(params, sessionId);
    if (!auth.ok) return auth.response;
    const { projectId, demoId } = params;

    const wsPath = findWorkspacePath(auth.workspaceId);
    if (!wsPath)
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    const demoDir = getDemoDirPath(wsPath, demoId);
    if (!fs.existsSync(demoDir))
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });

    const requirements = readRequirements(wsPath, demoId);
    const schema = readPageSchema(wsPath, demoId);
    const refs: ResolvedPageRequirementRef[] = resolvePageRequirementRefs(
      requirements,
      schema,
    );
    return NextResponse.json(
      createApiSuccess({ requirements, refs, projectId, demoId }),
    );
  } catch (error) {
    console.error("Error reading page requirements:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取页面配置要求失败"),
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId, requirements } = body as {
      sessionId?: string;
      requirements?: string;
    };
    const auth = await authorize(params, sessionId);
    if (!auth.ok) return auth.response;
    const { projectId, demoId } = params;

    if (typeof requirements !== "string")
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "requirements 必须为字符串"),
        { status: 400 },
      );
    if (requirements.length > REQUIREMENTS_MAX_LENGTH)
      return NextResponse.json(
        createApiError(
          "INVALID_REQUEST",
          `配置要求内容不能超过 ${REQUIREMENTS_MAX_LENGTH} 字符`,
        ),
        { status: 400 },
      );

    const wsPath = findWorkspacePath(auth.workspaceId);
    if (!wsPath)
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    const demoDir = getDemoDirPath(wsPath, demoId);
    if (!fs.existsSync(demoDir))
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });

    const resourcePath = `demos/${demoId}/requirements.md`;
    if (isLiveWorkspacePath(wsPath)) {
      try {
        await commitWorkspaceMutation({
          mutationId: crypto.randomUUID(),
          projectId,
          workspaceId: auth.workspaceId,
          sessionId: auth.sessionId,
          baseRevision: 0,
          actor: "author-site",
          reason: "update_page_requirements",
          operations: [
            createPutTextOperation({
              workspacePath: wsPath,
              resourcePath,
              content: requirements,
            }),
          ],
        });
      } catch (error) {
        if (error instanceof WorkspaceAuthorityClientError)
          return createMutationErrorResponse(error);
        throw error;
      }
    } else {
      fs.writeFileSync(
        path.join(demoDir, "requirements.md"),
        requirements,
        "utf-8",
      );
    }

    const schema = readPageSchema(wsPath, demoId);
    const refs: ResolvedPageRequirementRef[] = resolvePageRequirementRefs(
      requirements,
      schema,
    );
    return NextResponse.json(createApiSuccess({ requirements, refs }));
  } catch (error) {
    console.error("Error updating page requirements:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新页面配置要求失败"),
      { status: 500 },
    );
  }
}
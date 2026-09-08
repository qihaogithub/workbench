import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAgentClient } from "@/lib/agent-client";
import {
  createApiSuccess,
  createApiError,
  getSessionMeta,
  findWorkspacePath,
  getWorkspaceMeta,
  getProjectConfigSchema,
  getProjectConfigValues,
  listWorkspaceDemoPages,
  readFoldersMeta,
  readProjectMeta,
} from "@/lib/fs-utils";
import {
  archiveActiveSession,
  bindEditSessionRole,
  createEditSession,
  ensureSessionUsesProjectActiveWorkspace,
  findActiveSession,
  touchSessionActivity,
} from "@/lib/session-manager";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  pushSessionExternalAuthToAgent,
  pushSessionModelConfigToAgent,
  pushSessionAuthorizationToAgent,
} from "@/lib/agent-providers";
import { readExternalAuthSessionConfigWithRefresh } from "@/lib/external-auth";
import { getModelConfig } from "@/lib/model-config";
import { readUserBackendProvidersConfig } from "@/lib/user-model-config";
import { findUserById, type UserRole } from "@/lib/user";
import { parseVisibilityRules } from "@workbench/shared";
import { getConversationService } from "@/lib/conversation";

function createSessionBootstrap(input: {
  sessionId: string;
  projectId: string;
  workspaceId: string | null;
  workspaceScope: "live" | "branch" | "snapshot-source" | "legacy";
  workspacePath: string;
  activePageId?: string;
  userRole: UserRole;
}) {
  const project = readProjectMeta(input.projectId);
  const demoPages = input.workspaceId
    ? listWorkspaceDemoPages(input.workspaceId)
    : [];
  const demoFolders = input.workspacePath
    ? readFoldersMeta(input.workspacePath)
    : [];
  const requestedPageExists = input.activePageId
    ? demoPages.some((page) => page.id === input.activePageId)
    : false;
  const activePageId = requestedPageExists
    ? input.activePageId!
    : demoPages[0]?.id ?? null;
  let visibilityRules: ReturnType<typeof parseVisibilityRules> | undefined;
  const visibilityRulesPath = input.workspacePath
    ? path.join(input.workspacePath, "project.visibility-rules.json")
    : null;
  if (visibilityRulesPath && fs.existsSync(visibilityRulesPath)) {
    try {
      visibilityRules = parseVisibilityRules(
        JSON.parse(fs.readFileSync(visibilityRulesPath, "utf-8")),
      );
    } catch {
      visibilityRules = undefined;
    }
  }

  return {
    conversationId: input.sessionId,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    workspaceScope: input.workspaceScope,
    isSharedWorkspace: input.workspaceScope === "live",
    workspacePath: input.workspacePath,
    tempWorkspace: input.workspacePath,
    project: {
      id: input.projectId,
      name: project?.name ?? input.projectId,
      thumbnail: project?.thumbnail,
      authoringPreferences: project?.authoringPreferences,
    },
    demoPages,
    demoFolders,
    projectConfigSchema: input.workspacePath
      ? getProjectConfigSchema(input.workspacePath)
      : undefined,
    projectConfigValues: input.workspacePath
      ? getProjectConfigValues(input.workspacePath)
      : {},
    visibilityRules,
    activePageId,
    userRole: input.userRole,
  };
}

async function pushSessionAuthorization(input: {
  userId: string;
  userRole: UserRole;
  sessionId: string;
  projectId: string;
  expiresAt: number;
}): Promise<void> {
  const result = await pushSessionAuthorizationToAgent(input.sessionId, {
    userId: input.userId,
    role: input.userRole,
    projectId: input.projectId,
    expiresAt: input.expiresAt,
  });
  if (!result.ok) {
    console.warn("[sessions] Failed to push session authorization:", result.message);
  }
}

async function pushUserModelConfig(userId: string, sessionId: string): Promise<void> {
  try {
    const globalConfig = await getModelConfig();
    const config = readUserBackendProvidersConfig(
      userId,
      globalConfig.backendProviders,
    );
    if (!config) return;

    const result = await pushSessionModelConfigToAgent(sessionId, config);
    if (!result.ok) {
      console.warn("[sessions] Failed to push user model config:", result.message);
    }
  } catch (error) {
    console.warn(
      "[sessions] Failed to prepare user model config:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function pushUserExternalAuth(userId: string, sessionId: string): Promise<void> {
  try {
    const config = await readExternalAuthSessionConfigWithRefresh(userId);
    const result = await pushSessionExternalAuthToAgent(sessionId, config);
    if (!result.ok) {
      console.warn("[sessions] Failed to push external auth config:", result.message);
    }
  } catch (error) {
    console.warn(
      "[sessions] Failed to prepare external auth config:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getAuthCookie();
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

    const user = findUserById(payload.userId);
    if (!user) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "用户不存在"), { status: 401 });
    }
    const userId = user.id;
    const userRole = user.role;
    const body = await request.json();
    const { demoId: projectId, forceNew, workspaceId } = body;
    const activePageId =
      typeof body.activePageId === "string" ? body.activePageId : undefined;

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "projectId 参数必填"),
        { status: 400 },
      );
    }

    if (forceNew) {
      archiveActiveSession(userId, projectId);
    }

    const activeSessionId = findActiveSession(userId, projectId);
    if (activeSessionId && !workspaceId) {
      // 重新进入项目复用活跃会话时也算一次历史活动，延长 7 天保留窗口。
      touchSessionActivity?.(activeSessionId);
      ensureSessionUsesProjectActiveWorkspace(userId, projectId, activeSessionId);
      const authorization = bindEditSessionRole(activeSessionId, userId, userRole);
      if (!authorization) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND", "Session 授权信息无效"), { status: 404 });
      }
      await Promise.all([
        pushUserModelConfig(userId, activeSessionId),
        pushUserExternalAuth(userId, activeSessionId),
        pushSessionAuthorization({
          userId,
          userRole,
          sessionId: activeSessionId,
          projectId: authorization.projectId,
          expiresAt: authorization.expiresAt,
        }),
      ]);

      const meta = getSessionMeta(activeSessionId);
      const workspaceId = meta?.workspaceId || null;
      const workspacePath = workspaceId
        ? findWorkspacePath(workspaceId) || ""
        : "";
      const workspaceScope = workspaceId
        ? getWorkspaceMeta(workspaceId)?.scope || "legacy"
        : "legacy";
      getConversationService().ensureConversation({
        id: activeSessionId,
        ownerUserId: userId,
        projectId,
        workspaceId,
      });

      return NextResponse.json(
        createApiSuccess(createSessionBootstrap({
          sessionId: activeSessionId,
          projectId,
          workspaceId,
          workspaceScope,
          workspacePath,
          activePageId,
          userRole,
        })),
      );
    }

    const resumeWorkspaceId =
      typeof workspaceId === "string"
        ? workspaceId
        : undefined;
    const result = await createEditSession(userId, projectId, resumeWorkspaceId, userRole);
    const authorization = bindEditSessionRole(result.sessionId, userId, userRole);
    if (!authorization) {
      throw new Error("Session 授权信息写入失败");
    }
    await Promise.all([
      pushUserModelConfig(userId, result.sessionId),
      pushUserExternalAuth(userId, result.sessionId),
      pushSessionAuthorization({
        userId,
        userRole,
        sessionId: result.sessionId,
        projectId: authorization.projectId,
        expiresAt: authorization.expiresAt,
      }),
    ]);
    getConversationService().ensureConversation({
      id: result.sessionId,
      ownerUserId: userId,
      projectId,
      workspaceId: result.workspaceId,
    });
    return NextResponse.json(
      createApiSuccess(createSessionBootstrap({
        sessionId: result.sessionId,
        projectId,
        workspaceId: result.workspaceId,
        workspaceScope: result.workspaceScope,
        workspacePath: result.workspacePath,
        activePageId,
        userRole,
      })),
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating session:", error);

    if (error instanceof Error && error.message.includes("不存在")) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建 Session 失败"),
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : undefined;
    const offset = searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!)
      : undefined;

    const agentClient = getAgentClient();
    const result = await agentClient.listSessions({ status, limit, offset });

    if (!result.success) {
      return NextResponse.json(
        createApiError("AGENT_SERVICE_ERROR", result.error.message),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(result.data));
  } catch (error) {
    console.error("Error listing sessions:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取 Session 列表失败"),
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getAgentClient } from "@/lib/agent-client";
import {
  createApiSuccess,
  createApiError,
  getSessionPath,
  getSessionMeta,
  findWorkspacePath,
  getWorkspaceMultiDemoFiles,
  getWorkspaceFiles,
} from "@/lib/fs-utils";
import {
  archiveActiveSession,
  createEditSession,
  enforceSessionLimit,
  findActiveSession,
} from "@/lib/session-manager";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  pushSessionExternalAuthToAgent,
  pushSessionModelConfigToAgent,
} from "@/lib/agent-providers";
import { readExternalAuthSessionConfigWithRefresh } from "@/lib/external-auth";
import { getModelConfig } from "@/lib/model-config";
import { readUserBackendProvidersConfig } from "@/lib/user-model-config";

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

    const userId = payload.userId;
    const body = await request.json();
    const { demoId: projectId, forceNew, workspaceId } = body;

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
      await pushUserModelConfig(userId, activeSessionId);
      await pushUserExternalAuth(userId, activeSessionId);

      const meta = getSessionMeta(activeSessionId);
      let code = "";
      let schema = "";
      let tempWorkspace = "";

      if (meta?.workspaceId) {
        const wsPath = findWorkspacePath(meta.workspaceId);
        // 多页面模式：读取所有页面，返回第一个页面的 code/schema 作为兼容
        const multiFiles = getWorkspaceMultiDemoFiles(meta.workspaceId);
        if (multiFiles && Object.keys(multiFiles.demos).length > 0) {
          const firstDemoId = Object.keys(multiFiles.demos)[0];
          const firstDemo = multiFiles.demos[firstDemoId];
          code = firstDemo.code;
          schema = firstDemo.schema;
        } else {
          // fallback 到旧格式（workspace 根目录）
          const files = getWorkspaceFiles(meta.workspaceId);
          code = files?.code || "";
          schema = files?.schema || "";
        }
        tempWorkspace = wsPath || getSessionPath(activeSessionId) || "";
      } else {
        // 无 workspaceId 的 legacy session，尝试从 session 路径读取
        const sessionPath = getSessionPath(activeSessionId);
        const codePath = path.join(sessionPath, "index.tsx");
        const schemaPath = path.join(sessionPath, "config.schema.json");
        if (fs.existsSync(codePath)) code = fs.readFileSync(codePath, "utf-8");
        if (fs.existsSync(schemaPath)) schema = fs.readFileSync(schemaPath, "utf-8");
        tempWorkspace = sessionPath || "";
      }

      return NextResponse.json(
        createApiSuccess({
          sessionId: activeSessionId,
          workspaceId: meta?.workspaceId || null,
          code,
          schema,
          tempWorkspace,
        }),
      );
    }

    const result = await createEditSession(userId, projectId, workspaceId);
    await pushUserModelConfig(userId, result.sessionId);
    await pushUserExternalAuth(userId, result.sessionId);
    enforceSessionLimit(userId, projectId, 5);
    return NextResponse.json(createApiSuccess(result), { status: 201 });
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

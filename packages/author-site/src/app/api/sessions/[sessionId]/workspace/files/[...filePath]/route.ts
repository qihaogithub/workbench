import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import {
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  createApiSuccess,
  createApiError,
  findWorkspacePath,
  ensureMemoryFile,
  listDemoPages,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { findUserById } from "@/lib/user";
import { isFileEditable } from "@/lib/workspace-file-utils";
import { isLiveWorkspace } from "@/lib/workspace-manager";
import {
  commitWorkspaceMutation,
  createTextWorkspaceMutation,
  WorkspaceAuthorityClientError,
} from "@/lib/workspace-authority-client";

interface ResolvedWorkspaceFile {
  relativePath: string;
  absolutePath: string;
}

function isConventionPath(relativePath: string): boolean {
  return (
    relativePath === "convention.md" ||
    /^demos\/[^/]+\/convention\.md$/.test(relativePath)
  );
}

function isAdminUserId(userId: string): boolean {
  return findUserById(userId)?.role === "admin";
}

function resolveWorkspaceFilePath(
  workspacePath: string,
  filePathParts: string[],
): ResolvedWorkspaceFile | null {
  const requestedPath = filePathParts.join("/").replace(/\\/g, "/");
  if (!requestedPath || path.isAbsolute(requestedPath)) return null;

  const workspaceRoot = path.resolve(workspacePath);
  const absolutePath = path.resolve(workspaceRoot, requestedPath);
  const normalizedRelativePath = path
    .relative(workspaceRoot, absolutePath)
    .split(path.sep)
    .join("/");

  if (
    !normalizedRelativePath ||
    normalizedRelativePath.startsWith("../") ||
    normalizedRelativePath === ".." ||
    path.isAbsolute(normalizedRelativePath) ||
    normalizedRelativePath !== requestedPath
  ) {
    return null;
  }

  return {
    relativePath: normalizedRelativePath,
    absolutePath,
  };
}

/**
 * GET /api/sessions/{sessionId}/workspace/files/{...filePath}
 * 读取工作空间中单个文件的内容
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; filePath: string[] }> },
) {
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

    const { sessionId, filePath: filePathParts } = await params;

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

    if (!meta.userId || meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权访问其他用户的 Session"),
        { status: 403 },
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

    const resolved = resolveWorkspaceFilePath(wsPath, filePathParts);
    if (!resolved) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "禁止访问工作空间外的文件"),
        { status: 403 },
      );
    }

    const { relativePath, absolutePath } = resolved;

    if (relativePath === "memory.md" && !isLiveWorkspace(meta.workspaceId)) {
      ensureMemoryFile(wsPath);
    }

    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "文件不存在"),
        { status: 404 },
      );
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "路径不是文件"),
        { status: 400 },
      );
    }

    // 限制文件大小（超过 1MB 拒绝）
    if (stat.size > 1024 * 1024) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "文件过大（超过 1MB）"),
        { status: 413 },
      );
    }

    const content = fs.readFileSync(absolutePath, "utf-8");

    return NextResponse.json(
      createApiSuccess({
        path: relativePath,
        content,
        editable: isFileEditable(relativePath) &&
          (!isConventionPath(relativePath) || isAdminUserId(payload.userId)),
        size: stat.size,
      }),
    );
  } catch (error) {
    console.error("Error reading workspace file:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取文件内容失败"),
      { status: 500 },
    );
  }
}

/**
 * PUT /api/sessions/{sessionId}/workspace/files/{...filePath}
 * 更新工作空间中可编辑文件的内容
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; filePath: string[] }> },
) {
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

    const { sessionId, filePath: filePathParts } = await params;

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

    if (!meta.userId || meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
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

    const resolved = resolveWorkspaceFilePath(wsPath, filePathParts);
    if (!resolved) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "禁止访问工作空间外的文件"),
        { status: 403 },
      );
    }

    const { relativePath, absolutePath } = resolved;

    let body: { content?: unknown; contextPageId?: unknown } | null = null;
    const configPageMatch = /^demos\/([^/]+)\/config\.(?:schema|values)\.json$/.exec(relativePath);
    const isProjectConfigFile =
      relativePath === "project.config.schema.json" ||
      relativePath === "project.config.values.json";
    if (configPageMatch || isProjectConfigFile) {
      body = await request.json().catch(() => null) as
        | { content?: unknown; contextPageId?: unknown }
        | null;
      const contextPageId = configPageMatch?.[1]
        ?? (typeof body?.contextPageId === "string" ? body.contextPageId : undefined);
      if (!contextPageId) {
        return NextResponse.json(
          createApiError("CONFIG_READONLY", "配置写入需要页面上下文"),
          { status: 403 },
        );
      }
      const pageMeta = listDemoPages(wsPath).find((page) => page.id === contextPageId);
      if (!pageMeta || pageMeta.reference || (pageMeta.isTemplatePage && payload.role !== "admin")) {
        return NextResponse.json(
          createApiError(
            "CONFIG_READONLY",
            !pageMeta
              ? "页面上下文不存在"
              : pageMeta.reference
              ? "引用页面的配置不可编辑"
              : "普通编辑者不能编辑模板页面配置",
          ),
          { status: 403 },
        );
      }
    }

    if (isConventionPath(relativePath) && !isAdminUserId(payload.userId)) {
      return NextResponse.json(createApiError("FORBIDDEN", "仅管理员可编辑项目公约"), {
        status: 403,
      });
    }

    // 权限校验：只允许编辑白名单内的文件
    if (!isFileEditable(relativePath)) {
      return NextResponse.json(createApiError("FORBIDDEN", "该文件不可编辑"), {
        status: 403,
      });
    }

    if (!body) {
      body = await request.json().catch(() => null) as
        | { content?: unknown; contextPageId?: unknown }
        | null;
    }

    const fileExists = fs.existsSync(absolutePath);

    if (!fileExists) {
      // 对可编辑白名单内的文件，允许首次创建（如页面公约）
      const parentDir = path.dirname(absolutePath);
      if (!fs.existsSync(parentDir)) {
        return NextResponse.json(
          createApiError("FILE_READ_ERROR", "父目录不存在"),
          { status: 404 },
        );
      }
    }

    if (!body || typeof body.content !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "content 字段必须为字符串"),
        { status: 400 },
      );
    }

    const previousContent = fileExists
      ? fs.readFileSync(absolutePath, "utf-8")
      : null;
    const receipt = await commitWorkspaceMutation(createTextWorkspaceMutation({
      projectId: meta.demoId,
      workspaceId: meta.workspaceId,
      sessionId,
      path: relativePath,
      content: body.content,
      previousContent,
      reason: "author_workspace_file_edit",
    }));

    return NextResponse.json(
      createApiSuccess({
        path: relativePath,
        message: "文件已提交",
        receipt,
      }),
    );
  } catch (error) {
    console.error("Error updating workspace file:", error);
    if (error instanceof WorkspaceAuthorityClientError) {
      return NextResponse.json(
        createApiError(error.code as never, error.message),
        { status: error.status },
      );
    }
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新文件内容失败"),
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/sessions/{sessionId}/workspace/files/{...filePath}
 * 仅删除用户按需创建的项目/页面公约。
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; filePath: string[] }> },
) {
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

    const { sessionId, filePath: filePathParts } = await params;
    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    }
    const meta = getSessionMeta(sessionId);
    if (!meta) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    }
    if (!meta.userId || meta.userId !== payload.userId) {
      return NextResponse.json(createApiError("FORBIDDEN", "无权操作其他用户的 Session"), {
        status: 403,
      });
    }
    if (isSessionExpired(meta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), { status: 410 });
    }
    if (!meta.workspaceId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      );
    }

    const wsPath = findWorkspacePath(meta.workspaceId);
    if (!wsPath) {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "工作空间路径不存在"), {
        status: 500,
      });
    }
    const resolved = resolveWorkspaceFilePath(wsPath, filePathParts);
    if (!resolved) {
      return NextResponse.json(createApiError("FORBIDDEN", "禁止访问工作空间外的文件"), {
        status: 403,
      });
    }

    const { relativePath, absolutePath } = resolved;
    const isConvention = isConventionPath(relativePath);
    if (!isConvention) {
      return NextResponse.json(createApiError("FORBIDDEN", "仅支持删除公约文档"), {
        status: 403,
      });
    }
    if (!isAdminUserId(payload.userId)) {
      return NextResponse.json(createApiError("FORBIDDEN", "仅管理员可删除项目公约"), {
        status: 403,
      });
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return NextResponse.json(createApiError("FILE_READ_ERROR", "文件不存在"), {
        status: 404,
      });
    }

    const content = fs.readFileSync(absolutePath, "utf-8");
    const receipt = await commitWorkspaceMutation({
      mutationId: crypto.randomUUID(),
      projectId: meta.demoId,
      workspaceId: meta.workspaceId,
      sessionId,
      baseRevision: 0,
      actor: "author-site",
      reason: "author_convention_delete",
      operations: [{
        type: "delete_path",
        path: relativePath,
        expectedHash: crypto.createHash("sha256").update(content).digest("hex"),
      }],
    });

    return NextResponse.json(
      createApiSuccess({ path: relativePath, message: "公约已删除", receipt }),
    );
  } catch (error) {
    console.error("Error deleting convention file:", error);
    if (error instanceof WorkspaceAuthorityClientError) {
      return NextResponse.json(createApiError(error.code as never, error.message), {
        status: error.status,
      });
    }
    return NextResponse.json(createApiError("FILE_WRITE_ERROR", "删除公约失败"), {
      status: 500,
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
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
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
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
  { params }: { params: { sessionId: string; filePath: string[] } },
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

    const { sessionId, filePath: filePathParts } = params;

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
        editable: isFileEditable(relativePath),
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
  { params }: { params: { sessionId: string; filePath: string[] } },
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

    const { sessionId, filePath: filePathParts } = params;

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

    // 权限校验：只允许编辑白名单内的文件
    if (!isFileEditable(relativePath)) {
      return NextResponse.json(createApiError("FORBIDDEN", "该文件不可编辑"), {
        status: 403,
      });
    }

    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "文件不存在"),
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.content !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "content 字段必须为字符串"),
        { status: 400 },
      );
    }

    const previousContent = fs.readFileSync(absolutePath, "utf-8");
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

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
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { isFileEditable } from "@/lib/workspace-file-utils";

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

    const relativePath = filePathParts.join("/");

    // 安全校验：防止路径遍历
    const resolvedPath = path.resolve(wsPath, relativePath);
    if (!resolvedPath.startsWith(wsPath)) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "禁止访问工作空间外的文件"),
        { status: 403 },
      );
    }

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "文件不存在"),
        { status: 404 },
      );
    }

    const stat = fs.statSync(resolvedPath);
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

    const content = fs.readFileSync(resolvedPath, "utf-8");

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

    const relativePath = filePathParts.join("/");

    // 权限校验：只允许编辑白名单内的文件
    if (!isFileEditable(relativePath)) {
      return NextResponse.json(createApiError("FORBIDDEN", "该文件不可编辑"), {
        status: 403,
      });
    }

    // 安全校验：防止路径遍历
    const resolvedPath = path.resolve(wsPath, relativePath);
    if (!resolvedPath.startsWith(wsPath)) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "禁止访问工作空间外的文件"),
        { status: 403 },
      );
    }

    if (!fs.existsSync(resolvedPath)) {
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

    fs.writeFileSync(resolvedPath, body.content, "utf-8");

    return NextResponse.json(
      createApiSuccess({
        path: relativePath,
        message: "文件已保存",
      }),
    );
  } catch (error) {
    console.error("Error updating workspace file:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新文件内容失败"),
      { status: 500 },
    );
  }
}

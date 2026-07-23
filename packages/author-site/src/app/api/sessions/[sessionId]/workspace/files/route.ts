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
  readDemoPageMeta,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  isHiddenEntry,
  isVisiblePageRuntimeFile,
} from "@/lib/workspace-file-utils";
import type { WorkspaceFileNode } from "@/lib/workspace-file-utils";

/**
 * GET /api/sessions/{sessionId}/workspace/files?path={relativePath}
 * 获取工作空间目录文件列表（支持懒加载）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
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

    const { sessionId } = params;

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

    // 解析请求的子路径
    const { searchParams } = new URL(request.url);
    const relativePath = searchParams.get("path") || "";
    const showKnowledge = searchParams.get("showKnowledge") === "true";

    // 安全校验：防止路径遍历
    const resolvedPath = path.resolve(wsPath, relativePath);
    if (!resolvedPath.startsWith(wsPath)) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "禁止访问工作空间外的路径"),
        { status: 403 },
      );
    }

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "路径不存在"),
        { status: 404 },
      );
    }

    const stat = fs.statSync(resolvedPath);

    if (!stat.isDirectory()) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "路径不是目录"),
        { status: 400 },
      );
    }

    // 读取目录内容（仅一层）
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const children: WorkspaceFileNode[] = [];
    const pageDirectoryMatch = relativePath.match(/^demos\/([^/]+)$/);
    const pageMeta = pageDirectoryMatch
      ? readDemoPageMeta(wsPath, pageDirectoryMatch[1])
      : null;
    const inferredRuntimeType = pageMeta?.runtimeType;

    for (const entry of entries) {
      if (isHiddenEntry(entry.name, showKnowledge)) continue;

      const entryRelPath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;
      const entryAbsPath = path.join(resolvedPath, entry.name);

      if (entry.isDirectory()) {
        children.push({
          path: entryRelPath,
          type: "directory",
          name: entry.name,
        });
      } else if (entry.isFile()) {
        if (
          pageDirectoryMatch &&
          !isVisiblePageRuntimeFile({
            fileName: entry.name,
            runtimeType: inferredRuntimeType,
            schemaContent: entry.name === "config.schema.json"
              ? fs.readFileSync(entryAbsPath, "utf-8")
              : undefined,
          })
        ) {
          continue;
        }
        const entryStat = fs.statSync(entryAbsPath);
        children.push({
          path: entryRelPath,
          type: "file",
          name: entry.name,
          size: entryStat.size,
        });
      }
    }

    // 排序：目录在前，文件在后；同类按字母序
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const result: WorkspaceFileNode = {
      path: relativePath || "",
      type: "directory",
      name: path.basename(resolvedPath) || "workspace",
      children,
    };

    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    console.error("Error listing workspace files:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取工作空间文件列表失败"),
      { status: 500 },
    );
  }
}

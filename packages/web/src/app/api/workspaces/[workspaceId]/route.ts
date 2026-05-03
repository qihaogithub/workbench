import { NextRequest, NextResponse } from "next/server";
import {
  createApiSuccess,
  createApiError,
  getWorkspaceFiles,
  updateWorkspaceFiles,
  workspaceExists,
} from "@/lib/fs-utils";
import { getWorkspace, deleteWorkspace } from "@/lib/workspace-manager";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

export async function GET(
  _request: Request,
  { params }: { params: { workspaceId: string } },
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

    const { workspaceId } = params;

    const workspace = getWorkspace(workspaceId);
    if (!workspace) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND", "工作空间不存在"), {
        status: 404,
      });
    }

    if (workspace.userId && workspace.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权访问其他用户的工作空间"),
        { status: 403 },
      );
    }

    return NextResponse.json(createApiSuccess(workspace));
  } catch (error) {
    console.error("Error getting workspace:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取工作空间信息失败"),
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { workspaceId: string } },
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

    const { workspaceId } = params;
    const workspace = getWorkspace(workspaceId);

    if (!workspace) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND", "工作空间不存在"), {
        status: 404,
      });
    }

    if (workspace.userId && workspace.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权删除其他用户的工作空间"),
        { status: 403 },
      );
    }

    const success = deleteWorkspace(workspaceId);
    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "删除工作空间失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "删除工作空间失败"),
      { status: 500 },
    );
  }
}

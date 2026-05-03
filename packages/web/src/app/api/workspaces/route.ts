import { NextRequest, NextResponse } from "next/server";
import {
  createApiSuccess,
  createApiError,
} from "@/lib/fs-utils";
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
} from "@/lib/workspace-manager";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

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
    const { projectId } = body;

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "projectId 参数必填"),
        { status: 400 },
      );
    }

    const result = createWorkspace(userId, projectId);
    return NextResponse.json(createApiSuccess(result), { status: 201 });
  } catch (error) {
    console.error("Error creating workspace:", error);

    if (error instanceof Error && error.message.includes("不存在")) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "创建工作空间失败"),
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "projectId 参数必填"),
        { status: 400 },
      );
    }

    const workspaces = listWorkspaces(userId, projectId);
    return NextResponse.json(createApiSuccess(workspaces));
  } catch (error) {
    console.error("Error listing workspaces:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "获取工作空间列表失败"),
      { status: 500 },
    );
  }
}

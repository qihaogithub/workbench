import { NextRequest, NextResponse } from "next/server";
import { ProjectAdminService } from "@opencode-workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess, getDataDir } from "@/lib/fs-utils";

async function getAuthenticatedUser() {
  const token = getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const result = new ProjectAdminService({ dataDir: getDataDir() }).projectCommitList(
    params.projectId,
    request.nextUrl.searchParams.get("includeDraft") === "true",
    {
      id: payload.userId,
      name: payload.username,
      role: "creator",
      source: "author-site",
    },
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", result.error?.message ?? "读取项目时间线失败"),
      { status: result.error?.code === "FORBIDDEN" ? 403 : 500 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

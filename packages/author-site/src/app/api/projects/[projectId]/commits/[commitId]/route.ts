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
  _request: NextRequest,
  { params }: { params: { projectId: string; commitId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const result = new ProjectAdminService({ dataDir: getDataDir() }).projectCommitList(
    params.projectId,
    true,
    {
      id: payload.userId,
      name: payload.username,
      role: "creator",
      source: "author-site",
    },
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", result.error?.message ?? "读取项目提交失败"),
      { status: result.error?.code === "FORBIDDEN" ? 403 : 500 },
    );
  }
  const commit = result.data.commits.find((item) => item.id === params.commitId);
  if (!commit) {
    return NextResponse.json(createApiError("VERSION_NOT_FOUND", "项目提交不存在"), { status: 404 });
  }
  return NextResponse.json(createApiSuccess(commit));
}

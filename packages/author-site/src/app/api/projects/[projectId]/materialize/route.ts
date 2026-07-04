import { NextRequest, NextResponse } from "next/server";
import { ProjectAdminService } from "@opencode-workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess, getDataDir } from "@/lib/fs-utils";

async function getAuthenticatedUser() {
  const token = getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const payload = await getAuthenticatedUser();
  if (!payload) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { commitId?: string; checkOnly?: boolean };
  const result = new ProjectAdminService({ dataDir: getDataDir() }).projectMaterialize(
    {
      projectId: params.projectId,
      commitId: body.commitId,
      checkOnly: body.checkOnly,
    },
    {
      id: payload.userId,
      name: payload.username,
      role: "creator",
      source: "author-site",
    },
  );
  if (!result.ok || !result.data) {
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", result.error?.message ?? "物化项目失败"),
      { status: 500 },
    );
  }
  return NextResponse.json(createApiSuccess(result.data));
}

import { NextResponse } from "next/server";
import { createApiError } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
import { getCurrentProjectActor } from "@/lib/auth/current-user";

export async function GET() {
  try {
    const actor = await getCurrentProjectActor();
    if (!actor) return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    return projectAdminResponse(getProjectAdminService().listTemplates());
  } catch (error) {
    console.error("Error listing templates:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取模板列表失败"),
      { status: 500 },
    );
  }
}

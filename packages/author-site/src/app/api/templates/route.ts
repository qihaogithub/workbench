import { NextResponse } from "next/server";
import { createApiError } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";

export async function GET() {
  try {
    return projectAdminResponse(getProjectAdminService().listTemplates());
  } catch (error) {
    console.error("Error listing templates:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取模板列表失败"),
      { status: 500 },
    );
  }
}

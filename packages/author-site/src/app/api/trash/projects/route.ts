import { NextResponse } from "next/server";

import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
import { getCurrentProjectActor } from "@/lib/auth/current-user";

export async function GET() {
  const actor = await getCurrentProjectActor();
  if (!actor) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }
  const result = getProjectAdminService().listTrashedProjects(actor);
  if (!result.ok) return projectAdminResponse(result);
  return NextResponse.json(createApiSuccess(result.data ?? []));
}

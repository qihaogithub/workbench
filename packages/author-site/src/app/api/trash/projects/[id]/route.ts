import { NextResponse } from "next/server";

import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  getProjectAdminService,
  projectAdminResponse,
} from "@/lib/project-admin-service";
import { getCurrentProjectActor } from "@/lib/auth/current-user";
import { reconcileTemplateKnowledge } from "@/lib/knowledge-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentProjectActor();
  if (!actor) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }
  const { id } = await params;
  const service = getProjectAdminService();
  const trashed = service.listTrashedProjects(actor).data?.find((item) => item.id === id);
  const result = service.restoreTrashedProject(id, actor);
  if (!result.ok) return projectAdminResponse(result);
  if (trashed?.projectType === "template") await reconcileTemplateKnowledge();
  return NextResponse.json(createApiSuccess(result.data));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getCurrentProjectActor();
  if (!actor) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }
  const { id } = await params;
  const result = getProjectAdminService().purgeTrashedProject(id, actor);
  if (!result.ok) return projectAdminResponse(result);
  return NextResponse.json(createApiSuccess(result.data));
}

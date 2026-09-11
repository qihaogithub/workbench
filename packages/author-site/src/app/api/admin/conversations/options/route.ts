import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { getConversationService } from "@/lib/conversation";
import { createApiError, createApiSuccess } from "@/lib/api-helpers";
import { getProjectAdminService } from "@/lib/project-admin-service";
import { listAllUsers } from "@/lib/user";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未授权访问"), {
      status: 401,
      headers: NO_STORE,
    });
  }
  try {
    const conversationProjectIds = getConversationService().listAdminProjectIds();
    const projectResult = getProjectAdminService().listProjects({
      id: "admin-secret",
      name: "Admin Secret",
      role: "admin",
      source: "admin-secret",
    });
    const knownProjects = new Map(
      (projectResult.ok ? projectResult.data ?? [] : []).map((project) => [project.id, project.name]),
    );
    const projectIds = [...new Set([
      ...knownProjects.keys(),
      ...conversationProjectIds,
    ])].sort((left, right) =>
      (knownProjects.get(left) ?? left).localeCompare(knownProjects.get(right) ?? right),
    );
    return NextResponse.json(createApiSuccess({
      users: listAllUsers().map(({ id, username, displayName }) => ({ id, username, displayName })),
      projects: projectIds.map((id) => ({ id, name: knownProjects.get(id) ?? id })),
    }), { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(createApiError(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "筛选项不可用",
    ), { status: 503, headers: NO_STORE });
  }
}

import { NextRequest, NextResponse } from "next/server";

import { authorizeInternal } from "@/lib/page-transfer/authorization";
import { getProjectAdminService } from "@/lib/project-admin-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeInternal(request, projectId);
  if (auth instanceof NextResponse) return auth;
  const requestedProjectId =
    request.nextUrl.searchParams.get("sourceProjectId");
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase();
  const projects = getProjectAdminService().listProjects(auth.actor);
  if (!projects.ok || !projects.data) {
    return NextResponse.json(
      { success: false, error: projects.error },
      { status: 403 },
    );
  }
  const result = projects.data.flatMap((project) => {
    if (requestedProjectId && project.id !== requestedProjectId) return [];
    const detail = getProjectAdminService().getProject(project.id, auth.actor);
    if (!detail.ok || !detail.data) return [];
    return detail.data.pages
      .filter(
        (page) =>
          !query ||
          page.name.toLowerCase().includes(query) ||
          page.id.toLowerCase().includes(query),
      )
      .map((page) => ({
        projectId: project.id,
        projectName: project.name,
        pageId: page.id,
        pageName: page.name,
        runtimeType: page.runtimeType,
        routeKey: page.routeKey,
      }));
  });
  return NextResponse.json({ success: true, data: result });
}

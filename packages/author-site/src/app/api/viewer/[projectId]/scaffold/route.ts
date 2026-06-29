import { NextRequest, NextResponse } from "next/server";
import { exportProjectScaffoldEntries } from "@opencode-workbench/project-scaffold";

import { createApiError } from "@/lib/fs-utils";
import { getProjectAdminService } from "@/lib/project-admin-service";
import { getPublishStatus } from "@/lib/publish-manager";
import {
  projectScaffoldErrorResponse,
  projectScaffoldZipResponse,
} from "../../../projects/[projectId]/scaffold/scaffold-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const publishStatus = getPublishStatus(params.projectId);
    if (publishStatus.status === "never_published") {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }
    if (publishStatus.status === "unpublished_changes") {
      return NextResponse.json(
        createApiError(
          "VALIDATION_ERROR",
          "Project has unpublished changes. Publish before exporting from viewer.",
        ),
        { status: 409 },
      );
    }

    const result = exportProjectScaffoldEntries(
      getProjectAdminService(),
      {
        id: "viewer-public",
        name: "Viewer Public",
        role: "readonly",
        source: "viewer-site-scaffold-download",
      },
      { projectId: params.projectId },
    );

    if (!result.ok || !result.data) {
      return projectScaffoldErrorResponse(result);
    }

    return projectScaffoldZipResponse(result.data);
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }
    console.error("Error exporting viewer project scaffold:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "Project export failed"),
      { status: 500 },
    );
  }
}

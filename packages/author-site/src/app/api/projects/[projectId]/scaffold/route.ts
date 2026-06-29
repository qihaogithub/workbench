import { NextRequest, NextResponse } from "next/server";
import { exportProjectScaffoldEntries } from "@opencode-workbench/project-scaffold";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError } from "@/lib/fs-utils";
import { getProjectAdminService } from "@/lib/project-admin-service";
import {
  getEditSession,
  syncEditSessionToProjectWorkspace,
} from "@/lib/session-manager";
import {
  projectScaffoldErrorResponse,
  projectScaffoldZipResponse,
} from "./scaffold-response";

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "Not signed in"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "Session expired"), {
        status: 401,
      });
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (sessionId) {
      const session = getEditSession(sessionId);
      if (!session || session.demoId !== params.projectId) {
        return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
          status: 404,
        });
      }
      if (session.userId && session.userId !== payload.userId) {
        return NextResponse.json(
          createApiError("FORBIDDEN", "Cannot export another user's session"),
          { status: 403 },
        );
      }

      const synced = syncEditSessionToProjectWorkspace(sessionId);
      if (!synced.success) {
        return NextResponse.json(
          createApiError(
            "FILE_WRITE_ERROR",
            synced.error || "Sync session workspace failed",
          ),
          { status: 500 },
        );
      }
    }

    const result = exportProjectScaffoldEntries(
      getProjectAdminService(),
      {
        id: payload.userId,
        name: payload.username,
        role: "creator",
        source: "author-site-scaffold-download",
      },
      { projectId: params.projectId },
    );

    if (!result.ok || !result.data) {
      return projectScaffoldErrorResponse(result);
    }

    return projectScaffoldZipResponse(result.data);
  } catch (error) {
    console.error("Error exporting project scaffold:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "Project export failed"),
      { status: 500 },
    );
  }
}

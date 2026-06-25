import { NextRequest, NextResponse } from "next/server";
import {
  buildProjectScaffoldZip,
  exportProjectScaffoldEntries,
} from "@opencode-workbench/project-scaffold";
import type { ErrorCodeType } from "@opencode-workbench/shared";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError } from "@/lib/fs-utils";
import { getProjectAdminService } from "@/lib/project-admin-service";

const ERROR_STATUS: Record<string, number> = {
  PROJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  PROJECT_EXPORT_FAILED: 500,
};

const ERROR_CODE_MAP: Record<string, ErrorCodeType> = {
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  PROJECT_EXPORT_FAILED: "FILE_READ_ERROR",
};

function safeDownloadName(projectId: string): string {
  return `${projectId.replace(/[^A-Za-z0-9_.-]/g, "_") || "opencode-project"}.zip`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
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
      const code = result.error?.code ?? "PROJECT_EXPORT_FAILED";
      return NextResponse.json(
        createApiError(
          ERROR_CODE_MAP[code] ?? "FILE_READ_ERROR",
          result.error?.message ?? "导出脚手架失败",
        ),
        { status: ERROR_STATUS[code] ?? 500 },
      );
    }

    const zip = buildProjectScaffoldZip(result.data.entries);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeDownloadName(result.data.projectId)}"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting project scaffold:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "导出脚手架失败"),
      { status: 500 },
    );
  }
}

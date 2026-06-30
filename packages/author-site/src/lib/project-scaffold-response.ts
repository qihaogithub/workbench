import { NextResponse } from "next/server";
import {
  buildProjectScaffoldZip,
  type ProjectScaffoldExport,
} from "@opencode-workbench/project-scaffold";
import type { ErrorCodeType } from "@opencode-workbench/shared";
import type { ProjectAdminResult } from "@opencode-workbench/project-core";

import { createApiError } from "@/lib/fs-utils";

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

export function safeProjectScaffoldDownloadName(projectId: string): string {
  return `${projectId.replace(/[^A-Za-z0-9_.-]/g, "_") || "opencode-project"}.zip`;
}

export function projectScaffoldZipResponse(exported: ProjectScaffoldExport): NextResponse {
  const zip = buildProjectScaffoldZip(exported.entries);
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeProjectScaffoldDownloadName(exported.projectId)}"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}

export function projectScaffoldErrorResponse(
  result: ProjectAdminResult<ProjectScaffoldExport>,
): NextResponse {
  const code = result.error?.code ?? "PROJECT_EXPORT_FAILED";
  return NextResponse.json(
    createApiError(
      ERROR_CODE_MAP[code] ?? "FILE_READ_ERROR",
      result.error?.message ?? "Project export failed",
    ),
    { status: ERROR_STATUS[code] ?? 500 },
  );
}

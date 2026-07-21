import { NextRequest, NextResponse } from "next/server";

import {
  ProjectTransferError,
  buildProjectManifest,
  createProjectArchive,
} from "@workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess, getDataDir } from "@/lib/fs-utils";

async function isAuthenticated(): Promise<boolean> {
  const token = getAuthCookie();
  return Boolean(token && (await verifyToken(token)));
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
      status: 401,
    });
  }

  try {
    if (request.nextUrl.searchParams.get("manifest") === "1") {
      return NextResponse.json(
        createApiSuccess(buildProjectManifest(getDataDir(), params.projectId)),
      );
    }

    const archive = await createProjectArchive(getDataDir(), params.projectId);
    const body = Uint8Array.from(archive).buffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${params.projectId}.tar.gz"`,
        "Content-Length": String(archive.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ProjectTransferError) {
      return NextResponse.json(createApiError(error.code, error.message), {
        status: error.code === "PROJECT_NOT_FOUND" ? 404 : 400,
      });
    }
    console.error("导出项目失败:", error);
    return NextResponse.json(
      createApiError("PROJECT_EXPORT_FAILED", "导出项目失败"),
      { status: 500 },
    );
  }
}

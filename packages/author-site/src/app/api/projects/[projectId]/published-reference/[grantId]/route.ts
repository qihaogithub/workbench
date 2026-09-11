import { NextRequest, NextResponse } from "next/server";

import {
  ReferenceProjectionError,
  resolvePublishedReference,
} from "@/lib/page-transfer/reference-projector";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; grantId: string }> },
) {
  const { projectId, grantId } = await params;
  try {
    const page = resolvePublishedReference({
      targetProjectId: projectId,
      grantId,
      publishedVersion: request.nextUrl.searchParams.get("version") ?? "",
    });
    return NextResponse.json(
      { success: true, data: page },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const known =
      error instanceof ReferenceProjectionError
        ? error
        : new ReferenceProjectionError(
            "REFERENCE_BUILD_FAILED",
            "引用页面产物构建失败",
            500,
          );
    return NextResponse.json(
      { success: false, error: { code: known.code, message: known.message } },
      { status: known.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

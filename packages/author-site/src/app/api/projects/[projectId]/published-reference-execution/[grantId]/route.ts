import { NextRequest, NextResponse } from "next/server";

import {
  issuePublishedReferenceExecution,
  ReferenceProjectionError,
} from "@/lib/page-transfer/reference-projector";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; grantId: string }> },
) {
  const { projectId, grantId } = await params;
  try {
    const data = issuePublishedReferenceExecution({
      targetProjectId: projectId,
      grantId,
      materializationId:
        request.nextUrl.searchParams.get("materialization") ?? "",
      requestOrigin: request.nextUrl.origin,
    });
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const known =
      error instanceof ReferenceProjectionError
        ? error
        : new ReferenceProjectionError(
            "HTML_RUNTIME_FAILED",
            "引用页面执行票据签发失败",
            500,
          );
    return NextResponse.json(
      { success: false, error: { code: known.code, message: known.message } },
      { status: known.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

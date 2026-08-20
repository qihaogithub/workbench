import { NextRequest, NextResponse } from "next/server";
import { issuePublishedHtmlExecution } from "@/lib/published-html-execution";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; pageId: string }> },
) {
  const { projectId, pageId } = await params;
  const result = issuePublishedHtmlExecution({
    projectId,
    pageId,
    version: request.nextUrl.searchParams.get("version") ?? "",
    requestOrigin: request.nextUrl.origin,
  });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: { code: "HTML_RUNTIME_FAILED", message: result.message } },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { success: true, data: result.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}

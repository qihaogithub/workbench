import { NextRequest, NextResponse } from "next/server";

import {
  buildHtmlSandboxExecutionDocument,
  getHtmlSandboxResponseHeaders,
  readHtmlSandboxExecution,
  resolveHtmlSandboxFrameAncestors,
} from "@/lib/html-sandbox-execution";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  if (request.headers.get("sec-fetch-dest") !== "iframe") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "HTML execution 仅允许在受控 iframe 中加载" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { executionId } = await params;
  const ticket = readHtmlSandboxExecution(executionId);
  if (!ticket) {
    return NextResponse.json(
      { success: false, error: { code: "HTML_RUNTIME_FAILED", message: "HTML execution 不存在或已过期" } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const frameAncestors = resolveHtmlSandboxFrameAncestors();
  if (frameAncestors.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: "HTML_RUNTIME_FAILED", message: "HTML sandbox frame ancestors 未配置" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return new NextResponse(buildHtmlSandboxExecutionDocument(ticket), {
    status: 200,
    headers: getHtmlSandboxResponseHeaders(frameAncestors),
  });
}

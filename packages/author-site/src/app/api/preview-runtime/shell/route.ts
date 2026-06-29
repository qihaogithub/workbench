import { NextRequest, NextResponse } from "next/server";
import { generateIframeHtml } from "@opencode-workbench/demo-ui/iframe-template";

import { getCdnBaseUrl } from "@/lib/cdn-config";
import { shouldUsePreviewRuntimeCdn } from "@/lib/preview-runtime-manifest";

export async function GET(request: NextRequest) {
  const requestedSource = request.nextUrl.searchParams.get("runtimeSource");
  const useCdnRuntime = requestedSource === "cdn" || shouldUsePreviewRuntimeCdn();
  const html = generateIframeHtml({
    supportUrlMode: true,
    cdnBaseUrl: getCdnBaseUrl(),
    useCdnRuntime,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

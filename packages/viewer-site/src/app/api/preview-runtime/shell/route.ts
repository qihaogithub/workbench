import { NextResponse } from "next/server";
import { generateIframeHtml } from "@workbench/demo-ui/iframe-template";

function shouldUsePreviewRuntimeCdn(): boolean {
  return (
    process.env.PREVIEW_RUNTIME_SOURCE === "cdn" ||
    process.env.PREVIEW_RUNTIME_CDN_FALLBACK === "1"
  );
}

export async function GET() {
  const useCdnRuntime = shouldUsePreviewRuntimeCdn();
  const html = generateIframeHtml({
    supportUrlMode: true,
    cdnBaseUrl: process.env.CDN_BASE_URL || "https://esm.sh",
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

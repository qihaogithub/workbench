import { NextResponse } from "next/server";
import { generateIframeHtml } from "@workbench/demo-ui/iframe-template";
import { DEFAULT_CDN_BASE_URL } from "@workbench/runtime-config/topology";

// 该 shell 只读取构建时环境变量；viewer 的静态导出必须把这一点显式告知 Next。
export const dynamic = "force-static";

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
    cdnBaseUrl: process.env.CDN_BASE_URL || DEFAULT_CDN_BASE_URL,
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

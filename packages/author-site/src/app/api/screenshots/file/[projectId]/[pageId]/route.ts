import type { NextRequest } from "next/server";

import {
  getLocalScreenshotMetadata,
  isSafeScreenshotIdentifier,
  normalizeScreenshotHash,
  readLocalScreenshotFile,
} from "@/lib/screenshot-file-store";
import { fetchScreenshotService } from "@/lib/screenshot-service";

async function proxyScreenshot(
  projectId: string,
  pageId: string,
  search: string,
): Promise<Response | null> {
  try {
    const response = await fetchScreenshotService(
      `/api/screenshots/file/${encodeURIComponent(projectId)}/${encodeURIComponent(pageId)}${search}`,
    );
    if (response.status === 404) return null;
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Cache-Control":
          response.headers.get("Cache-Control") ||
          (search.includes("meta=1") ? "no-store" : "public, max-age=3600"),
      },
    });
  } catch {
    return null;
  }
}

function notFound(message: string) {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "NOT_FOUND", message },
    }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } },
) {
  const { projectId, pageId } = params;
  if (
    !isSafeScreenshotIdentifier(projectId) ||
    !isSafeScreenshotIdentifier(pageId)
  ) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "INVALID_SCREENSHOT_ID", message: "截图标识非法" },
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (request.nextUrl.searchParams.get("meta") === "1") {
    const metadata = getLocalScreenshotMetadata(projectId, pageId);
    if (metadata) {
      return new Response(
        JSON.stringify({ success: true, data: metadata }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return (
      (await proxyScreenshot(projectId, pageId, "?meta=1")) ??
      notFound("Screenshot meta not found")
    );
  }

  const rawHash = request.nextUrl.searchParams.get("hash");
  const normalizedHash = normalizeScreenshotHash(rawHash);
  if (rawHash && !normalizedHash) {
    return notFound("Screenshot file not found");
  }
  const variant =
    request.nextUrl.searchParams.get("variant") === "fast" ? "fast" : "strict";
  const local = readLocalScreenshotFile({
    projectId,
    pageId,
    hash: rawHash,
    variant,
  });
  if (local) {
    return new Response(new Uint8Array(local.buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": local.immutable
          ? "public, max-age=31536000, immutable"
          : "no-store",
      },
    });
  }

  return (
    (await proxyScreenshot(projectId, pageId, request.nextUrl.search)) ??
    notFound("Screenshot file not found")
  );
}

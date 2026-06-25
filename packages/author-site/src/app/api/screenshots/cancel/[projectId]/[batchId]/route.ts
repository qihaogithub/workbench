import { NextRequest } from "next/server";

import {
  createScreenshotProxyTimeoutResponse,
  createScreenshotServiceUnavailableResponse,
  fetchScreenshotService,
  isAbortError,
} from "@/lib/screenshot-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string; batchId: string } },
) {
  const { projectId, batchId } = params;

  try {
    const response = await fetchScreenshotService(
      `/api/screenshots/cancel/${encodeURIComponent(
        projectId,
      )}/${encodeURIComponent(batchId)}`,
      { method: "POST" },
    );

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    if (isAbortError(error)) {
      return createScreenshotProxyTimeoutResponse();
    }
    return createScreenshotServiceUnavailableResponse();
  }
}

import { NextRequest } from "next/server";

import {
  createScreenshotServiceUnavailableResponse,
  createScreenshotProxyTimeoutResponse,
  fetchScreenshotService,
  isAbortError,
} from "@/lib/screenshot-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; batchId: string } },
) {
  const { projectId, batchId } = params;

  try {
    const response = await fetchScreenshotService(
      `/api/screenshots/status/${encodeURIComponent(
        projectId,
      )}/${encodeURIComponent(batchId)}`,
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

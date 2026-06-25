import { NextRequest } from "next/server";

import {
  createScreenshotServiceUnavailableResponse,
  createScreenshotProxyTimeoutResponse,
  fetchScreenshotService,
  getScreenshotRequestId,
  isAbortError,
} from "@/lib/screenshot-service";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const requestId = getScreenshotRequestId(request.headers);

  try {
    const response = await fetchScreenshotService(
      "/api/screenshots/generate-batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        requestId,
      },
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

import { NextRequest } from "next/server";

import {
  createScreenshotServiceUnavailableResponse,
  getScreenshotServiceUrl,
} from "@/lib/screenshot-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; batchId: string } },
) {
  const { projectId, batchId } = params;

  try {
    const response = await fetch(
      `${getScreenshotServiceUrl()}/api/screenshots/status/${encodeURIComponent(
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
  } catch {
    return createScreenshotServiceUnavailableResponse();
  }
}


import { NextRequest } from "next/server";

import {
  createScreenshotServiceUnavailableResponse,
  getScreenshotServiceUrl,
} from "@/lib/screenshot-service";

export async function POST(request: NextRequest) {
  const body = await request.text();

  try {
    const response = await fetch(
      `${getScreenshotServiceUrl()}/api/screenshots/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      },
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


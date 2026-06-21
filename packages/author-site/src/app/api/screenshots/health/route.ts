import {
  createScreenshotServiceUnavailableResponse,
  getScreenshotServiceUrl,
} from "@/lib/screenshot-service";

export async function GET() {
  try {
    const response = await fetch(`${getScreenshotServiceUrl()}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return createScreenshotServiceUnavailableResponse();
    }

    const data = await response.json();
    return Response.json({
      success: true,
      data,
    });
  } catch {
    return createScreenshotServiceUnavailableResponse();
  }
}

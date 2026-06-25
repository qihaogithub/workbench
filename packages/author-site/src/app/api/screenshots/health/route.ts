import {
  createScreenshotServiceUnavailableResponse,
  createScreenshotProxyTimeoutResponse,
  fetchScreenshotService,
  isAbortError,
} from "@/lib/screenshot-service";

export async function GET() {
  try {
    const response = await fetchScreenshotService("/health", {
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
  } catch (error) {
    if (isAbortError(error)) {
      return createScreenshotProxyTimeoutResponse();
    }
    return createScreenshotServiceUnavailableResponse();
  }
}

const DEFAULT_SCREENSHOT_SERVICE_URL = "http://localhost:3202";

export function getScreenshotServiceUrl(): string {
  return (
    process.env.SCREENSHOT_SERVICE_URL ||
    process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL ||
    DEFAULT_SCREENSHOT_SERVICE_URL
  ).replace(/\/+$/, "");
}

export function createScreenshotServiceUnavailableResponse() {
  return Response.json(
    {
      success: false,
      error: {
        code: "SCREENSHOT_SERVICE_UNAVAILABLE",
        message: "截图服务不可达",
      },
    },
    { status: 503 },
  );
}


export type ScreenshotErrorCode =
  | "COMPILE_ERROR"
  | "RUNTIME_ERROR"
  | "BROWSER_LAUNCH_ERROR"
  | "RENDER_TIMEOUT"
  | "SELECTOR_TIMEOUT"
  | "QUEUE_TIMEOUT"
  | "SCREENSHOT_WRITE_ERROR"
  | "SCREENSHOT_ERROR";

export class ScreenshotError extends Error {
  readonly code: ScreenshotErrorCode;

  constructor(code: ScreenshotErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ScreenshotError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function getScreenshotErrorCode(error: unknown): ScreenshotErrorCode {
  if (error instanceof ScreenshotError) {
    return error.code;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Compile") || message.includes("编译")) {
    return "COMPILE_ERROR";
  }
  return "SCREENSHOT_ERROR";
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { ErrorCodeType, ERROR_MESSAGES } from "@workbench/shared";

export function createApiError(
  code: ErrorCodeType,
  message?: string,
  details?: unknown,
) {
  return {
    success: false as const,
    error: {
      code,
      message: message || ERROR_MESSAGES[code],
      details,
    },
  };
}

export function createApiSuccess<T>(data: T) {
  return {
    success: true as const,
    data,
  };
}

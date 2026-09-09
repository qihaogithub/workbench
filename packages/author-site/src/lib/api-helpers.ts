import { ErrorCodeType, ERROR_MESSAGES } from "@workbench/shared";

export function createApiError(
  code: ErrorCodeType | (string & {}),
  message?: string,
  details?: unknown,
) {
  const fallbackMessage = code in ERROR_MESSAGES
    ? ERROR_MESSAGES[code as ErrorCodeType]
    : code;
  return {
    success: false as const,
    error: {
      code,
      message: message || fallbackMessage,
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

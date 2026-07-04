const SAFE_ERROR_FIELDS = [
  'name',
  'message',
  'code',
  'status',
  'statusCode',
  'type',
  'errno',
  'syscall',
  'path',
  'url',
  'method',
] as const;

const MAX_ERROR_STRING_LENGTH = 4000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function truncate(value: string): string {
  return value.length > MAX_ERROR_STRING_LENGTH
    ? `${value.slice(0, MAX_ERROR_STRING_LENGTH)}...<truncated>`
    : value;
}

function getProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function copySafeFields(source: unknown, target: Record<string, unknown>): void {
  if (!isRecord(source)) return;

  const ownKeys = new Set([
    ...Object.keys(source),
    ...Object.getOwnPropertyNames(source),
  ]);

  for (const key of SAFE_ERROR_FIELDS) {
    if (!ownKeys.has(key)) continue;
    const value = source[key];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      target[key] = typeof value === 'string' ? truncate(value) : value;
    }
  }
}

function serializeCause(cause: unknown, depth: number): unknown {
  if (cause === undefined || depth > 2) return undefined;
  if (cause instanceof Error || isRecord(cause)) {
    return serializeErrorForLog(cause, depth + 1);
  }
  if (typeof cause === 'string') return truncate(cause);
  return String(cause);
}

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  const message = getProperty(error, 'message');
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  const nestedError = getProperty(error, 'error');
  if (typeof nestedError === 'string' && nestedError.trim()) {
    return nestedError;
  }
  const nestedMessage = getProperty(nestedError, 'message');
  if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
    return nestedMessage;
  }

  return fallback;
}

export function serializeErrorForLog(error: unknown, depth = 0): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: truncate(error.message),
      stack: typeof error.stack === 'string' ? truncate(error.stack) : undefined,
    };
    copySafeFields(error, serialized);
    const cause = serializeCause(error.cause, depth);
    if (cause !== undefined) serialized.cause = cause;
    return serialized;
  }

  if (typeof error === 'string') {
    return { message: truncate(error), type: 'string' };
  }

  if (!isRecord(error)) {
    return { message: String(error), type: typeof error };
  }

  const serialized: Record<string, unknown> = {
    type: Object.prototype.toString.call(error),
    keys: Object.keys(error),
    ownPropertyNames: Object.getOwnPropertyNames(error),
  };
  copySafeFields(error, serialized);

  const cause = serializeCause(getProperty(error, 'cause'), depth);
  if (cause !== undefined) serialized.cause = cause;

  const response = getProperty(error, 'response');
  if (isRecord(response)) {
    const responseSummary: Record<string, unknown> = {};
    copySafeFields(response, responseSummary);
    if (Object.keys(responseSummary).length > 0) {
      serialized.response = responseSummary;
    }
  }

  const message = getErrorMessage(error, '');
  if (message && serialized.message === undefined) {
    serialized.message = truncate(message);
  }

  return serialized;
}

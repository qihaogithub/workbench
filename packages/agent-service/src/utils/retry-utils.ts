const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

export interface RetryMeta {
  attempt: number;
  maxRetries: number;
  waitMs: number;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export async function withLlmRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  onRetry?: (error: unknown, meta: RetryMeta) => void,
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * 0.5 * Math.random();
      const waitMs = Math.round(delay + jitter);

      if (onRetry) {
        onRetry(error, { attempt, maxRetries, waitMs });
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

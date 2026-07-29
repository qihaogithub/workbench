import { getErrorMessage } from "./error-utils";
import { logger } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RetryMeta {
  attempt: number;
  maxRetries: number;
  waitMs: number;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 10_000;

export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  return typeof status === "number" ? status : undefined;
}

export function isRateLimitError(error: unknown): boolean {
  if (getErrorStatus(error) === 429) return true;
  const msg = getErrorMessage(error, "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("quota")
  );
}

/**
 * 识别可重试的 LLM API 错误。
 *
 * 触发场景：
 * - 429 限流
 * - 5xx 服务端错误（通过 error.status/statusCode 或消息中的 HTTP 状态码）
 * - 网络超时、连接重置、fetch 失败等
 *
 * 注意：pi-agent-core 不会抛出异常——API 失败时返回带 stopReason: "error" 的
 * AssistantMessage。上层将其包装为 new Error(errorMessage)，此时 status/statusCode
 * 属性已丢失。因此除了检查 error 对象上的 status 数值字段外，还需要匹配消息文本中的
 * HTTP 状态码（如 "502 Bad Gateway"、"503 Service Unavailable"）。
 */
export function isRetryableLlmError(error: unknown): boolean {
  if (isRateLimitError(error)) return true;

  const status = getErrorStatus(error);
  if (status && status >= 500 && status <= 599) return true;

  const msg = getErrorMessage(error, "").toLowerCase();

  // pi-agent-core 将 HTTP 状态码编码到 errorMessage 中
  // 典型格式："502 Bad Gateway", "503 Service Unavailable", "Internal Server Error (500)"
  if (/\b5\d{2}\b/.test(msg)) return true;

  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("connection error") ||
    msg.includes("service unavailable") ||
    msg.includes("bad gateway")
  );
}

export function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const retryAfter = record.retryAfter ?? record["retry-after"];
  if (typeof retryAfter === "number") return retryAfter * 1000;
  if (typeof retryAfter === "string") {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function computeBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  const baseDelay = Math.min(
    initialDelayMs * Math.pow(2, attempt),
    maxDelayMs,
  );
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.round(baseDelay + jitter);
}

/**
 * 执行带 LLM API 重试的异步操作。
 *
 * 默认使用 {@link isRetryableLlmError} 判定可重试性。可通过
 * `shouldRetry` 自定义判定函数。
 *
 * @param fn         要重试的异步函数
 * @param options    重试参数
 * @param onRetry    每次重试前的回调，可用于日志记录。若回调抛出异常则立即终止重试
 * @returns          成功时的返回值
 * @throws           超过最大重试、不可重试错误、或 onRetry 抛出时抛出原始错误
 */
export async function withLlmRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  onRetry?: (
    error: unknown,
    meta: RetryMeta,
  ) => void,
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableLlmError(error)) {
        throw error;
      }

      const retryAfter = getRetryAfterMs(error);
      const waitMs = retryAfter ?? computeBackoff(attempt, initialDelayMs, maxDelayMs);

      if (onRetry) {
        // onRetry 可抛出以终止重试（如检测到已超时或已取消）
        onRetry(error, { attempt, maxRetries, waitMs });
      }

      await sleep(waitMs);
      attempt++;
    }
  }
}

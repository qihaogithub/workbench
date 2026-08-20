export const SANDBOXED_HTML_CHANNEL = "workbench-sandboxed-html-v1";
export const SANDBOXED_HTML_MAX_MESSAGE_BYTES = 4096;
export const SANDBOXED_HTML_MAX_DEPTH = 5;
export const SANDBOXED_HTML_MAX_MESSAGES_PER_SECOND = 10;

export type SandboxedHtmlMessageType =
  | "READY"
  | "RESIZE"
  | "RUNTIME_ERROR"
  | "CONSOLE_LOG";

export interface SandboxedHtmlMessage {
  type: SandboxedHtmlMessageType;
  channel: string;
  channelId: string;
  loadGeneration: number;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

function valueDepth(value: unknown, current = 0): number {
  if (value === null || typeof value !== "object") return current;
  if (current >= SANDBOXED_HTML_MAX_DEPTH) return current + 1;
  return Math.max(
    current + 1,
    ...Object.values(value as Record<string, unknown>).map((item) =>
      valueDepth(item, current + 1),
    ),
  );
}

export function isSandboxedHtmlMessage(
  value: unknown,
  expectedChannelId: string,
  expectedGeneration: number,
): value is SandboxedHtmlMessage {
  if (value === null || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (
    typeof message.type !== "string" ||
    !["READY", "RESIZE", "RUNTIME_ERROR", "CONSOLE_LOG"].includes(message.type)
  ) return false;
  if (message.channel !== SANDBOXED_HTML_CHANNEL) return false;
  if (message.channelId !== expectedChannelId) return false;
  if (message.loadGeneration !== expectedGeneration) return false;
  try {
    if (JSON.stringify(value).length > SANDBOXED_HTML_MAX_MESSAGE_BYTES) return false;
  } catch {
    return false;
  }
  return valueDepth(value) <= SANDBOXED_HTML_MAX_DEPTH;
}

export function readSandboxedHtmlHeight(message: SandboxedHtmlMessage): number | undefined {
  const height = message.payload?.height;
  if (message.type !== "RESIZE" || typeof height !== "number") return undefined;
  if (!Number.isFinite(height) || height < 1 || height > 1_000_000) return undefined;
  return Math.round(height);
}

export interface SandboxedHtmlRateLimiter {
  accept(now?: number): boolean;
  reset(): void;
}

export function createSandboxedHtmlRateLimiter(
  max = SANDBOXED_HTML_MAX_MESSAGES_PER_SECOND,
): SandboxedHtmlRateLimiter {
  let windowStart = 0;
  let count = 0;
  return {
    accept(now = Date.now()) {
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (count >= max) return false;
      count += 1;
      return true;
    },
    reset() {
      windowStart = 0;
      count = 0;
    },
  };
}

export type AiErrorCategory =
  | "connection"
  | "timeout"
  | "auth"
  | "quota"
  | "busy"
  | "cancelled"
  | "server"
  | "unknown";

export interface NormalizedAiError {
  code: string;
  category: AiErrorCategory;
  userMessage: string;
  technicalMessage?: string;
}

interface NormalizeAiErrorOptions {
  fallbackCode?: string;
  fallbackMessage?: string;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : undefined;
}

function getNestedMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const nested = record.error;
  return getStringProperty(nested, "message");
}

function extractTechnicalMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return getStringProperty(error, "message") || getNestedMessage(error);
}

function extractCode(error: unknown): string | undefined {
  return getStringProperty(error, "code") || getStringProperty(error, "name");
}

function classifyAiError(code: string | undefined, message: string): AiErrorCategory {
  // 优先根据结构化错误码分类，不再仅依赖文本匹配
  if (code === "RATE_LIMIT_EXCEEDED") return "quota";
  if (code === "MESSAGE_TIMEOUT") return "timeout";
  if (code === "AGENT_BUSY") return "busy";

  const haystack = `${code || ""} ${message}`.toLowerCase();
  if (
    haystack.includes("agent_busy") ||
    haystack.includes("currently processing") ||
    haystack.includes("仍在运行") ||
    haystack.includes("上一轮")
  ) {
    return "busy";
  }
  if (
    haystack.includes("abort") ||
    haystack.includes("cancel") ||
    haystack.includes("cancelled") ||
    haystack.includes("canceled")
  ) {
    return "cancelled";
  }
  if (
    haystack.includes("timeout") ||
    haystack.includes("timed out") ||
    haystack.includes("etimedout") ||
    haystack.includes("连接超时")
  ) {
    return "timeout";
  }
  if (
    haystack.includes("econnrefused") ||
    haystack.includes("enotfound") ||
    haystack.includes("econnreset") ||
    haystack.includes("network") ||
    haystack.includes("fetch failed") ||
    haystack.includes("connection error") ||
    haystack.includes("websocket") ||
    haystack.includes("socket")
  ) {
    return "connection";
  }
  if (
    haystack.includes("unauthorized") ||
    haystack.includes("forbidden") ||
    haystack.includes("invalid api key") ||
    haystack.includes("api key") ||
    haystack.includes("401") ||
    haystack.includes("403")
  ) {
    return "auth";
  }
  if (
    haystack.includes("quota") ||
    haystack.includes("rate limit") ||
    haystack.includes("rate_limit") ||
    haystack.includes("429") ||
    haystack.includes("insufficient")
  ) {
    return "quota";
  }
  if (
    haystack.includes("500") ||
    haystack.includes("502") ||
    haystack.includes("503") ||
    haystack.includes("504") ||
    haystack.includes("internal") ||
    haystack.includes("server")
  ) {
    return "server";
  }
  return "unknown";
}

function userMessageForCategory(
  category: AiErrorCategory,
  fallbackMessage: string,
): string {
  switch (category) {
    case "connection":
      return "AI 服务暂时连接不上，请检查网络或稍后重试。";
    case "timeout":
      return "AI 服务响应超时，请稍后重试或换个更简短的问题。";
    case "auth":
      return "AI 服务鉴权失败，请联系管理员检查模型 API 配置。";
    case "quota":
      return "AI 服务额度或频率受限，请稍后重试。";
    case "busy":
      return "上一轮 AI 请求仍在运行，请等待完成或先取消后再发送。";
    case "cancelled":
      return "本次 AI 请求已取消，可以重新发送。";
    case "server":
      return "AI 服务暂时异常，请稍后重试。";
    case "unknown":
      return fallbackMessage;
  }
}

export function normalizeAiError(
  error: unknown,
  options: NormalizeAiErrorOptions = {},
): NormalizedAiError {
  const technicalMessage = extractTechnicalMessage(error);
  const code = extractCode(error) || options.fallbackCode || "AI_ERROR";
  const category = classifyAiError(code, technicalMessage || "");
  return {
    code,
    category,
    userMessage: userMessageForCategory(
      category,
      options.fallbackMessage || "AI 请求失败，请稍后重试。",
    ),
    technicalMessage,
  };
}

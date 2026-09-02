import type { ChatMessage } from "../../message";
import { getConfiguredAgentClient } from "../../config";

export const CONVERSATION_TITLE_FALLBACK = "新对话";

const MAX_CJK_TITLE_LENGTH = 12;
const MAX_GENERAL_TITLE_LENGTH = 24;
const MIN_CJK_TITLE_LENGTH = 3;
const MIN_GENERAL_TITLE_LENGTH = 6;

const MARKDOWN_PATTERN = /[`*_>#~]+/g;
const QUOTE_PATTERN = /^[\s"'“”‘’「」『』【】《》]+|[\s"'“”‘’「」『』【】《》]+$/g;
const TRAILING_PUNCTUATION_PATTERN = /[。！？!?；;，,、：:。.]+$/u;
const PUNCTUATION_PATTERN = /[\p{P}\p{S}]+/gu;

function getSignificantCharacters(value: string): string[] {
  return Array.from(value).filter(
    (character) => !/[\s\p{P}\p{S}]/u.test(character),
  );
}

function isMeaningfulTitle(value: string): boolean {
  const compact = value.replace(/[\s\p{P}\p{S}]+/gu, "");
  return compact.length > 0;
}

function isGenericTitle(value: string): boolean {
  return new Set([
    CONVERSATION_TITLE_FALLBACK,
    "标题",
    "会话标题",
    "对话标题",
    "untitled",
    "conversation",
  ]).has(value.toLowerCase());
}

function truncateUnicode(
  value: string,
  maxLength: number,
  preferWordBoundary = false,
): string {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  const truncated = characters.slice(0, maxLength).join("");
  if (preferWordBoundary) {
    const boundary = truncated.lastIndexOf(" ");
    if (boundary >= MIN_GENERAL_TITLE_LENGTH) {
      return truncated.slice(0, boundary);
    }
  }
  return truncated;
}

/**
 * 清理模型返回的标题，拒绝解释性文本并统一长度、标点和 Markdown 形态。
 */
export function normalizeConversationTitle(
  rawTitle: string | null | undefined,
  fallback = CONVERSATION_TITLE_FALLBACK,
): string {
  if (!rawTitle) return fallback;

  let normalized = rawTitle
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(MARKDOWN_PATTERN, "")
    .replace(QUOTE_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_PUNCTUATION_PATTERN, "")
    .trim();

  normalized = normalized
    .replace(
      /^(?:标题|title|会话标题|对话标题|以下(?:是|为)(?:本次)?(?:对话)?标题|here(?:'s| is)\s+(?:a\s+)?(?:concise\s+)?title)\s*[:：-]?\s*/iu,
      "",
    )
    .trim();

  // 模型偶尔会返回“标题：xxx”或带解释的完整句子，取首个短句即可。
  normalized = normalized.split(/[。！？!?；;\n]/u)[0]?.trim() || "";
  normalized = normalized.replace(TRAILING_PUNCTUATION_PATTERN, "").trim();

  if (
    !isMeaningfulTitle(normalized) ||
    isGenericTitle(normalized) ||
    normalized.startsWith("{") ||
    normalized.startsWith("[") ||
    /^(?:[-*•]\s+|\d+[.)、]\s+)/u.test(normalized) ||
    /["']title["']\s*:/iu.test(normalized) ||
    /^(?:我(?:建议|推荐)|建议使用|这是(?:一个)?标题)/u.test(normalized) ||
    /^(?:the title is|this title is)\s/iu.test(normalized)
  ) {
    return fallback;
  }

  normalized = normalized.replace(PUNCTUATION_PATTERN, "").replace(/\s+/g, " ").trim();

  const significantCharacters = getSignificantCharacters(normalized);
  const chineseCharacterCount = significantCharacters.filter((character) =>
    /[\u3400-\u9fff]/u.test(character),
  ).length;
  const hasNonChineseCharacters = significantCharacters.some(
    (character) => !/[\u3400-\u9fff]/u.test(character),
  );
  const chineseTitle = chineseCharacterCount > 0 && !hasNonChineseCharacters;
  const maxLength = chineseTitle
    ? MAX_CJK_TITLE_LENGTH
    : MAX_GENERAL_TITLE_LENGTH;
  const minLength = chineseTitle
    ? MIN_CJK_TITLE_LENGTH
    : MIN_GENERAL_TITLE_LENGTH;
  normalized = truncateUnicode(normalized, maxLength, !chineseTitle).trim();

  if (Array.from(normalized.replace(/[\s\p{P}\p{S}]+/gu, "")).length < minLength) {
    return fallback;
  }

  return normalized || fallback;
}

/**
 * 根据首条用户消息生成无需网络请求的即时标题。
 */
export function deriveConversationTitle(content: string): string {
  const prepared = content
    .trim()
    .replace(/^(?:请帮我|请|帮我|能否|可以)\s*/u, "")
    .replace(/(?:这张|这个|当前)/gu, "");
  return normalizeConversationTitle(prepared, CONVERSATION_TITLE_FALLBACK);
}

export function deriveConversationTitleFromMessages(
  messages: ChatMessage[],
): string {
  const firstUserMessage = messages.find(
    (message) =>
      message.role === "user" &&
      !message.queueStatus &&
      !message.visualProperty &&
      message.kind !== "auto_repair" &&
      Boolean(message.content.trim()),
  );
  return deriveConversationTitle(firstUserMessage?.content || "");
}

/**
 * 使用当前模型异步生成标题。服务端失败时返回 null，由调用方保留即时标题。
 */
export async function requestConversationTitle(
  agentSessionId: string,
  content: string,
  model?: string,
): Promise<string | null> {
  if (!agentSessionId || !content.trim()) return null;

  try {
    const response = await getConfiguredAgentClient().generateConversationTitle(
      agentSessionId,
      { content: content.trim(), model },
    );
    if (!response.success) return null;
    const title = normalizeConversationTitle(response.data.title);
    return title === CONVERSATION_TITLE_FALLBACK ? null : title;
  } catch {
    return null;
  }
}

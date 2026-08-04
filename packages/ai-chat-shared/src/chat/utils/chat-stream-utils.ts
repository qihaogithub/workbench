import type { MessagePart } from "../../message";

export function updateTextPart(
  parts: MessagePart[],
  content: string,
): MessagePart[] {
  const newParts = [...parts];
  const lastPart = newParts[newParts.length - 1];

  if (lastPart && lastPart.type === "text") {
    newParts[newParts.length - 1] = {
      ...lastPart,
      content: lastPart.content + content,
    };
  } else {
    newParts.push({ type: "text", content });
  }

  return newParts;
}

export function addThoughtPart(
  parts: MessagePart[],
  content: string,
): MessagePart[] {
  const newParts = [...parts];
  const lastPart = newParts[newParts.length - 1];

  if (
    lastPart &&
    lastPart.type === "reasoning" &&
    lastPart.content.length < 500
  ) {
    newParts[newParts.length - 1] = {
      ...lastPart,
      content: lastPart.content + content,
    };
  } else {
    newParts.push({
      type: "reasoning",
      content,
      timestamp: Date.now(),
    });
  }

  return newParts;
}

export interface ToolCallEvent {
  toolCallId: string;
  toolName: string;
  status: string;
  parameters: Record<string, unknown>;
  timestamp?: number;
}

type MessageToolStatus = Extract<MessagePart, { type: "tool" }>["status"];

function normalizeToolStatus(status?: string): MessageToolStatus {
  if (status === "completed" || status === "success") return "completed";
  if (status === "failed" || status === "error") return "error";
  if (status === "awaiting-approval") return "awaiting-approval";
  return "running";
}

export function addToolPart(
  parts: MessagePart[],
  toolCall: ToolCallEvent,
): MessagePart[] {
  return [
    ...parts,
    {
      type: "tool" as const,
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      status: normalizeToolStatus(toolCall.status),
      parameters: toolCall.parameters,
      startedAt: toolCall.timestamp || Date.now(),
    },
  ];
}

export interface ToolUpdateEvent {
  toolCallId: string;
  toolCallStatus?: string;
  content?: string;
  result?: unknown;
  details?: unknown;
  durationMs?: number;
  error?: { message?: string };
  timestamp?: number;
}

export function updateToolPart(
  parts: MessagePart[],
  update: ToolUpdateEvent,
): MessagePart[] {
  const { toolCallId } = update;
  if (!toolCallId) return parts;

  return parts.map((part) => {
    if (part.type === "tool" && part.toolCallId === toolCallId) {
      const newStatus = update.toolCallStatus
        ? normalizeToolStatus(update.toolCallStatus)
        : part.status;

      let result = update.result ?? part.result;
      if (update.details !== undefined) {
        if (result && typeof result === "object" && !Array.isArray(result)) {
          result = { ...result, details: update.details };
        } else {
          result = { details: update.details, content: result };
        }
      }
      if (update.content && result === undefined) {
        try {
          result = JSON.parse(update.content);
        } catch {
          result = update.content;
        }
      }

      if (update.toolCallStatus === "failed" && !result) {
        result = {
          error: "工具执行失败",
          details: update.error?.message || "未知错误",
        };
      }

      return {
        ...part,
        status: newStatus,
        result,
        details: update.details ?? part.details,
        duration: update.durationMs ?? part.duration,
        endedAt:
          newStatus === "completed" || newStatus === "error"
            ? update.timestamp || Date.now()
            : part.endedAt,
      };
    }
    return part;
  });
}

export function parseToolCallFromEvent(event: any): ToolCallEvent {
  let toolName = "未知工具";
  if (event.name) {
    toolName = event.name;
  } else if (event.toolName) {
    toolName = event.toolName;
  } else if (event.title) {
    toolName = event.title.includes("›")
      ? event.title.split("›")[0].trim()
      : event.title;
  }

  const parameters = event.arguments || event.parameters || {};

  let extractedPath: string | undefined;
  if (event.title && event.title.includes("›")) {
    extractedPath = event.title.split("›").pop()?.trim();
  }

  return {
    toolCallId: event.toolCallId || `tool-${Date.now()}`,
    toolName,
    status: event.toolCallStatus || "running",
    parameters: {
      ...parameters,
      path: extractedPath || parameters.path || parameters.file_path,
    },
    timestamp: event.timestamp,
  };
}

/**
 * 扫描文本 parts 中的图片 URL，将文本内容拆分为 text + image 交替的 parts。
 * 匹配 /api/images/ 和 /api/screenshots/file/ 路径。
 */
const IMAGE_URL_PATTERN = /\/api\/(?:images\/[a-zA-Z0-9_\-\.]+|screenshots\/file\/[a-zA-Z0-9_\/\-\.\=]+)(?:\?t=\d+)?/g;

export function extractImageUrlsFromParts(parts: MessagePart[]): MessagePart[] {
  const result: MessagePart[] = [];

  for (const part of parts) {
    if (part.type !== "text") {
      result.push(part);
      continue;
    }

    const content = part.content;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let found = false;

    IMAGE_URL_PATTERN.lastIndex = 0;

    while ((match = IMAGE_URL_PATTERN.exec(content)) !== null) {
      found = true;
      if (match.index > lastIndex) {
        result.push({ type: "text", content: content.slice(lastIndex, match.index) });
      }
      result.push({ type: "image", url: match[0] });
      lastIndex = match.index + match[0].length;
    }

    if (!found) {
      result.push(part);
    } else if (lastIndex < content.length) {
      result.push({ type: "text", content: content.slice(lastIndex) });
    }
  }

  return result;
}

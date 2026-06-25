import type { MessagePart } from "@/components/ai-elements";

export function updateTextPart(
  parts: MessagePart[],
  content: string,
  accumulatedContent: string,
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
      status: toolCall.status as "running" | "completed" | "error",
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
      const newStatus =
        update.toolCallStatus === "completed"
          ? ("completed" as const)
          : update.toolCallStatus === "failed"
            ? ("error" as const)
            : update.toolCallStatus === "in_progress"
              ? ("running" as const)
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

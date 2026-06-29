/**
 * Assistant 消息解析工具函数
 *
 * 从底层 Agent 响应中提取文本、错误信息等，供 EventMapper 和其他管理器共享。
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextualContentBlock(value: Record<string, unknown>): boolean {
  const type = value.type;
  return (
    typeof type !== 'string' ||
    type.includes('text') ||
    type === 'assistant' ||
    type === 'message'
  );
}

export function extractAssistantText(value: unknown): string {
  const chunks: string[] = [];
  const containerKeys = [
    'content',
    'output',
    'outputs',
    'response',
    'result',
    'data',
    'message',
    'messages',
    'assistantMessage',
    'parts',
    'choices',
    'delta',
  ];

  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      chunks.push(node);
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (!isRecord(node)) return;

    if (typeof node.text === 'string' && isTextualContentBlock(node)) {
      chunks.push(node.text);
    }

    if (typeof node.value === 'string' && isTextualContentBlock(node)) {
      chunks.push(node.value);
    }

    for (const key of containerKeys) {
      if (key in node) {
        visit(node[key]);
      }
    }
  };

  visit(value);
  return chunks.join('').trim();
}

export function extractAssistantErrorMessage(value: unknown, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractAssistantErrorMessage(item, depth + 1);
      if (message) return message;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  const directError = value.errorMessage;
  if (typeof directError === 'string' && directError.trim()) {
    return directError.trim();
  }

  const error = value.error;
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  const errors = value.errors;
  if (Array.isArray(errors)) {
    const nestedError = extractAssistantErrorMessage(errors, depth + 1);
    if (nestedError) return nestedError;
  }

  const response = value.response;
  if (response !== undefined) {
    const nestedError = extractAssistantErrorMessage(response, depth + 1);
    if (nestedError) return nestedError;
  }

  return undefined;
}

export function summarizeAssistantMessageShape(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return { type: typeof value };
  }

  const content = value.content;
  const errorMessage = extractAssistantErrorMessage(value);
  return {
    keys: Object.keys(value),
    contentType: Array.isArray(content) ? 'array' : typeof content,
    contentLength: Array.isArray(content) || typeof content === 'string' ? content.length : undefined,
    contentItemTypes: Array.isArray(content)
      ? content.map((item) => (isRecord(item) ? item.type : typeof item)).slice(0, 10)
      : undefined,
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    stopReason: typeof value.stopReason === 'string' ? value.stopReason : undefined,
    errorMessage,
  };
}

export function getToolResultDetails(event: any): any {
  return event?.details ?? event?.result?.details ?? event?.output?.details ?? event?.toolResult?.details;
}

export function getToolResultContent(event: any): string | undefined {
  const content = event?.content ?? event?.result?.content ?? event?.output?.content ?? event?.toolResult?.content;
  const text = extractAssistantText(content);
  return text || undefined;
}

export function getToolResultPayload(event: any): unknown {
  return event?.result ?? event?.output ?? event?.toolResult ?? undefined;
}

export function getDeletedPagesFromToolResult(event: any): Array<{ pageId: string; deletedPaths?: string[] }> {
  const details = getToolResultDetails(event);
  if (!details || !Array.isArray(details.deletedPages)) return [];
  return details.deletedPages.filter((page: any) => typeof page?.pageId === 'string');
}

export function getToolInput(event: any): any {
  return event?.input ?? event?.args ?? event?.arguments ?? event?.parameters ?? {};
}

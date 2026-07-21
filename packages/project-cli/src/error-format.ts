/**
 * 将 author-site 发布错误的结构化 details 转成可读摘要行，
 * 供人机可读模式在 warnings 中直接展示关键错误。
 */
export function formatPublishErrorDetails(details: unknown): string[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }
  const record = details as {
    pages?: Array<{
      pageId?: string;
      name?: string;
      errors?: Array<{ message?: string }>;
    }>;
    images?: Array<{ url?: string; reason?: string }>;
  };
  const lines: string[] = [];
  if (Array.isArray(record.pages)) {
    for (const page of record.pages) {
      const label = page.name || page.pageId || "未知页面";
      const messages = Array.isArray(page.errors)
        ? page.errors
            .map((item) => item.message)
            .filter((message): message is string => Boolean(message))
        : [];
      if (messages.length === 0) {
        lines.push(`页面 ${label}: 编译失败`);
      } else {
        for (const message of messages) {
          lines.push(`页面 ${label}: ${firstLine(message)}`);
        }
      }
    }
  }
  if (Array.isArray(record.images)) {
    for (const image of record.images) {
      if (!image.url) continue;
      lines.push(`图片 ${image.url}: ${image.reason ?? "不可用"}`);
    }
  }
  return lines;
}

function firstLine(message: string): string {
  const line = message.split("\n", 1)[0]?.trim() ?? message;
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

"use client";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;

function resolveRelativePath(relativePath: string, basePath: string): string {
  const parts = basePath.split("/").filter((part) => part !== "");
  const relativeParts = relativePath.split("/");

  for (const part of relativeParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

export function resolvePreviewConfigAssetUrls(
  data: Record<string, unknown>,
  options: {
    sessionId?: string;
    demoId?: string;
    origin?: string;
  } = {},
): Record<string, unknown> {
  const origin =
    options.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  if (!origin) return data;

  const basePath = options.demoId ? `demos/${options.demoId}/` : "";

  function walk(value: unknown): unknown {
    if (typeof value === "string") {
      if (value.startsWith("/api/sessions/")) {
        return origin + value;
      }
      if (
        options.sessionId &&
        basePath &&
        /^\.\.?\/[^'")\s]*$/.test(value) &&
        IMAGE_EXT_RE.test(value)
      ) {
        const resolved = resolveRelativePath(value, basePath);
        return `${origin}/api/sessions/${options.sessionId}/workspace/${resolved}`;
      }
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value)) {
        result[key] = walk(child);
      }
      return result;
    }
    return value;
  }

  return walk(data) as Record<string, unknown>;
}

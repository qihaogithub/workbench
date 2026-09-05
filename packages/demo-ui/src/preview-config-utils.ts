"use client";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)([?#][^'")\s]*)?$/i;

const RELATIVE_PATH_RE = /^\.\.?\/[^'")\s]*$/;

function isWorkspaceAssetImage(value: string): boolean {
  const pathname = value.split(/[?#]/, 1)[0] ?? value;
  if (!pathname.startsWith("assets/")) return false;
  const segments = pathname.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".."))
    return false;
  return IMAGE_EXT_RE.test(value);
}

function workspaceAssetUrl(sessionId: string, value: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/workspace/${value}`;
}

export function resolveRelativePath(relativePath: string, basePath: string): string {
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
      if (options.sessionId && isWorkspaceAssetImage(value)) {
        return `${origin}${workspaceAssetUrl(options.sessionId, value)}`;
      }
      if (
        options.sessionId &&
        basePath &&
        /^\.\.?\/[^'")\s]*$/.test(value) &&
        IMAGE_EXT_RE.test(value)
      ) {
        const resolved = resolveRelativePath(value, basePath);
        return `${origin}${workspaceAssetUrl(options.sessionId, resolved)}`;
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

export function resolveConfigImageSrc(
  value: string,
  sessionId?: string,
): string {
  if (!value || !sessionId) return value;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/api/")) {
    return value;
  }
  if (isWorkspaceAssetImage(value)) {
    return workspaceAssetUrl(sessionId, value);
  }
  if (RELATIVE_PATH_RE.test(value) && IMAGE_EXT_RE.test(value)) {
    const resolved = resolveRelativePath(value, "demos/_/");
    return workspaceAssetUrl(sessionId, resolved);
  }
  return value;
}

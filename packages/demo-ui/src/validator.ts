import type { PreviewSize } from "./types";

export function isSchemaEmpty(schema?: string | null): boolean {
  if (!schema) return true;
  try {
    const parsed = JSON.parse(schema);
    if (!parsed.properties || typeof parsed.properties !== "object") {
      return true;
    }
    return Object.keys(parsed.properties).length === 0;
  } catch {
    return true;
  }
}

export function getDefaultValues(schema: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(schema);
    const defaults: Record<string, unknown> = {};

    if (parsed.properties && typeof parsed.properties === "object") {
      for (const [key, value] of Object.entries(parsed.properties)) {
        const prop = value as { default?: unknown };
        if (prop.default !== undefined) {
          defaults[key] = prop.default;
        }
      }
    }

    return defaults;
  } catch {
    return {};
  }
}

export function getPreviewSize(schema: string): PreviewSize | undefined {
  try {
    const parsed = JSON.parse(schema);

    const preview = parsed.$demo?.previewSize;
    if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
      return undefined;
    }

    const size: PreviewSize = {};
    const previewRecord = preview as Record<string, unknown>;

    if (
      typeof previewRecord.width === "number" ||
      typeof previewRecord.width === "string"
    ) {
      size.width = previewRecord.width;
    }
    if (
      typeof previewRecord.height === "number" ||
      typeof previewRecord.height === "string"
    ) {
      size.height = previewRecord.height;
    }
    if (
      typeof previewRecord.minHeight === "number" ||
      typeof previewRecord.minHeight === "string"
    ) {
      size.minHeight = previewRecord.minHeight;
    }
    if (
      typeof previewRecord.maxHeight === "number" ||
      typeof previewRecord.maxHeight === "string"
    ) {
      size.maxHeight = previewRecord.maxHeight;
    }
    if (
      typeof previewRecord.scale === "number" ||
      typeof previewRecord.scale === "string"
    ) {
      const scale = Number(previewRecord.scale);
      if (Number.isFinite(scale)) {
        size.scale = scale;
      }
    }

    return Object.keys(size).length > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

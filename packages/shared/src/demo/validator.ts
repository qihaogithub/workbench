import type { PreviewSize } from "./types";

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

    const orderable = getOrderable(schema);
    if (orderable) {
      defaults.__order = [...orderable];
    }

    return defaults;
  } catch {
    return {};
  }
}

export function getPreviewSize(schema: string): PreviewSize | undefined {
  try {
    const parsed = JSON.parse(schema);

    if (!parsed.$demo?.previewSize) {
      return undefined;
    }

    const preview = parsed.$demo.previewSize;
    const size: PreviewSize = {};

    if (preview.width !== undefined) {
      size.width = preview.width;
    }
    if (preview.height !== undefined) {
      size.height = preview.height;
    }
    if (preview.minHeight !== undefined) {
      size.minHeight = preview.minHeight;
    }
    if (preview.maxHeight !== undefined) {
      size.maxHeight = preview.maxHeight;
    }
    if (preview.scale !== undefined) {
      size.scale = Number(preview.scale);
    }

    return Object.keys(size).length > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

export function getOrderable(schema: string): string[] | undefined {
  try {
    const parsed = JSON.parse(schema);

    const orderable = parsed.$demo?.orderable;
    if (!Array.isArray(orderable) || orderable.length < 2) {
      return undefined;
    }

    const validKeys = orderable.filter(
      (key): key is string => typeof key === "string",
    );

    return validKeys.length >= 2 ? validKeys : undefined;
  } catch {
    return undefined;
  }
}

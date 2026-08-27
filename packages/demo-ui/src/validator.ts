import type { PreviewSize } from "./types";
import { flattenSchema } from "./schema-parser";
import { resolvePagePresentation } from "@workbench/shared";

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
    const flattened = flattenSchema(parsed);
    const defaults: Record<string, unknown> = {};

    if (flattened.properties && typeof flattened.properties === "object") {
      for (const [key, value] of Object.entries(flattened.properties)) {
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

    const presentation = resolvePagePresentation(parsed);
    if (!presentation) {
      return undefined;
    }

    const size: PreviewSize = {};
    size.width = presentation.viewport.width;
    size.height = presentation.viewport.height;

    return Object.keys(size).length > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

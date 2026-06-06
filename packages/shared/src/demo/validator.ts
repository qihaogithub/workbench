import type { PreviewSize, PositionableConfig, PositionItem } from "./types";

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

    const orderable = getOrderable(schema);
    if (orderable) {
      defaults.__order = [...orderable];
    }

    const orderableH = getOrderableHorizontal(schema);
    if (orderableH) {
      defaults.__orderH = [...orderableH];
    }

    const positionable = getPositionable(schema);
    if (positionable) {
      const positions: Record<string, PositionItem> = {};
      for (const key of positionable.items) {
        positions[key] = positionable.defaults?.[key] || { x: 0, y: 0 };
      }
      defaults.__positions = positions;
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

export function getOrderableHorizontal(schema: string): string[] | undefined {
  try {
    const parsed = JSON.parse(schema);

    const orderableH = parsed.$demo?.orderableHorizontal;
    if (!Array.isArray(orderableH) || orderableH.length < 2) {
      return undefined;
    }

    const validKeys = orderableH.filter(
      (key): key is string => typeof key === "string",
    );

    return validKeys.length >= 2 ? validKeys : undefined;
  } catch {
    return undefined;
  }
}

export function getPositionable(
  schema: string,
): PositionableConfig | undefined {
  try {
    const parsed = JSON.parse(schema);

    const positionable = parsed.$demo?.positionable;
    if (!positionable || !Array.isArray(positionable.items) || positionable.items.length < 1) {
      return undefined;
    }

    const validItems = positionable.items.filter(
      (key: unknown): key is string => typeof key === "string",
    );

    if (validItems.length < 1) return undefined;

    const defaults: Record<string, PositionItem> = {};
    if (positionable.defaults && typeof positionable.defaults === "object") {
      for (const [key, val] of Object.entries(positionable.defaults)) {
        if (
          val &&
          typeof val === "object" &&
          typeof (val as Record<string, unknown>).x === "number" &&
          typeof (val as Record<string, unknown>).y === "number"
        ) {
          defaults[key] = { x: (val as { x: number; y: number }).x, y: (val as { x: number; y: number }).y };
        }
      }
    }

    const size =
      positionable.size &&
      typeof positionable.size === "object" &&
      typeof (positionable.size as Record<string, unknown>).width === "number" &&
      typeof (positionable.size as Record<string, unknown>).height === "number"
        ? {
            width: (positionable.size as { width: number }).width,
            height: (positionable.size as { height: number }).height,
          }
        : undefined;

    return { items: validItems, defaults, size };
  } catch {
    return undefined;
  }
}

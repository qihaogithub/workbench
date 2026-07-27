import type { PreviewSize } from "./types";

function readDimension(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return undefined;
}

export function getPrototypePreviewSize(
  meta?: Record<string, unknown>,
): PreviewSize | undefined {
  if (!meta) return undefined;
  const nestedPreviewSize =
    typeof meta.previewSize === "object" && meta.previewSize !== null
      ? (meta.previewSize as Record<string, unknown>)
      : undefined;
  const width = readDimension(nestedPreviewSize?.width ?? meta.width);
  const height = readDimension(nestedPreviewSize?.height ?? meta.height);

  if (!width && !height) return undefined;
  return { width, height };
}

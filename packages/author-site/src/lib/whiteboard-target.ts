export type WhiteboardTargetInput = {
  scope: "page" | "project";
  pageId?: string;
  fieldPath: string;
  listItem?: { index: number; url: string };
  currentValue?: string;
};

const RESERVED_CONFIG_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Apply a WhiteboardCommit image target update after the caller has validated
 * the target against its Schema. The default is only used as the concurrency
 * baseline when the values file does not contain this field.
 */
export function updateWhiteboardImageTarget(
  values: Record<string, unknown>,
  target: WhiteboardTargetInput,
  assetPath: string,
  schemaDefault?: unknown,
): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(target.fieldPath) || RESERVED_CONFIG_KEYS.has(target.fieldPath)) {
    return "不支持的图片字段";
  }

  if (!target.listItem) {
    const currentValue = hasOwn(values, target.fieldPath)
      ? values[target.fieldPath]
      : schemaDefault;
    if (currentValue !== undefined && typeof currentValue !== "string") return "图片字段类型已变化";
    if (target.currentValue !== undefined && currentValue !== target.currentValue) {
      return "图片字段已被其他编辑者替换，请刷新后重试";
    }
    values[target.fieldPath] = assetPath;
    return null;
  }

  const persistedList = hasOwn(values, target.fieldPath);
  const sourceList = persistedList ? values[target.fieldPath] : schemaDefault;
  if (!Array.isArray(sourceList) || !Number.isInteger(target.listItem.index) || target.listItem.index < 0) {
    return "图片列表项已变化";
  }

  const list = persistedList ? sourceList : [...sourceList];
  const current = list[target.listItem.index];
  const currentUrl = typeof current === "string" ? current : record(current)?.url;
  if (currentUrl !== target.listItem.url) return "图片列表已被排序、删除或替换，请刷新后重试";
  list[target.listItem.index] = typeof current === "string" ? assetPath : { ...record(current), url: assetPath };
  values[target.fieldPath] = list;
  return null;
}

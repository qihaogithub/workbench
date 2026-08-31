import { isWhiteboardConfigPath, parseWhiteboardConfigPath, type WhiteboardConfigPathSegment } from "@workbench/shared";

export type WhiteboardImageTargetInput = {
  scope: "page" | "project";
  pageId?: string;
  fieldPath: string;
  listItem?: { index: number; url: string };
  currentValue?: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function imageValueSchema(schema: JsonRecord | null): boolean {
  return Boolean(schema && schema.type === "string" && (
    schema.format === "image" || schema["ui:widget"] === "image"
  ));
}

function imageListSchema(schema: JsonRecord | null): boolean {
  if (!schema) return false;
  if (schema.type === "imageList" || schema["ui:widget"] === "imageList") return true;
  if (schema.type !== "array") return false;
  const items = record(schema.items);
  return imageValueSchema(items)
    || Boolean(record(items?.properties)?.url && imageValueSchema(record(record(items?.properties)?.url)));
}

function schemaAtPath(schema: JsonRecord, path: readonly WhiteboardConfigPathSegment[]): JsonRecord | null {
  let current: JsonRecord | null = schema;
  for (const segment of path) {
    if (!current) return null;
    current = typeof segment === "string"
      ? record(record(current.properties)?.[segment])
      : record(current.items);
  }
  return current;
}

export function isWhiteboardImageTargetInput(value: unknown): value is WhiteboardImageTargetInput {
  const target = record(value);
  if (!target || (target.scope !== "page" && target.scope !== "project") || !isWhiteboardConfigPath(target.fieldPath)) return false;
  if (target.pageId !== undefined && (typeof target.pageId !== "string" || !/^[A-Za-z0-9_-]+$/.test(target.pageId))) return false;
  if (target.currentValue !== undefined && typeof target.currentValue !== "string") return false;
  if (target.listItem !== undefined) {
    const item = record(target.listItem);
    if (!item || !Number.isInteger(item.index) || (item.index as number) < 0 || typeof item.url !== "string") return false;
  }
  return target.scope === "page" ? typeof target.pageId === "string" : target.pageId === undefined;
}

export function supportsWhiteboardImageTarget(schema: JsonRecord, target: WhiteboardImageTargetInput): boolean {
  const path = parseWhiteboardConfigPath(target.fieldPath);
  if (!path) return false;
  const targetSchema = schemaAtPath(schema, path);
  return target.listItem ? imageListSchema(targetSchema) : imageValueSchema(targetSchema);
}

function materializeSchemaDefault(schema: JsonRecord | null): unknown {
  if (!schema) return undefined;
  if (Object.prototype.hasOwnProperty.call(schema, "default")) return clone(schema.default);
  if (schema.type !== "object" && !schema.properties) return undefined;
  const properties = record(schema.properties);
  if (!properties) return undefined;
  const result: JsonRecord = {};
  for (const [key, child] of Object.entries(properties)) {
    const defaultValue = materializeSchemaDefault(record(child));
    if (defaultValue !== undefined) result[key] = defaultValue;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Schema defaults fill absent branches only; persisted values always win. */
export function mergeConfigWithSchemaDefaults(schema: JsonRecord, persisted: JsonRecord): JsonRecord {
  const merge = (node: JsonRecord | null, value: unknown): unknown => {
    const fallback = materializeSchemaDefault(node);
    if (value === undefined) return clone(fallback);
    if (!node || !record(value) || !record(fallback)) return clone(value);
    const properties = record(node.properties);
    if (!properties) return clone(value);
    const result: JsonRecord = { ...record(fallback), ...record(value) };
    for (const [key, child] of Object.entries(properties)) {
      const merged = merge(record(child), record(value)?.[key]);
      if (merged !== undefined) result[key] = merged;
    }
    return result;
  };
  return (merge(schema, persisted) as JsonRecord | undefined) ?? {};
}

function valueAtPath(values: JsonRecord, path: readonly WhiteboardConfigPathSegment[]): unknown {
  let current: unknown = values;
  for (const segment of path) {
    if (typeof segment === "string") {
      const object = record(current);
      if (!object) return undefined;
      current = object[segment];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    }
  }
  return current;
}

function replaceAtPath(values: JsonRecord, path: readonly WhiteboardConfigPathSegment[], nextValue: unknown): boolean {
  if (!path.length) return false;
  let current: unknown = values;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    current = typeof segment === "string"
      ? record(current)?.[segment]
      : Array.isArray(current) ? current[segment] : undefined;
    if (current === undefined || current === null) return false;
  }
  const last = path[path.length - 1];
  if (typeof last !== "string") return false;
  const parent = record(current);
  if (!parent) return false;
  parent[last] = nextValue;
  return true;
}

export function updateWhiteboardImageTarget(
  values: JsonRecord,
  target: WhiteboardImageTargetInput,
  assetPath: string,
): string | null {
  const path = parseWhiteboardConfigPath(target.fieldPath);
  if (!path) return "不支持的图片字段";
  const current = valueAtPath(values, path);
  if (!target.listItem) {
    if (current !== undefined && typeof current !== "string") return "图片字段类型已变化";
    if (target.currentValue !== undefined && current !== target.currentValue) return "图片字段已被其他编辑者替换，请刷新后重试";
    return replaceAtPath(values, path, assetPath) ? null : "图片字段路径已变化";
  }
  if (!Array.isArray(current)) return "图片列表项已变化";
  const item = current[target.listItem.index];
  const itemRecord = record(item);
  const currentUrl = typeof item === "string" ? item : itemRecord?.url;
  if (currentUrl !== target.listItem.url) return "图片列表已被排序、删除或替换，请刷新后重试";
  current[target.listItem.index] = typeof item === "string"
    ? assetPath
    : { ...itemRecord, url: assetPath };
  return null;
}

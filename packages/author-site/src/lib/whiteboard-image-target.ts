import {
  isWhiteboardConfigPath,
  isWhiteboardPageId,
  parseWhiteboardConfigPath,
  type WhiteboardConfigPathSegment,
} from "@workbench/shared";

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

function schemaBranches(schema: JsonRecord | null): JsonRecord[] {
  if (!schema) return [];
  const branches = Array.isArray(schema.oneOf)
    ? schema.oneOf.flatMap((candidate) => schemaBranches(record(candidate)))
    : [];
  return branches.length > 0 ? branches : [schema];
}

function childSchemaFromBranch(
  branch: JsonRecord,
  segment: WhiteboardConfigPathSegment,
): JsonRecord | null {
  return typeof segment === "string"
    ? record(record(branch.properties)?.[segment])
    : record(branch.items);
}

function branchMatchesValue(branch: JsonRecord, value: unknown): boolean {
  const properties = record(branch.properties);
  const object = record(value);
  const discriminators = Object.entries(properties ?? {})
    .map(([key, child]) => [key, record(child)] as const)
    .filter((entry): entry is readonly [string, JsonRecord] => entry[1] !== null && entry[1].const !== undefined);
  if (discriminators.length === 0) return true;
  return Boolean(object) && discriminators.every(([key, child]) => object![key] === child.const);
}

function branchHasDiscriminator(branch: JsonRecord): boolean {
  return Object.values(record(branch.properties) ?? {}).some((child) => {
    const property = record(child);
    return property !== null && Object.prototype.hasOwnProperty.call(property, "const");
  });
}

function hydrateBranchDiscriminators(branch: JsonRecord, value: unknown): boolean {
  const object = record(value);
  if (!object) return true;
  for (const [key, child] of Object.entries(record(branch.properties) ?? {})) {
    const property = record(child);
    if (!property || !Object.prototype.hasOwnProperty.call(property, "const")) continue;
    if (hasOwn(object, key) && object[key] !== property.const) return false;
    if (!hasOwn(object, key) || object[key] === undefined) object[key] = clone(property.const);
  }
  return true;
}

/** Pick a single union branch for writes; reads use all branches below. */
function selectSchemaBranch(
  schema: JsonRecord | null,
  value: unknown,
  segment?: WhiteboardConfigPathSegment,
): JsonRecord | null {
  const branches = schemaBranches(schema);
  if (branches.length === 0) return null;
  const valueMatches = branches.filter((branch) => branchHasDiscriminator(branch) && branchMatchesValue(branch, value));
  if (valueMatches.length > 0) {
    // A discriminator is authoritative once the current object has one. If
    // that branch does not expose the requested field, the path is stale;
    // do not silently add the field to a different union variant.
    return valueMatches.find((branch) => segment === undefined || childSchemaFromBranch(branch, segment) !== null)
      ?? valueMatches[0];
  }
  const candidates = segment === undefined
    ? branches
    : branches.filter((branch) => childSchemaFromBranch(branch, segment) !== null);
  const pool = candidates.length > 0 ? candidates : branches;
  return pool.find((branch) => branchMatchesValue(branch, value)) ?? pool[0] ?? null;
}

function imageListSchema(schema: JsonRecord | null): boolean {
  return schemaBranches(schema).some((branch) => {
    if (branch.type === "imageList" || branch["ui:widget"] === "imageList") return true;
    if (branch.type !== "array") return false;
    return schemaBranches(record(branch.items)).some((item) => imageValueSchema(item)
      || Boolean(record(item.properties)?.url && imageValueSchema(record(record(item.properties)?.url))));
  });
}

function schemaCandidatesAtPath(
  schema: JsonRecord,
  path: readonly WhiteboardConfigPathSegment[],
): JsonRecord[] {
  let current = [schema];
  for (const segment of path) {
    current = current
      .flatMap((candidate) => schemaBranches(candidate)
        .map((branch) => childSchemaFromBranch(branch, segment))
        .filter((child): child is JsonRecord => child !== null));
    if (current.length === 0) return [];
  }
  return [...new Set(current)];
}

function schemaAtPath(
  schema: JsonRecord,
  path: readonly WhiteboardConfigPathSegment[],
  values?: unknown,
): JsonRecord | null {
  let current: JsonRecord | null = schema;
  let currentValue: unknown = values;
  for (const segment of path) {
    const branch = selectSchemaBranch(current, currentValue, segment);
    if (!branch) return null;
    current = childSchemaFromBranch(branch, segment);
    currentValue = typeof segment === "string"
      ? record(currentValue)?.[segment]
      : Array.isArray(currentValue) ? currentValue[segment] : undefined;
  }
  return current;
}

export function isWhiteboardImageTargetInput(value: unknown): value is WhiteboardImageTargetInput {
  const target = record(value);
  if (!target || (target.scope !== "page" && target.scope !== "project") || !isWhiteboardConfigPath(target.fieldPath)) return false;
  if (target.pageId !== undefined && !isWhiteboardPageId(target.pageId)) return false;
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
  const targetSchemas = schemaCandidatesAtPath(schema, path);
  return target.listItem
    ? targetSchemas.some((targetSchema) => imageListSchema(targetSchema))
    : targetSchemas.some((targetSchema) => schemaBranches(targetSchema).some((branch) => imageValueSchema(branch)));
}

function materializeSchemaDefault(
  schema: JsonRecord | null,
  value?: unknown,
  preferredSegment?: WhiteboardConfigPathSegment,
): unknown {
  const branch = selectSchemaBranch(schema, value, preferredSegment);
  if (!branch) return undefined;
  if (Object.prototype.hasOwnProperty.call(branch, "default")) return clone(branch.default);
  if (branch.type !== "object" && !branch.properties) return undefined;
  const properties = record(branch.properties);
  if (!properties) return undefined;
  const result: JsonRecord = {};
  for (const [key, child] of Object.entries(properties)) {
    const childSchema = record(child);
    if (childSchema && Object.prototype.hasOwnProperty.call(childSchema, "const")) {
      result[key] = clone(childSchema.const);
      continue;
    }
    const defaultValue = materializeSchemaDefault(childSchema, record(value)?.[key]);
    if (defaultValue !== undefined) result[key] = defaultValue;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function hasOwn(value: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isObjectSchema(schema: JsonRecord | null): boolean {
  return schemaBranches(schema).some((branch) => branch.type === "object" || Boolean(branch.properties));
}

function childSchemaAt(
  schema: JsonRecord | null,
  value: unknown,
  segment: WhiteboardConfigPathSegment,
): JsonRecord | null {
  const branch = selectSchemaBranch(schema, value, segment);
  return branch ? childSchemaFromBranch(branch, segment) : null;
}

/** Hydrate only the ancestor branch needed by a target, leaving unrelated config defaults absent. */
function hydrateTargetParents(values: JsonRecord, schema: JsonRecord, path: readonly WhiteboardConfigPathSegment[]): boolean {
  let current: unknown = values;
  let currentSchema: JsonRecord | null = schema;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (typeof segment === "string") {
      const object = record(current);
      const branch = selectSchemaBranch(currentSchema, current, segment);
      const childSchema = branch ? childSchemaFromBranch(branch, segment) : null;
      if (!object || !childSchema) return false;
      if (branch && !hydrateBranchDiscriminators(branch, current)) return false;
      if (!hasOwn(object, segment) || object[segment] === undefined) {
        const fallback = materializeSchemaDefault(childSchema, undefined, path[index + 1]);
        if (fallback !== undefined) object[segment] = clone(fallback);
        else if (typeof path[index + 1] === "number" && childSchema.type === "array") object[segment] = [];
        else if (typeof path[index + 1] === "string" && isObjectSchema(childSchema)) object[segment] = {};
        else return false;
      }
      current = object[segment];
      currentSchema = childSchema;
    } else {
      const branch = selectSchemaBranch(currentSchema, current, segment);
      const itemSchema = branch ? childSchemaFromBranch(branch, segment) : null;
      if (!Array.isArray(current) || !itemSchema || segment < 0) return false;
      if (current[segment] === undefined) {
        const fallback = materializeSchemaDefault(itemSchema, undefined, path[index + 1]);
        if (fallback !== undefined) current[segment] = clone(fallback);
        else if (isObjectSchema(itemSchema)) current[segment] = {};
        else return false;
      }
      current = current[segment];
      currentSchema = itemSchema;
    }
  }
  const finalSegment = path[path.length - 1];
  const finalBranch = selectSchemaBranch(currentSchema, current, finalSegment);
  if (!finalBranch || !childSchemaFromBranch(finalBranch, finalSegment)) return false;
  return hydrateBranchDiscriminators(finalBranch, current);
}

/** Schema defaults fill absent branches only; persisted values always win. */
export function mergeConfigWithSchemaDefaults(schema: JsonRecord, persisted: JsonRecord): JsonRecord {
  const merge = (node: JsonRecord | null, value: unknown): unknown => {
    const fallback = materializeSchemaDefault(node, value);
    if (value === undefined) return clone(fallback);
    if (node && Array.isArray(value)) {
      const itemSchema = childSchemaAt(node, value, 0);
      return value.map((item) => merge(itemSchema, item));
    }
    const selected = selectSchemaBranch(node, value);
    if (!node || !record(value) || !record(fallback) || !selected) return clone(value);
    const properties = record(selected.properties);
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
  schema?: JsonRecord,
): string | null {
  const path = parseWhiteboardConfigPath(target.fieldPath);
  if (!path) return "不支持的图片字段";
  // Work against a detached copy while resolving defaults/discriminators so a
  // stale or invalid target cannot leave caller-owned config partially
  // hydrated. The copy is applied only after every conflict guard passes.
  const workingValues = schema ? clone(values) as JsonRecord : values;
  if (schema && !hydrateTargetParents(workingValues, schema, path)) return "图片字段路径已变化";
  const targetSchema = schema ? schemaAtPath(schema, path, workingValues) : null;
  if (schema && !targetSchema) return "图片字段路径已变化";
  const current = valueAtPath(workingValues, path);
  const schemaDefault = current === undefined ? materializeSchemaDefault(targetSchema) : undefined;
  const commit = (): null => {
    if (workingValues !== values) {
      for (const key of Object.keys(values)) delete values[key];
      Object.assign(values, workingValues);
    }
    return null;
  };
  if (!target.listItem) {
    const currentValue = current === undefined ? schemaDefault : current;
    if (currentValue !== undefined && typeof currentValue !== "string") return "图片字段类型已变化";
    if (target.currentValue !== undefined && currentValue !== target.currentValue) return "图片字段已被其他编辑者替换，请刷新后重试";
    return replaceAtPath(workingValues, path, assetPath) ? commit() : "图片字段路径已变化";
  }
  const sourceList = current === undefined ? schemaDefault : current;
  if (!Array.isArray(sourceList)) return "图片列表项已变化";
  const item = sourceList[target.listItem.index];
  const itemRecord = record(item);
  const currentUrl = typeof item === "string" ? item : itemRecord?.url;
  if (currentUrl !== target.listItem.url) return "图片列表已被排序、删除或替换，请刷新后重试";
  const list: unknown[] = current === undefined ? clone(sourceList) as unknown[] : sourceList;
  list[target.listItem.index] = typeof item === "string"
    ? assetPath
    : { ...itemRecord, url: assetPath };
  return replaceAtPath(workingValues, path, list) ? commit() : "图片字段路径已变化";
}

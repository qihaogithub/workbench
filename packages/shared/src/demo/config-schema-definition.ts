/** Controlled mutations for the flat JSON Schema dialect used by configuration panels. */
export type ConfigDefinitionKind =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "color"
  | "image"
  | "images";

export type ImageDimensionOperator = "=" | ">" | "≥" | "<" | "≤";

export interface ImageDimensionRule {
  operator: ImageDimensionOperator;
  value: number;
}

export interface ConfigDefinitionDraft {
  key: string;
  title: string;
  kind: ConfigDefinitionKind;
  default: unknown;
  description?: string;
  required?: boolean;
  group?: string;
  category?: string;
  enum?: unknown[];
  accept?: string;
  maxSize?: number;
  widthRule?: ImageDimensionRule;
  heightRule?: ImageDimensionRule;
  /** @deprecated Internal legacy manager state. New schema writes use widthRule/heightRule. */
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export type SchemaDefinitionCommand =
  | { type: "field.add"; field: ConfigDefinitionDraft }
  | { type: "field.update"; key: string; patch: Partial<ConfigDefinitionDraft> }
  | { type: "field.delete"; key: string }
  | { type: "group.rename"; from: string; to: string }
  | { type: "group.delete"; group: string; disposition: "ungroup" | "move"; targetGroup?: string };

export interface SchemaDefinitionDiff {
  added: string[];
  updated: string[];
  deleted: string[];
  typeChanged: string[];
}

export interface SchemaDefinitionMutation {
  schema: string;
  valuePlan: { setDefaults: Record<string, unknown>; removeKeys: string[] };
  diff: SchemaDefinitionDiff;
}

type SchemaRecord = Record<string, unknown>;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function record(value: unknown): SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as SchemaRecord) }
    : {};
}

function parse(schema: string): SchemaRecord {
  try {
    const value = JSON.parse(schema) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Schema 必须是 JSON 对象");
    }
    return record(value);
  } catch (error) {
    throw new Error(error instanceof Error && error.message !== "Unexpected end of JSON input"
      ? error.message
      : "Schema 不是有效 JSON");
  }
}

function getProperties(schema: SchemaRecord): Record<string, SchemaRecord> {
  return Object.fromEntries(Object.entries(record(schema.properties)).map(([key, value]) => [key, record(value)]));
}

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  if (!KEY_RE.test(trimmed)) throw new Error("字段 key 必须以字母或下划线开头，且只能包含字母、数字和下划线");
  return trimmed;
}

function numberOption(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} 必须是非负数字`);
  return value;
}

function dimensionRule(value: unknown, label: string): ImageDimensionRule | undefined {
  if (value === undefined || value === null) return undefined;
  const rule = record(value);
  const operator = rule.operator;
  if (!["=", ">", "≥", "<", "≤"].includes(String(operator))) throw new Error(`${label} 比较符无效`);
  const size = numberOption(rule.value, `${label}数值`);
  if (size === undefined) throw new Error(`${label} 需要填写数值`);
  return { operator: operator as ImageDimensionOperator, value: size };
}

function propertyFromDraft(draft: ConfigDefinitionDraft): SchemaRecord {
  const key = normalizeKey(draft.key);
  const title = draft.title.trim();
  if (!title) throw new Error(`字段 ${key} 缺少名称`);
  const uiOptions: SchemaRecord = {};
  if (draft.group?.trim()) uiOptions.group = draft.group.trim();
  if (draft.category?.trim()) uiOptions.category = draft.category.trim();
  const property: SchemaRecord = { title, default: draft.default };
  if (draft.description?.trim()) property.description = draft.description.trim();
  switch (draft.kind) {
    case "number": property.type = "number"; break;
    case "integer": property.type = "integer"; break;
    case "boolean": property.type = "boolean"; break;
    case "enum":
      property.type = "string";
      if (!Array.isArray(draft.enum) || draft.enum.length === 0) throw new Error(`枚举字段 ${key} 至少需要一个选项`);
      property.enum = draft.enum;
      break;
    case "color": property.type = "string"; property.format = "color"; break;
    case "textarea": property.type = "string"; property["ui:widget"] = "textarea"; break;
    case "richtext": property.type = "string"; property.format = "richtext"; break;
    case "image": property.type = "string"; property.format = "image"; break;
    case "images": property.type = "array"; property.items = { type: "string", format: "image" }; break;
    default: property.type = "string";
  }
  if (draft.kind === "image" || draft.kind === "images") {
    for (const [name, label] of [["maxSize", "文件大小上限"]] as const) {
      const value = numberOption(draft[name], label);
      if (value !== undefined) uiOptions[name] = value;
    }
    const widthRule = dimensionRule(draft.widthRule, "宽度规则");
    const heightRule = dimensionRule(draft.heightRule, "高度规则");
    if (widthRule) uiOptions.widthRule = widthRule;
    if (heightRule) uiOptions.heightRule = heightRule;
    if (draft.accept?.trim()) uiOptions.accept = draft.accept.trim();
  }
  if (Object.keys(uiOptions).length) property["ui:options"] = uiOptions;
  return property;
}

function draftFromProperty(key: string, property: SchemaRecord, required: boolean): ConfigDefinitionDraft {
  const options = record(property["ui:options"]);
  const type = property.type;
  const kind: ConfigDefinitionKind = property.format === "color" ? "color"
    : property.format === "richtext" ? "richtext"
    : property["ui:widget"] === "textarea" ? "textarea"
    : property.format === "image" ? "image"
    : type === "array" ? "images"
    : type === "number" ? "number"
    : type === "integer" ? "integer"
    : type === "boolean" ? "boolean"
    : Array.isArray(property.enum) ? "enum" : "text";
  return {
    key, kind, title: typeof property.title === "string" ? property.title : key,
    default: property.default, description: typeof property.description === "string" ? property.description : undefined,
    required, group: typeof options.group === "string" ? options.group : undefined,
    category: typeof options.category === "string" ? options.category : undefined,
    enum: Array.isArray(property.enum) ? property.enum : undefined,
    accept: typeof options.accept === "string" ? options.accept : undefined,
    maxSize: typeof options.maxSize === "number" ? options.maxSize : undefined,
    widthRule: dimensionRule(options.widthRule, "宽度规则"),
    heightRule: dimensionRule(options.heightRule, "高度规则"),
  };
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Applies non-structural definition edits without rebuilding a property.
 *
 * The definition editor deliberately exposes a small, flat subset of JSON
 * Schema. Rebuilding an existing property from that subset would discard
 * structural details it cannot represent, for example array object items and
 * their `oneOf` branches. Keeping the original property is therefore
 * essential when the selected field kind has not changed.
 */
function applyMetadataPatch(
  previous: SchemaRecord,
  before: ConfigDefinitionDraft,
  next: ConfigDefinitionDraft,
  patch: Partial<ConfigDefinitionDraft>,
): SchemaRecord {
  const property = record(previous);
  const changed = <K extends keyof ConfigDefinitionDraft>(key: K) =>
    Object.prototype.hasOwnProperty.call(patch, key) && !sameJsonValue(before[key], next[key]);

  if (changed("title")) {
    const title = next.title.trim();
    if (!title) throw new Error(`字段 ${next.key} 缺少名称`);
    property.title = title;
  }
  if (changed("default")) {
    if (next.default === undefined) delete property.default;
    else property.default = next.default;
  }
  if (changed("description")) {
    const description = next.description?.trim();
    if (description) property.description = description;
    else delete property.description;
  }
  if (next.kind === "enum" && changed("enum")) {
    if (!Array.isArray(next.enum) || next.enum.length === 0) {
      throw new Error(`枚举字段 ${next.key} 至少需要一个选项`);
    }
    property.enum = next.enum;
  }

  const options = record(property["ui:options"]);
  const updateTextOption = (name: "group" | "category" | "accept") => {
    if (!changed(name)) return;
    const value = next[name]?.trim();
    if (value) options[name] = value;
    else delete options[name];
  };
  updateTextOption("group");
  updateTextOption("category");

  if (next.kind === "image" || next.kind === "images") {
    updateTextOption("accept");
    if (changed("maxSize")) {
      const maxSize = numberOption(next.maxSize, "文件大小上限");
      if (maxSize === undefined) delete options.maxSize;
      else options.maxSize = maxSize;
    }
    if (changed("widthRule")) {
      const widthRule = dimensionRule(next.widthRule, "宽度规则");
      if (widthRule) options.widthRule = widthRule;
      else delete options.widthRule;
    }
    if (changed("heightRule")) {
      const heightRule = dimensionRule(next.heightRule, "高度规则");
      if (heightRule) options.heightRule = heightRule;
      else delete options.heightRule;
    }
  }
  if (Object.keys(options).length) property["ui:options"] = options;
  else delete property["ui:options"];
  return property;
}

export function readConfigDefinitionFields(schema: string): ConfigDefinitionDraft[] {
  const root = parse(schema);
  const required = new Set(Array.isArray(root.required) ? root.required.filter((key): key is string => typeof key === "string") : []);
  return Object.entries(getProperties(root)).map(([key, value]) => draftFromProperty(key, value, required.has(key)));
}

export function applySchemaDefinitionCommand(schema: string, command: SchemaDefinitionCommand): SchemaDefinitionMutation {
  const root = parse(schema);
  const properties = getProperties(root);
  const required = new Set(Array.isArray(root.required) ? root.required.filter((key): key is string => typeof key === "string") : []);
  const diff: SchemaDefinitionDiff = { added: [], updated: [], deleted: [], typeChanged: [] };
  const valuePlan = { setDefaults: {} as Record<string, unknown>, removeKeys: [] as string[] };
  if (command.type === "field.add") {
    const key = normalizeKey(command.field.key);
    if (properties[key]) throw new Error(`字段 key “${key}” 已存在`);
    properties[key] = propertyFromDraft(command.field);
    if (command.field.required) required.add(key);
    valuePlan.setDefaults[key] = command.field.default;
    diff.added.push(key);
  } else if (command.type === "field.update") {
    const key = normalizeKey(command.key);
    const previous = properties[key];
    if (!previous) throw new Error(`字段 “${key}” 不存在`);
    const before = draftFromProperty(key, previous, required.has(key));
    const next = { ...before, ...command.patch, key };
    properties[key] = before.kind === next.kind
      ? applyMetadataPatch(previous, before, next, command.patch)
      : propertyFromDraft(next);
    if (next.required) required.add(key); else required.delete(key);
    if (before.kind !== next.kind) diff.typeChanged.push(key);
    diff.updated.push(key);
    if (Object.prototype.hasOwnProperty.call(command.patch, "default")) valuePlan.setDefaults[key] = next.default;
  } else if (command.type === "field.delete") {
    const key = normalizeKey(command.key);
    if (!properties[key]) throw new Error(`字段 “${key}” 不存在`);
    delete properties[key]; required.delete(key); valuePlan.removeKeys.push(key); diff.deleted.push(key);
  } else {
    const from = command.type === "group.rename" ? command.from.trim() : command.group.trim();
    if (!from) throw new Error("分组名称不能为空");
    const to = command.type === "group.rename" ? command.to.trim() : command.disposition === "move" ? command.targetGroup?.trim() : undefined;
    if (command.type === "group.rename" && !to) throw new Error("新的分组名称不能为空");
    if (command.type === "group.delete" && command.disposition === "move" && !to) throw new Error("请选择目标分组");
    for (const [key, property] of Object.entries(properties)) {
      const options = record(property["ui:options"]);
      if (options.group !== from) continue;
      if (to) options.group = to; else delete options.group;
      if (Object.keys(options).length) property["ui:options"] = options; else delete property["ui:options"];
      diff.updated.push(key);
    }
  }
  root.type = typeof root.type === "string" ? root.type : "object";
  root.properties = properties;
  if (required.size) root.required = [...required]; else delete root.required;
  return { schema: JSON.stringify(root, null, 2), valuePlan, diff };
}

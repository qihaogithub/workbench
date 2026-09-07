export interface OneOfVariant {
  title: string;
  value: string | number;
  fields: FieldConfig[];
  maxItems?: number;
}

export interface OneOfConfig {
  discriminator: string;
  variants: OneOfVariant[];
}

export interface CascadeOption {
  value: string;
  label: string;
  children?: CascadeOption[];
}

export interface FieldConfig {
  key: string;
  /** Canonical path in the original schema when an object group is flattened. */
  schemaPath?: string;
  title: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  enumNames?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  format?: string;
  uiWidget?: string;
  uiOptions?: Record<string, unknown>;
  /** Whether object-array rows can be reordered; missing declarations are treated as non-sortable. */
  sortable?: boolean;
  /** Opt-in presentation for object-array item details. */
  detailPresentation?: "inline" | "sheet";
  /** Optional label used for the item-detail breadcrumb. */
  detailBreadcrumbTitle?: string;
  /** Optional title template for object-array rows; `{index}` is a 1-based, zero-padded index. */
  itemTitleTemplate?: string;
  category?: string;
  visibleWhen?: VisibleWhenCondition;
  note?: string;
  itemsType?: string;
  itemsFormat?: string;
  itemsUiWidget?: string;
  children?: FieldConfig[];
  oneOf?: OneOfConfig;
  multiple?: boolean;
  options?: CascadeOption[];
  positionable?: { key?: string; size?: { width: number; height: number } };
  /** Discriminator/const fields are read-only values, not definition-editable fields. */
  isConst?: boolean;
}

import { isAtomicConfigField } from "@workbench/shared";

export interface FieldGroup {
  title: string;
  icon?: string;
  fields: FieldConfig[];
  color?: string;
}

export type VisibleWhenValue = string | number | boolean | null;

export interface VisibleWhenCondition {
  field: string;
  equals: VisibleWhenValue;
}

export function buildEffectiveFieldData(
  fields: FieldConfig[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      defaults[field.key] = field.default;
    }
  }
  return { ...defaults, ...data };
}

export function isFieldVisible(
  field: FieldConfig,
  localData: Record<string, unknown>,
): boolean {
  if (!field.visibleWhen) return true;
  return Object.is(
    localData[field.visibleWhen.field],
    field.visibleWhen.equals,
  );
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVisibleWhenValue(value: unknown): value is VisibleWhenValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function parseVisibleWhen(value: unknown): VisibleWhenCondition | undefined {
  if (!isPlainRecord(value)) return undefined;
  const { field, equals } = value;
  if (typeof field !== "string" || field.length === 0) return undefined;
  if (!isVisibleWhenValue(equals)) return undefined;
  return { field, equals };
}

function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function constType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function schemaType(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === "string" && item !== "null");
  }
  return undefined;
}

function hasPositionable(prop: Record<string, unknown>): boolean {
  const demo = prop.$demo as Record<string, unknown> | undefined;
  return !!(demo?.positionable);
}

export function flattenSchema(parsed: Record<string, unknown>): Record<string, unknown> {
  const properties = parsed.properties;
  if (!isPlainRecord(properties)) return parsed;

  const flatProperties: Record<string, unknown> = {};
  const topRequired = new Set(
    Array.isArray(parsed.required) ? (parsed.required as string[]) : [],
  );
  let hasNestedGroups = false;

  for (const [key, prop] of Object.entries(properties)) {
    const propObj = prop as Record<string, unknown>;

    if (
      propObj.type === "object" &&
      !isAtomicConfigField(propObj) &&
      isPlainRecord(propObj.properties) &&
      !hasPositionable(propObj)
    ) {
      hasNestedGroups = true;
      const nestedPropKeys = Object.keys(propObj.properties as Record<string, unknown>);
      if (nestedPropKeys.length === 0) {
        continue;
      }
      const nestedProps = propObj.properties as Record<string, Record<string, unknown>>;
      const nestedRequired = Array.isArray(propObj.required)
        ? (propObj.required as string[])
        : [];
      const groupTitle = typeof propObj.title === "string" ? propObj.title : key;

      for (const [nestedKey, nestedProp] of Object.entries(nestedProps)) {
        const nestedObj = { ...nestedProp };
        nestedObj.__schemaPath = `${key}.${nestedKey}`;
        const existingUi = isPlainRecord(nestedObj["ui:options"])
          ? { ...(nestedObj["ui:options"] as Record<string, unknown>) }
          : {};
        existingUi.group = groupTitle;
        nestedObj["ui:options"] = existingUi;
        flatProperties[nestedKey] = nestedObj;

        if (nestedRequired.includes(nestedKey)) {
          topRequired.add(nestedKey);
        }
      }
    } else {
      flatProperties[key] = propObj;
    }
  }

  if (!hasNestedGroups) return parsed;

  return {
    ...parsed,
    properties: flatProperties,
    required: [...topRequired],
  };
}

function getGroupColor(index: number): string {
  const colors = [
    "from-blue-500 to-cyan-500",
    "from-purple-500 to-pink-500",
    "from-green-500 to-emerald-500",
    "from-orange-500 to-yellow-500",
    "from-red-500 to-rose-500",
    "from-indigo-500 to-blue-500",
  ];
  return colors[index % colors.length];
}

function parseFieldConfig(
  key: string,
  prop: Record<string, unknown>,
  required: boolean,
  typeLimits?: Record<string, number>,
): FieldConfig {
  const uiOptions = isPlainRecord(prop["ui:options"])
    ? (prop["ui:options"] as Record<string, unknown>)
    : undefined;
  const demoOptions = isPlainRecord(prop.$demo)
    ? (prop.$demo as Record<string, unknown>)
    : undefined;
  const field: FieldConfig = {
    key,
    schemaPath: typeof prop.__schemaPath === "string" ? prop.__schemaPath : undefined,
    title: typeof prop.title === "string" ? prop.title : formatFieldName(key),
    type: schemaType(prop.type) || (prop.const !== undefined ? constType(prop.const) : "string"),
    isConst: prop.const !== undefined,
    description: prop.description as string | undefined,
    required,
    default: prop.default,
    enum: prop.enum as unknown[] | undefined,
    enumNames: prop.enumNames as string[] | undefined,
    minimum: prop.minimum as number | undefined,
    maximum: prop.maximum as number | undefined,
    maxLength: prop.maxLength as number | undefined,
    format: prop.format as string | undefined,
    uiWidget: prop["ui:widget"] as string | undefined,
    uiOptions,
    sortable: typeof demoOptions?.sortable === "boolean" ? demoOptions.sortable : false,
    detailPresentation:
      uiOptions?.detailPresentation === "sheet" || uiOptions?.detailPresentation === "inline"
        ? uiOptions.detailPresentation
        : undefined,
    detailBreadcrumbTitle:
      typeof uiOptions?.detailBreadcrumbTitle === "string"
        ? uiOptions.detailBreadcrumbTitle
        : undefined,
    itemTitleTemplate:
      typeof uiOptions?.itemTitleTemplate === "string"
        ? uiOptions.itemTitleTemplate
        : undefined,
    category:
      typeof uiOptions?.category === "string"
        ? uiOptions.category.trim()
        : undefined,
    visibleWhen:
      parseVisibleWhen(uiOptions?.visibleWhen) ||
      parseVisibleWhen(prop.visibleWhen),
    note: prop.$demo
      ? ((prop.$demo as Record<string, unknown>)?.note as string | undefined)
      : undefined,
    itemsType: schemaType((prop.items as Record<string, unknown>)?.type),
    itemsFormat: (prop.items as Record<string, unknown>)?.format as
      | string
      | undefined,
    itemsUiWidget: (prop.items as Record<string, unknown>)?.["ui:widget"] as
      | string
      | undefined,
  };

  if (prop["ui:widget"] === "multiselect") {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items) {
      field.enum = items.enum as unknown[] | undefined;
      field.enumNames = items.enumNames as string[] | undefined;
    }
    field.multiple = true;
  }

  if (prop["ui:widget"] === "cascade") {
    field.options = uiOptions?.cascadeOptions as CascadeOption[] | undefined;
  }

  if (prop.type === "enum" && prop.multiple === true) {
    field.uiWidget = "multiselect";
    field.multiple = true;
  }

  if (prop.type === "cascade" && Array.isArray(prop.options)) {
    field.uiWidget = "cascade";
    field.options = prop.options as CascadeOption[];
  }

  if (prop.type === "imageList") {
    field.uiWidget = "imageList";
  }

  if (prop.type === "object") {
    const demo = prop.$demo as Record<string, unknown> | undefined;
    if (demo?.positionable && typeof demo.positionable === "object") {
      const pos = demo.positionable as Record<string, unknown>;
      field.positionable = {
        key: typeof pos.key === "string" ? pos.key : undefined,
        size: pos.size as { width: number; height: number } | undefined,
      };
    }
  }

  if (prop.type === "position") {
    field.positionable = {
      key: typeof prop.key === "string" ? prop.key : undefined,
      size: prop.size as { width: number; height: number } | undefined,
    };
  }

  const items = prop.items as Record<string, unknown> | undefined;
  if (
    field.type === "array" &&
    items &&
    (items.type === "object" || items.oneOf || items.properties)
  ) {
    const oneOf = resolveOneOf(items, typeLimits);
    if (oneOf) {
      field.oneOf = oneOf;
    } else {
      const children = resolveChildren(items, typeLimits);
      if (children) field.children = children;
    }
  }

  return field;
}

function parseProperties(
  properties: Record<string, Record<string, unknown>>,
  required: string[],
  typeLimits?: Record<string, number>,
): FieldConfig[] {
  return Object.entries(properties).map(([key, prop]) =>
    parseFieldConfig(key, prop, required.includes(key), typeLimits),
  );
}

function resolveOneOf(
  items: Record<string, unknown>,
  typeLimits?: Record<string, number>,
): OneOfConfig | undefined {
  const oneOf = items.oneOf as Record<string, unknown>[] | undefined;
  if (!Array.isArray(oneOf) || oneOf.length === 0) return undefined;

  const firstVariant = oneOf[0];
  if (!firstVariant || !isPlainRecord(firstVariant.properties)) {
    return undefined;
  }

  const firstProps = firstVariant.properties as Record<
    string,
    Record<string, unknown>
  >;
  let discriminator = "";
  for (const [key, def] of Object.entries(firstProps)) {
    if (def && "const" in def) {
      discriminator = key;
      break;
    }
  }

  if (!discriminator) return undefined;

  const variants: OneOfVariant[] = [];
  for (const variant of oneOf) {
    if (!isPlainRecord(variant) || !isPlainRecord(variant.properties)) continue;
    const props = variant.properties as Record<string, Record<string, unknown>>;
    const variantProps: Record<string, Record<string, unknown>> = {};
    for (const [key, def] of Object.entries(props)) {
      if (key !== discriminator) {
        variantProps[key] = def;
      }
    }
    const value = props[discriminator]?.const;
    if (value === undefined || value === null) continue;

    const demo = isPlainRecord(variant.$demo)
      ? (variant.$demo as Record<string, unknown>)
      : undefined;
    const declaredMaxItems =
      demo && typeof demo.maxItems === "number"
        ? (demo.maxItems as number)
        : undefined;
    // Schema 声明的 $demo.maxItems 是单一真相源；代码探测值仅在未声明时兜底。
    const maxItems =
      declaredMaxItems ??
      (typeLimits ? typeLimits[String(value)] : undefined);

    const parsedFields = parseProperties(
      variantProps,
      (variant.required as string[]) || [],
      typeLimits,
    );
    variants.push({
      title: (variant.title as string) || String(value),
      value: value as string | number,
      fields: parsedFields,
      maxItems: maxItems !== undefined ? maxItems : undefined,
    });
  }

  if (variants.length === 0) return undefined;
  return { discriminator, variants };
}

function resolveChildren(
  items: Record<string, unknown>,
  typeLimits?: Record<string, number>,
): FieldConfig[] | undefined {
  const itemProps = items.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!itemProps || typeof itemProps !== "object" || Array.isArray(itemProps)) {
    return undefined;
  }
  const required = Array.isArray(items.required) ? (items.required as string[]) : [];
  return parseProperties(itemProps, required, typeLimits);
}

export function parseSchemaToFields(schema: string, typeLimits?: Record<string, number>): FieldGroup[] {
  try {
    const parsed = JSON.parse(schema);
    const flattened = flattenSchema(parsed);
    const properties = (flattened.properties || {}) as Record<string, unknown>;
    const required = (flattened.required || []) as string[];

    const groups: Record<string, FieldConfig[]> = {};

    Object.entries(properties).forEach(([key, prop]) => {
      const field = parseFieldConfig(
        key,
        prop as Record<string, unknown>,
        required.includes(key),
        typeLimits,
      );
      const uiOptions = field.uiOptions;
      const explicitGroup =
        uiOptions && typeof uiOptions.group === "string"
          ? uiOptions.group.trim()
          : undefined;
      // Grouping is authored metadata. Fields without an explicit group render flat.
      const groupName = explicitGroup ?? "";
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(field);
    });

    return Object.entries(groups).map(([title, fields], index) => ({
      title,
      fields,
      color: getGroupColor(index),
    }));
  } catch {
    return [];
  }
}

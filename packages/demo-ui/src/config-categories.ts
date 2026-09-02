export const BUILT_IN_CONFIG_CATEGORIES = [
  "设计",
  "动效",
  "音效",
  "视频",
  "其他",
] as const;

interface ConfigCategorySource {
  uiOptions?: Record<string, unknown>;
}

export type ConfigFieldType = "resource" | "business";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCategory(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const category = value.trim();
  return category.length > 0 ? category : undefined;
}

/**
 * 读取配置字段的业务语义。未标注的历史字段按 resource 处理，保持既有页面可用。
 * 生成器可使用 ui:options.configType、$demo.configType 或 x-config-type。
 */
export function getConfigFieldType(field: Record<string, unknown>): ConfigFieldType {
  const uiOptions = isRecord(field["ui:options"]) ? field["ui:options"] : undefined;
  const demo = isRecord(field["$demo"]) ? field["$demo"] : undefined;
  const marker = uiOptions?.configType ?? demo?.configType ?? field["x-config-type"];
  return marker === "business" ? "business" : "resource";
}

/** 查看端只展示资源配置，业务配置仍保留在发布快照中供规则解析。 */
export function stripConfigSchemaByType(
  schema: string | undefined,
  excludedType: ConfigFieldType,
): string | undefined {
  if (!schema) return schema;
  try {
    const root: unknown = JSON.parse(schema);
    if (!isRecord(root)) return schema;
    const walk = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(walk);
      if (!isRecord(value)) return value;
      const next: Record<string, unknown> = { ...value };
      if (isRecord(next.properties)) {
        const properties: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(next.properties)) {
          if (isRecord(prop) && getConfigFieldType(prop) === excludedType) continue;
          properties[key] = walk(prop);
        }
        next.properties = properties;
        if (Array.isArray(next.required)) {
          next.required = next.required.filter((key): key is string => typeof key === "string" && key in properties);
        }
      }
      if ("items" in next) next.items = walk(next.items);
      return next;
    };
    return JSON.stringify(walk(root));
  } catch {
    return schema;
  }
}

/**
 * Remove values whose top-level schema fields carry an excluded semantic type.
 * Unknown fields remain untouched for backwards-compatible embed parameters;
 * published business values are still present in runtime defaults and are not
 * affected by this session-override filter.
 */
export function filterConfigValuesByType(
  schema: string | undefined,
  values: Record<string, unknown>,
  excludedType: ConfigFieldType,
): Record<string, unknown> {
  if (!schema) return { ...values };
  try {
    const parsed: unknown = JSON.parse(schema);
    if (!isRecord(parsed) || !isRecord(parsed.properties)) return { ...values };
    const OMIT = Symbol("omitted-config-value");
    const filterValue = (field: unknown, value: unknown): unknown => {
      if (!isRecord(field)) return value;
      if (getConfigFieldType(field) === excludedType) return OMIT;
      if (Array.isArray(value) && "items" in field) {
        return value
          .map((item) => filterValue(field.items, item))
          .filter((item) => item !== OMIT);
      }
      if (isRecord(value) && isRecord(field.properties)) {
        const nested: Record<string, unknown> = { ...value };
        for (const [key, childValue] of Object.entries(value)) {
          if (!(key in field.properties)) continue;
          const filtered = filterValue(field.properties[key], childValue);
          if (filtered === OMIT) delete nested[key];
          else nested[key] = filtered;
        }
        return nested;
      }
      return value;
    };
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const filtered = filterValue(parsed.properties[key], value);
      if (filtered !== OMIT) result[key] = filtered;
    }
    return result;
  } catch {
    return { ...values };
  }
}

function getSchemaProperties(
  schema?: string,
): Record<string, Record<string, unknown>> {
  if (!schema) return {};
  try {
    const parsed: unknown = JSON.parse(schema);
    if (!isRecord(parsed) || !isRecord(parsed.properties)) return {};
    const properties: Record<string, Record<string, unknown>> = {};
    for (const [key, prop] of Object.entries(parsed.properties)) {
      if (isRecord(prop)) {
        properties[key] = prop;
      }
    }
    return properties;
  } catch {
    return {};
  }
}

function getSchemaPropertyCategory(
  prop: Record<string, unknown>,
): string | undefined {
  const uiOptions = prop["ui:options"];
  if (!isRecord(uiOptions)) return undefined;
  return normalizeCategory(uiOptions.category);
}

export function getConfigFieldCategory(
  field: ConfigCategorySource,
): string | undefined {
  return normalizeCategory(field.uiOptions?.category);
}

export function configFieldMatchesCategoryFilter(
  field: ConfigCategorySource,
  categoryFilter?: string,
): boolean {
  const normalizedFilter = normalizeCategory(categoryFilter);
  if (!normalizedFilter) return true;
  return getConfigFieldCategory(field) === normalizedFilter;
}

export function orderConfigCategories(categories: Iterable<string>): string[] {
  const seen = new Set<string>();
  const normalized = Array.from(categories)
    .map((category) => normalizeCategory(category))
    .filter((category): category is string => !!category)
    .filter((category) => {
      if (seen.has(category)) return false;
      seen.add(category);
      return true;
    });

  const builtIn = BUILT_IN_CONFIG_CATEGORIES.filter((category) =>
    seen.has(category),
  );
  const custom = normalized.filter(
    (category) =>
      !BUILT_IN_CONFIG_CATEGORIES.includes(
        category as (typeof BUILT_IN_CONFIG_CATEGORIES)[number],
      ),
  );

  return [...builtIn, ...custom];
}

export function getSchemaConfigCategories(schema?: string): string[] {
  const properties = getSchemaProperties(schema);
  return orderConfigCategories(
    Object.values(properties)
      .map(getSchemaPropertyCategory)
      .filter((category): category is string => !!category),
  );
}

export function getAvailableConfigCategories(
  schemas: Array<string | undefined>,
): string[] {
  return orderConfigCategories(schemas.flatMap(getSchemaConfigCategories));
}

export function getSchemaFieldCountByCategory(
  schema: string | undefined,
  categoryFilter?: string,
): number {
  const properties = getSchemaProperties(schema);
  const normalizedFilter = normalizeCategory(categoryFilter);
  const entries = Object.values(properties);
  if (!normalizedFilter) return entries.length;
  return entries.filter(
    (prop) => getSchemaPropertyCategory(prop) === normalizedFilter,
  ).length;
}

/**
 * 统计按页面绑定关系生效的项目级配置字段数量。
 * bindings 未提供时表示调用方尚未提供绑定信息，沿用展示全部字段的兼容语义；
 * 显式传入空数组表示该页面不消费项目级配置。
 */
export function getSchemaFieldCountByBindings(
  schema: string | undefined,
  bindings: string[] | undefined,
  categoryFilter?: string,
): number {
  const properties = getSchemaProperties(schema);
  const allowedKeys = bindings === undefined ? undefined : new Set(bindings);
  return Object.entries(properties).filter(([key, property]) => {
    if (allowedKeys && !allowedKeys.has(key)) return false;
    return configFieldMatchesCategoryFilter(
      { uiOptions: property["ui:options"] as Record<string, unknown> | undefined },
      categoryFilter,
    );
  }).length;
}

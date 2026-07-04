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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCategory(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const category = value.trim();
  return category.length > 0 ? category : undefined;
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

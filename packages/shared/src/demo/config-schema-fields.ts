/**
 * A stable, recursive directory of fields declared by a configuration JSON
 * Schema.  Unlike the editor-oriented schema parser this deliberately keeps
 * structural parents, discriminator fields and every nested branch.
 */
export interface SchemaCatalogField {
  /** Stable schema identity. Array indexes are intentionally never included. */
  key: string;
  title: string;
  type: string;
  format?: string;
  uiWidget?: string;
  default?: unknown;
  category?: string;
  uiOptions?: Record<string, unknown>;
  breadcrumbs: string[];
  isConst: boolean;
  constValue?: unknown;
}

type SchemaRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): SchemaRecord {
  return isRecord(value) ? value : {};
}

function properties(value: unknown): Array<[string, SchemaRecord]> {
  const source = record(value);
  return Object.entries(source)
    .filter(([, property]) => isRecord(property))
    .map(([key, property]) => [key, property as SchemaRecord]);
}

function display(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return ""; }
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function variantMarker(variant: SchemaRecord, index: number): { marker: string; label: string } {
  const variantProperties = properties(variant.properties);
  const discriminator = variantProperties.find(([, property]) => property.const !== undefined);
  if (discriminator) {
    const value = display(discriminator[1].const);
    const label = typeof variant.title === "string" && variant.title.trim()
      ? variant.title.trim()
      : value || `分支 ${index + 1}`;
    return {
      marker: `${discriminator[0]}=${value}`,
      label,
    };
  }
  const label = typeof variant.title === "string" && variant.title.trim()
    ? variant.title.trim()
    : `分支 ${index + 1}`;
  return { marker: `oneOf#${index + 1}`, label };
}

function childPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}

function emitProperty(
  result: SchemaCatalogField[],
  key: string,
  property: SchemaRecord,
  parentPath: string,
  breadcrumbs: string[],
): void {
  const path = childPath(parentPath, key);
  const title = typeof property.title === "string" && property.title.trim()
    ? property.title.trim()
    : key;
  const isConst = property.const !== undefined;
  const type = typeof property.type === "string"
    ? property.type
    : isConst
      ? valueType(property.const)
      : "string";
  const uiOptions = isRecord(property["ui:options"])
    ? property["ui:options"] as Record<string, unknown>
    : undefined;
  result.push({
    key: path,
    title,
    type,
    format: typeof property.format === "string" ? property.format : undefined,
    uiWidget: typeof property["ui:widget"] === "string" ? property["ui:widget"] as string : undefined,
    default: property.default !== undefined ? property.default : property.const,
    category: typeof uiOptions?.category === "string" ? uiOptions.category : undefined,
    uiOptions,
    breadcrumbs: [...breadcrumbs, title],
    isConst,
    constValue: isConst ? property.const : undefined,
  });

  for (const [childKey, child] of properties(property.properties)) {
    emitProperty(result, childKey, child, path, [...breadcrumbs, title]);
  }

  const items = record(property.items);
  const itemBranches = Array.isArray(items.oneOf) ? items.oneOf : undefined;
  if (itemBranches?.length) {
    itemBranches.forEach((branch, index) => {
      if (!isRecord(branch)) return;
      const { marker, label } = variantMarker(branch, index);
      const branchPath = `${path}[${marker}]`;
      for (const [childKey, child] of properties(branch.properties)) {
        emitProperty(result, childKey, child, branchPath, [...breadcrumbs, title, label]);
      }
    });
  } else {
    for (const [childKey, child] of properties(items.properties)) {
      emitProperty(result, childKey, child, `${path}[]`, [...breadcrumbs, title, "条目"]);
    }
  }

  const branches = Array.isArray(property.oneOf) ? property.oneOf : undefined;
  branches?.forEach((branch, index) => {
    if (!isRecord(branch)) return;
    const { marker, label } = variantMarker(branch, index);
    for (const [childKey, child] of properties(branch.properties)) {
      emitProperty(result, childKey, child, `${path}[${marker}]`, [...breadcrumbs, title, label]);
    }
  });
}

/** Parse and recursively enumerate all properties. Malformed schemas return an empty directory. */
export function enumerateSchemaFields(schema: string): SchemaCatalogField[] {
  try {
    const parsed = JSON.parse(schema) as unknown;
    if (!isRecord(parsed)) return [];
    const result: SchemaCatalogField[] = [];
    for (const [key, property] of properties(parsed.properties)) {
      emitProperty(result, key, property, "", []);
    }
    // A valid JSON Schema may put the discriminator at the document root
    // instead of under an object property. Preserve branch identity there as
    // well, so two same-named fields cannot collide in the pool.
    const rootBranches = Array.isArray(parsed.oneOf) ? parsed.oneOf : [];
    rootBranches.forEach((branch, index) => {
      if (!isRecord(branch)) return;
      const { marker, label } = variantMarker(branch, index);
      for (const [key, property] of properties(branch.properties)) {
        emitProperty(result, key, property, `[${marker}]`, [label]);
      }
    });
    return result;
  } catch {
    return [];
  }
}

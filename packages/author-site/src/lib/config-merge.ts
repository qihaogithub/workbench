import type { DemoSchema } from "@opencode-workbench/demo-ui";

/**
 * Extract default values from a JSON Schema properties object.
 */
function extractDefaults(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const propObj = prop as Record<string, unknown>;
    if (propObj.default !== undefined) {
      result[key] = propObj.default;
    }
  }
  return result;
}

/**
 * Extract the __order array from schema $demo.orderable or from property keys.
 */
function extractOrder(schema: DemoSchema, propertyKeys: string[]): string[] {
  if (schema.$demo?.orderable && Array.isArray(schema.$demo.orderable)) {
    return schema.$demo.orderable;
  }
  return propertyKeys;
}

/**
 * Merge existing config data with new schema defaults.
 *
 * Rules:
 * - New fields (in schema but not in existing config) → use schema default
 * - Removed fields (in existing config but not in schema) → remove from config
 * - Existing fields still in schema → preserve user value
 * - Field type changed (old value incompatible with new schema type) → use new default
 * - __order metadata always comes from current schema
 */
export function mergeSchemaDefaults(
  existingConfig: Record<string, unknown>,
  newSchemaStr: string,
): Record<string, unknown> {
  let parsedSchema: DemoSchema;
  try {
    parsedSchema = JSON.parse(newSchemaStr) as DemoSchema;
  } catch {
    return { ...existingConfig };
  }

  const properties = (parsedSchema.properties || {}) as Record<string, unknown>;
  const schemaKeys = Object.keys(properties);
  const defaults = extractDefaults(properties);

  const merged: Record<string, unknown> = {};

  // Add all schema fields: use existing value if present and compatible, otherwise use default
  for (const key of schemaKeys) {
    if (key === "__order") continue;

    const propDef = properties[key] as Record<string, unknown>;
    const existingValue = existingConfig[key];

    if (
      existingValue !== undefined &&
      isTypeCompatible(existingValue, propDef)
    ) {
      // Preserve user's existing value
      merged[key] = existingValue;
    } else if (defaults[key] !== undefined) {
      // Use schema default for new or incompatible fields
      merged[key] = defaults[key];
    }
    // If no default and no existing value, skip the field
  }

  // Add __order from schema
  const order = extractOrder(
    parsedSchema,
    schemaKeys.filter((k) => k !== "__order"),
  );
  if (order.length > 0) {
    merged.__order = order;
  }

  // Add __orderH from schema
  if (parsedSchema.$demo?.orderableHorizontal && Array.isArray(parsedSchema.$demo.orderableHorizontal)) {
    merged.__orderH = parsedSchema.$demo.orderableHorizontal;
  }

  // Add __positions from schema
  if (parsedSchema.$demo?.positionable && typeof parsedSchema.$demo.positionable === "object") {
    const posConfig = parsedSchema.$demo.positionable as { items?: string[]; defaults?: Record<string, { x: number; y: number }> };
    if (Array.isArray(posConfig.items)) {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const key of posConfig.items) {
        positions[key] = posConfig.defaults?.[key] || { x: 0, y: 0 };
      }
      merged.__positions = positions;
    }
  }

  return merged;
}

/**
 * Check if an existing value is compatible with a schema property definition.
 */
function isTypeCompatible(
  value: unknown,
  propDef: Record<string, unknown>,
): boolean {
  if (value === undefined || value === null) return false;

  const schemaType = propDef.type as string | undefined;
  if (!schemaType) return true; // No type constraint, assume compatible

  switch (schemaType) {
    case "string":
      return typeof value === "string";
    case "number":
    case "integer":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    default:
      return true; // Unknown type, assume compatible
  }
}

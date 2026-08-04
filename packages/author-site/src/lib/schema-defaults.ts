export function extractSchemaDefaults(
  schemaContent: string,
): Record<string, unknown> {
  try {
    const schema = JSON.parse(schemaContent) as {
      properties?: Record<string, unknown>;
    };
    return schema.properties && typeof schema.properties === "object"
      ? extractDefaultsRecursive(
          schema.properties as Record<string, unknown>,
        )
      : {};
  } catch {
    return {};
  }
}

function extractDefaultsRecursive(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== "object") continue;
    const obj = prop as Record<string, unknown>;

    if (obj.default !== undefined) {
      defaults[key] = obj.default;
    }

    if (obj.properties && typeof obj.properties === "object") {
      const nested = extractDefaultsRecursive(
        obj.properties as Record<string, unknown>,
      );
      if (Object.keys(nested).length > 0) {
        const existing = defaults[key];
        if (existing !== undefined && typeof existing === "object" && !Array.isArray(existing)) {
          defaults[key] = { ...(existing as Record<string, unknown>), ...nested };
        } else if (existing === undefined) {
          defaults[key] = nested;
        }
      }
    }
  }
  return defaults;
}